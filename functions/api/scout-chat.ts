import { listActiveDealItems, type StoredDealItem } from '../_shared/dealItemStore'
import { readLeafletSnapshot } from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import {
  getMemberBasket,
  getMemberSession,
  listSavedDeals,
  listSavedSources,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import {
  buildScoutContext,
  mapScoutAnswer,
  normalizeScoutChatRequest,
  parseScoutModelAnswer,
  scoutAnswerSchema,
  type ScoutPersonalContextInput,
} from '../_shared/scoutChat'
import { buildScoutPersona } from '../_shared/scoutPersona'
import {
  retrieveProducts,
  toScoutDealCards,
  type ProductRetrievalResult,
} from '../_shared/scoutRetrieval'
import { getMemberState, listWindowSaves } from '../_shared/windowSocialStore'
import type { StoreLeaflet } from '../../src/types'

const MODEL = 'gpt-5.4-mini'
const MAX_REQUESTS_PER_MINUTE = 20
const privateHeaders = { 'cache-control': 'private, no-store' }

interface ScoutSession {
  account?: {
    countryCode?: string
    currencyCode?: string
    id: string
  }
  isAuthenticated: boolean
}

interface ScoutChatContext {
  env: TrolleyScoutEnv
  request: Request
}

export interface ScoutChatDependencies {
  fetchOpenAI: (request: Request) => Promise<Response>
  getSession: (env: TrolleyScoutEnv, request: Request) => Promise<ScoutSession>
  incrementUsage: (env: TrolleyScoutEnv, accountId: string, now?: Date) => Promise<number>
  listDeals: (env: TrolleyScoutEnv, countryCode: string) => Promise<StoredDealItem[]>
  listLeaflets: (env: TrolleyScoutEnv) => Promise<StoreLeaflet[]>
  loadPersonalContext: (
    env: TrolleyScoutEnv,
    accountId: string,
  ) => Promise<ScoutPersonalContextInput>
  retrieveProducts: (message: string) => Promise<ProductRetrievalResult>
}

const defaultDependencies: ScoutChatDependencies = {
  fetchOpenAI: (request) => fetch(request),
  getSession: getMemberSession,
  incrementUsage: incrementScoutChatUsage,
  listDeals: (env, countryCode) => listActiveDealItems(env, {
    countryCode,
    limit: 120,
  }),
  listLeaflets: async (env) => (await readLeafletSnapshot(env))?.leaflets ?? [],
  loadPersonalContext: loadScoutPersonalContext,
  retrieveProducts: (message) => retrieveProducts(message),
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) =>
  handleScoutChat({ env, request })

export async function handleScoutChat(
  context: ScoutChatContext,
  dependencies: ScoutChatDependencies = defaultDependencies,
): Promise<Response> {
  const { env, request } = context
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const session = await dependencies.getSession(env, request)
  if (!session.isAuthenticated || !session.account) {
    return json(
      { error: 'Log in to chat with Mr Scout.' },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (!env.DB) {
    return json(
      { error: 'Mr Scout is temporarily unavailable.' },
      { headers: privateHeaders, status: 503 },
    )
  }
  if (!env.OPENAI_API_KEY) {
    return json(
      { error: 'Mr Scout is not configured yet.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  let input: ReturnType<typeof normalizeScoutChatRequest>
  try {
    input = normalizeScoutChatRequest(await request.json())
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Chat input is invalid.' },
      { headers: privateHeaders, status: 422 },
    )
  }

  const requestCount = await dependencies.incrementUsage(env, session.account.id)
  if (requestCount > MAX_REQUESTS_PER_MINUTE) {
    return json(
      { error: 'Mr Scout is receiving too many messages. Try again in a minute.' },
      {
        headers: { ...privateHeaders, 'retry-after': '60' },
        status: 429,
      },
    )
  }

  const countryCode = normalizedCountryCode(session.account.countryCode)
  const currencyCode = normalizedCurrencyCode(session.account.currencyCode)
  // Retrieval runs alongside the stored context. Mr Scout used to see only the
  // most recent promotions, so anything not currently on special — a 50 inch
  // television, say — was invisible to him no matter what the shopper asked.
  const [deals, leaflets, personalContext, retrieval] = await Promise.all([
    dependencies.listDeals(env, countryCode).catch(() => []),
    dependencies.listLeaflets(env).catch(() => []),
    dependencies.loadPersonalContext(env, session.account.id).catch(() => ({})),
    dependencies.retrieveProducts(input.message).catch(() => undefined),
  ])

  const storedContext = buildScoutContext(deals, leaflets, currencyCode, personalContext)
  const liveCards = retrieval ? toScoutDealCards(retrieval.candidates, currencyCode) : []
  // Live store hits lead the context so the model reaches for a real, current
  // price before an older promotion.
  const scoutContext = { ...storedContext, deals: [...liveCards, ...storedContext.deals] }
  const openAIRequest = new Request('https://api.openai.com/v1/responses', {
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'low' },
      max_output_tokens: 1_200,
      store: false,
      input: [
        {
          role: 'developer',
          content: buildScoutPersona({
            countryCode,
            currencyCode,
            hasLiveProducts: liveCards.length > 0,
            today: new Date().toISOString().slice(0, 10),
          }),
        },
        {
          role: 'developer',
          content: `Verified shopping context:\n${JSON.stringify(scoutContext)}`,
        },
        ...input.history.map((turn) => ({ role: turn.role, content: turn.text })),
        { role: 'user', content: input.message },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'mr_scout_answer',
          strict: true,
          schema: scoutAnswerSchema,
        },
      },
    }),
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  })

  let openAIResponse: Response
  try {
    openAIResponse = await dependencies.fetchOpenAI(openAIRequest)
  } catch {
    return json(
      { error: 'Mr Scout could not connect. Try again.' },
      { headers: privateHeaders, status: 502 },
    )
  }

  if (!openAIResponse.ok) {
    return json(
      { error: openAIResponse.status === 429
        ? 'Mr Scout is busy. Try again shortly.'
        : 'Mr Scout could not answer right now.' },
      { headers: privateHeaders, status: openAIResponse.status === 429 ? 429 : 502 },
    )
  }

  try {
    const modelAnswer = parseScoutModelAnswer(await openAIResponse.json())
    return json(
      {
        answer: mapScoutAnswer(modelAnswer, scoutContext),
        model: MODEL,
      },
      { headers: privateHeaders },
    )
  } catch {
    return json(
      { error: 'Mr Scout returned an unreadable answer. Try again.' },
      { headers: privateHeaders, status: 502 },
    )
  }
}

export async function loadScoutPersonalContext(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<ScoutPersonalContextInput> {
  const safe = async <T>(work: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work
    } catch {
      return fallback
    }
  }

  const [
    basket,
    favouriteStores,
    followedStores,
    recentPropertySearches,
    savedDeals,
    savedProperties,
    windowShoppingSaves,
  ] = await Promise.all([
    safe(getMemberBasket(env, accountId), {
      items: [],
      summary: {
        itemCount: 0,
        knownPriceItemCount: 0,
        savingsCents: 0,
        totalCents: 0,
      },
    }),
    safe(getMemberState(env, accountId, 'favourite_stores_v1'), []),
    safe(listSavedSources(env, accountId), []),
    safe(getMemberState(env, accountId, 'recent_property_searches_v1'), []),
    safe(listSavedDeals(env, accountId), []),
    safe(getMemberState(env, accountId, 'saved_properties_v1'), []),
    safe(listWindowSaves(env, accountId), []),
  ])

  return {
    basket,
    favouriteStores,
    followedStores,
    recentPropertySearches,
    savedDeals,
    savedProperties,
    windowShoppingSaves,
  }
}

export async function incrementScoutChatUsage(
  env: TrolleyScoutEnv,
  accountId: string,
  now = new Date(),
): Promise<number> {
  if (!env.DB) {
    throw new TypeError('Mr Scout usage tracking needs the database.')
  }

  const windowStartedAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString()
  const row = await env.DB.prepare(
    `INSERT INTO scout_chat_usage (
      account_id, window_started_at, request_count, updated_at
    ) VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (account_id, window_started_at) DO UPDATE SET
      request_count = scout_chat_usage.request_count + 1,
      updated_at = CURRENT_TIMESTAMP
    RETURNING request_count`,
  )
    .bind(accountId, windowStartedAt)
    .first<{ request_count: number }>()

  return Number(row?.request_count ?? 1)
}

function normalizedCountryCode(value: string | undefined): string {
  const code = value?.trim().toUpperCase() ?? ''
  return /^[A-Z]{2}$/.test(code) ? code : 'ZA'
}

function normalizedCurrencyCode(value: string | undefined): string {
  const code = value?.trim().toUpperCase() ?? ''
  return /^[A-Z]{3}$/.test(code) ? code : 'ZAR'
}
