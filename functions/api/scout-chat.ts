import type { SearchActiveDealItemsOptions } from '../_shared/dealItemStore'
import {
  DEEPSEEK_FALLBACK_MODEL,
  isOpenAICreditExhausted,
  openAITextPayload,
  runDeepSeekFallback,
  type DeepSeekFallbackRequest,
} from '../_shared/deepSeekFallback'
import { readLeafletSnapshot } from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberPlan } from '../../src/data/memberPlans'
import type { DiscoveredDeal } from '../../src/types'
import {
  getMemberBasket,
  getMemberSession,
  listSavedDeals,
  listSavedSources,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import {
  buildScoutContext,
  extractScoutSearchTerms,
  mapScoutAnswer,
  normalizeScoutChatRequest,
  parseScoutModelAnswer,
  scoutAnswerSchema,
  type ScoutContextDeal,
  type ScoutPersonalContextInput,
} from '../_shared/scoutChat'
import { parseProductQuery } from '../_shared/productQuery'
import { buildScoutPersona } from '../_shared/scoutPersona'
import {
  logScoutRetrieval,
  type ScoutRetrievalLogInput,
} from '../_shared/scoutRetrievalLog'
import {
  retrieveProducts,
  toScoutDealCards,
  type ProductRetrievalResult,
} from '../_shared/scoutRetrieval'
import { getMemberState, listWindowSaves } from '../_shared/windowSocialStore'
import type { StoreLeaflet } from '../../src/types'
import type { MemberPlanId } from '../../src/types'
import { readVisibleMarketplaceDeals } from './discovery'
import {
  buildGroceryPlan,
  parseGroceryPlanRequest,
} from '../_shared/groceryPlanner'
import {
  buildScoutCartAction,
  hasCartIntent,
  namedRetailerId,
} from '../_shared/scoutCartAction'
import {
  parseMarketplaceProductQuery,
  rankMarketplaceProductDeals,
  type MarketplaceProductQuery,
} from '../_shared/marketplaceProductSearch'
import {
  parseScoutSearchIntent,
  productQueryFromIntent,
  scoutSearchIntentSchema,
  type ScoutSearchIntent,
} from '../_shared/scoutSearchIntent'

const MODEL = 'gpt-5.4-mini'
const MAX_REQUESTS_PER_MINUTE = 20
const privateHeaders = { 'cache-control': 'private, no-store' }

interface ScoutSession {
  account?: {
    countryCode?: string
    currencyCode?: string
    id: string
    planId?: MemberPlanId
    role?: 'admin' | 'member'
  }
  isAuthenticated: boolean
}

interface ScoutChatContext {
  env: TrolleyScoutEnv
  request: Request
}

interface ScoutIntentRequest {
  countryCode: string
  currencyCode: string
  history: Array<{ role: 'assistant' | 'user'; text: string }>
  message: string
}

export interface ScoutChatDependencies {
  fetchOpenAI: (request: Request) => Promise<Response>
  getSession: (env: TrolleyScoutEnv, request: Request) => Promise<ScoutSession>
  incrementUsage: (env: TrolleyScoutEnv, accountId: string, now?: Date) => Promise<number>
  interpretSearchIntent: (
    env: TrolleyScoutEnv,
    input: ScoutIntentRequest,
  ) => Promise<ScoutSearchIntent | undefined>
  listDeals: (
    env: TrolleyScoutEnv,
    options: SearchActiveDealItemsOptions & {
      accountId: string
      planId: MemberPlanId
      productQuery?: MarketplaceProductQuery
    },
  ) => Promise<ScoutContextDeal[]>
  listLeaflets: (env: TrolleyScoutEnv, countryCode: string) => Promise<StoreLeaflet[]>
  loadPersonalContext: (
    env: TrolleyScoutEnv,
    accountId: string,
  ) => Promise<ScoutPersonalContextInput>
  logRetrieval: (
    env: TrolleyScoutEnv,
    input: ScoutRetrievalLogInput,
  ) => Promise<string | undefined>
  retrieveProducts: (
    message: string,
    retailerId?: string,
  ) => Promise<ProductRetrievalResult>
  runDeepSeek: (
    env: TrolleyScoutEnv,
    request: DeepSeekFallbackRequest,
  ) => Promise<string>
}

const defaultDependencies: ScoutChatDependencies = {
  fetchOpenAI: (request) => fetch(request),
  getSession: getMemberSession,
  incrementUsage: incrementScoutChatUsage,
  interpretSearchIntent: requestScoutSearchIntent,
  listDeals: async (env, options) => {
    const visibleDeals = await readVisibleMarketplaceDeals(env, {
      accountId: options.accountId,
      countryCode: options.countryCode,
      planId: options.planId,
    })
    return options.productQuery
      ? rankMarketplaceProductDeals(
          visibleDeals,
          options.productQuery,
          options.limit ?? 120,
        ).deals
      : searchMarketplaceDeals(
          visibleDeals,
          options.searchTerms,
          options.limit ?? 120,
        )
  },
  listLeaflets: async (env, countryCode) =>
    ((await readLeafletSnapshot(env))?.leaflets ?? [])
      .filter((leaflet) => (leaflet.countryCode ?? 'ZA').toUpperCase() === countryCode),
  loadPersonalContext: loadScoutPersonalContext,
  logRetrieval: logScoutRetrieval,
  retrieveProducts: (message, retailerId) =>
    retrieveProducts(message, retailerId ? { retailerIds: [retailerId] } : {}),
  runDeepSeek: runDeepSeekFallback,
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
  if (!env.OPENAI_API_KEY && !env.AI) {
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
  const groceryRequest = parseGroceryPlanRequest(input.message)
  const personalOfferRequest = isPersonalOfferRequest(input.message)
  // "Add basmati rice to my picknpay cart" is a shopping request even when the
  // grocery planner also recognises it: without a live shelf search the only
  // basmati rice Mr Scout can see is basmati rice that happens to be on
  // special, so it tells the shopper the shop does not stock it.
  const cartIntent = hasCartIntent(input.message)
  const namedRetailer = namedRetailerId(input.message)
  const shopping = (!groceryRequest && !personalOfferRequest) || cartIntent
  // The deterministic reader recognises most of what shoppers ask for at no
  // cost, so "50 inch television" costs one model call rather than two. It
  // cannot fix a typo or place an unfamiliar product though — "teh cheapest
  // airforce sneaker" needs the model — so an unrecognised product still buys
  // the intent call.
  const localQuery = shopping ? parseProductQuery(input.message) : undefined
  const interpretedSearchIntent = shopping && localQuery?.category === 'unknown'
    ? await dependencies.interpretSearchIntent(env, {
        countryCode,
        currencyCode,
        history: input.history,
        message: input.message,
      }).catch(() => undefined)
    : undefined
  const productQuery = !shopping
    ? undefined
    : interpretedSearchIntent
      ? productQueryFromIntent(interpretedSearchIntent)
      : parseMarketplaceProductQuery(input.message)
  const searchTerms = groceryRequest
    ? []
    : productQuery?.productTerms ??
      (interpretedSearchIntent ? [] : extractScoutSearchTerms(input.message))
  const planId = session.account.role === 'admin'
    ? 'organization'
    : session.account.planId ?? 'free'
  const planLimits = getMemberPlan(planId).limits
  const visibilityLimit = planLimits.visibleDeals
  // The Marketplace holds what we have already collected; the live sweep
  // reaches the shelves we have not. A 50 inch television is rarely on
  // promotion, so it exists in the second and not the first.
  const [deals, leaflets, personalContext, retrieval] = await Promise.all([
    dependencies.listDeals(env, {
      accountId: session.account.id,
      countryCode,
      planId,
      productQuery,
      searchTerms,
      limit: groceryRequest ? 200 : 120,
      visibilityLimit,
    }).catch(() => []),
    dependencies.listLeaflets(env, countryCode)
      .then((items) => items.slice(0, planLimits.visibleCatalogues))
      .catch(() => []),
    dependencies.loadPersonalContext(env, session.account.id)
      .then((context) => personalContextForRequest(input.message, context))
      .catch(() => ({})),
    shopping
      ? dependencies
          // Pointed at the shop the shopper named, so the answer is about
          // that shop's shelf rather than whichever retailer replied first.
          .retrieveProducts(input.message, namedRetailer)
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ])
  const rankedProductResult = productQuery
    ? rankMarketplaceProductDeals(deals, productQuery, 120)
    : undefined
  const visibleDeals = rankedProductResult?.deals ?? deals
  const marketplaceContext = buildScoutContext(
    visibleDeals,
    leaflets,
    currencyCode,
    personalContext,
    { preserveDealOrder: Boolean(productQuery) },
  )
  const liveCards = retrieval ? toScoutDealCards(retrieval.candidates, currencyCode) : []
  const liveCardIds = new Set(liveCards.map((card) => card.id))
  // Live shelf prices lead, so the model reaches for a current price before an
  // older promotion.
  const scoutContext = {
    ...marketplaceContext,
    deals: [...liveCards, ...marketplaceContext.deals],
  }

  // A named product with nothing but Marketplace hits is answered straight
  // from the Marketplace, as before. When the live sweep found something the
  // Marketplace does not carry, the conversation continues to the model so
  // Mr Scout can talk about it rather than return a canned line.
  if (
    interpretedSearchIntent?.kind === 'product' &&
    productQuery &&
    rankedProductResult &&
    liveCards.length === 0
  ) {
    const marketplaceIds = new Set(visibleDeals.map((deal) => deal.id))
    const productDeals = marketplaceContext.deals
      .filter((deal) => marketplaceIds.has(deal.id))
      .slice(0, 6)
    return json(
      {
        answer: {
          catalogues: [],
          deals: productDeals,
          followUps: [],
          reply: marketplaceProductReply(
            productQuery,
            productDeals.length,
            rankedProductResult.exactPackAvailable,
          ),
        },
        model: MODEL,
      },
      { headers: privateHeaders },
    )
  }
  const persona = buildScoutPersona({
    countryCode,
    currencyCode,
    hasLiveProducts: liveCards.length > 0,
    today: new Date().toISOString().slice(0, 10),
  })
  const verifiedContext = `Verified shopping context:\n${JSON.stringify(scoutContext)}`
  const openAIRequest = new Request('https://api.openai.com/v1/responses', {
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'low' },
      max_output_tokens: 1_200,
      store: false,
      input: [
        {
          role: 'developer',
          content: persona,
        },
        {
          role: 'developer',
          content: verifiedContext,
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
      authorization: `Bearer ${env.OPENAI_API_KEY ?? ''}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  })

  let modelPayload: unknown
  let modelUsed = MODEL
  if (env.OPENAI_API_KEY) {
    let openAIResponse: Response
    try {
      openAIResponse = await dependencies.fetchOpenAI(openAIRequest)
    } catch {
      return json(
        { error: 'Mr Scout could not connect. Try again.' },
        { headers: privateHeaders, status: 502 },
      )
    }

    if (openAIResponse.ok) {
      modelPayload = await openAIResponse.json().catch(() => undefined)
    } else if (
      env.AI &&
      await isOpenAICreditExhausted(openAIResponse)
    ) {
      try {
        modelPayload = openAITextPayload(await dependencies.runDeepSeek(env, {
          jsonSchema: scoutAnswerSchema,
          maxTokens: 1_200,
          messages: [
            {
              content: `${persona}\nReturn only JSON matching the supplied schema.`,
              role: 'system',
            },
            { content: verifiedContext, role: 'system' },
            ...input.history.map((turn) => ({
              content: turn.text,
              role: turn.role,
            })),
            { content: input.message, role: 'user' },
          ],
        }))
        modelUsed = DEEPSEEK_FALLBACK_MODEL
      } catch {
        return json(
          { error: 'Mr Scout could not answer right now.' },
          { headers: privateHeaders, status: 502 },
        )
      }
    } else {
      return json(
        { error: openAIResponse.status === 429
          ? 'Mr Scout is busy. Try again shortly.'
          : 'Mr Scout could not answer right now.' },
        { headers: privateHeaders, status: openAIResponse.status === 429 ? 429 : 502 },
      )
    }
  } else {
    try {
      modelPayload = openAITextPayload(await dependencies.runDeepSeek(env, {
        jsonSchema: scoutAnswerSchema,
        maxTokens: 1_200,
        messages: [
          {
            content: `${persona}\nReturn only JSON matching the supplied schema.`,
            role: 'system',
          },
          { content: verifiedContext, role: 'system' },
          ...input.history.map((turn) => ({
            content: turn.text,
            role: turn.role,
          })),
          { content: input.message, role: 'user' },
        ],
      }))
      modelUsed = DEEPSEEK_FALLBACK_MODEL
    } catch {
      return json(
        { error: 'Mr Scout could not connect. Try again.' },
        { headers: privateHeaders, status: 502 },
      )
    }
  }

  try {
    const modelAnswer = parseScoutModelAnswer(modelPayload)
    const answer = mapScoutAnswer(modelAnswer, scoutContext)
    if (groceryRequest) {
      answer.groceryPlan = buildGroceryPlan(input.message, visibleDeals, currencyCode)
      const itemCount = answer.groceryPlan.items.length
      answer.reply = itemCount > 0
        ? `I built a temporary grocery list with ${itemCount} ${itemCount === 1 ? 'item' : 'items'} from ${answer.groceryPlan.storeCount} ${answer.groceryPlan.storeCount === 1 ? 'store' : 'stores'}. Review the quantities, assumptions, promotions, and missing groups before transferring anything to your main basket.`
        : 'I could not build a grocery list from the current in-stock deals. The grocery list shows the missing groups so you can adjust the request.'
    }
    if (productQuery && rankedProductResult) {
      const marketplaceIds = new Set(visibleDeals.map((deal) => deal.id))
      // A live shelf result is as trustworthy as a Marketplace one, so the
      // guard against invented cards must let both through — filtering to
      // Marketplace ids alone would drop every live find on the floor.
      const trusted = (id: string) => marketplaceIds.has(id) || liveCardIds.has(id)
      answer.deals = answer.deals.filter((deal) => trusted(deal.id))
      if (productQuery.requestedPackGrams !== undefined || answer.deals.length === 0) {
        answer.deals = scoutContext.deals.filter((deal) => trusted(deal.id)).slice(0, 6)
        // The canned Marketplace line only makes sense when the answer really
        // is Marketplace-only; otherwise Mr Scout's own words are kept.
        if (liveCards.length === 0) {
          answer.reply = marketplaceProductReply(
            productQuery,
            answer.deals.length,
            rankedProductResult.exactPackAvailable,
          )
        }
      }
    } else if (
      searchTerms.length > 0 &&
      answer.deals.length === 0 &&
      visibleDeals.length > 0
    ) {
      const marketplaceIds = new Set(visibleDeals.map((deal) => deal.id))
      answer.deals = scoutContext.deals
        .filter((deal) => marketplaceIds.has(deal.id) || liveCardIds.has(deal.id))
        .slice(0, 6)
      if (liveCards.length === 0) {
        answer.reply = matchingDealsReply(answer.deals.length, searchTerms)
      }
    }

    // "Add the cheapest braai pack to my picknpay cart" is a job, not a
    // question. Attaching the product the answer settled on is what lets the
    // app hand it to the agent instead of telling the shopper to do it.
    const cartAction = buildScoutCartAction(input.message, answer.deals)
    if (cartAction) answer.cartAction = cartAction

    // Logging must never cost the shopper their answer.
    const retrievalId = retrieval
      ? await dependencies.logRetrieval(env, {
          accountId: session.account.id,
          queryText: input.message,
          retrieval,
          shownCount: answer.deals.length,
        }).catch(() => undefined)
      : undefined

    return json(
      {
        answer,
        model: modelUsed,
        retrievalId,
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

export function searchMarketplaceDeals(
  deals: readonly DiscoveredDeal[],
  searchTerms: readonly string[],
  limit = 120,
): DiscoveredDeal[] {
  const terms = Array.from(new Set(
    searchTerms
      .map((term) => term.normalize('NFKC').trim().toLowerCase())
      .filter((term) => term.length >= 2),
  ))
  const phrase = terms.join(' ')
  const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)))

  return deals
    .map((deal, index) => ({
      deal,
      index,
      searchText: [
        deal.title,
        deal.evidenceText,
        deal.retailerName,
        deal.sourceLabel,
      ].join(' ').normalize('NFKC').toLowerCase(),
      title: deal.title.normalize('NFKC').toLowerCase(),
    }))
    .filter(({ searchText }) => terms.every((term) => searchText.includes(term)))
    .sort((a, b) => {
      const aRank = a.title.startsWith(phrase) ? 0 : a.title.includes(phrase) ? 1 : 2
      const bRank = b.title.startsWith(phrase) ? 0 : b.title.includes(phrase) ? 1 : 2
      return aRank - bRank || a.index - b.index
    })
    .slice(0, boundedLimit)
    .map(({ deal }) => deal)
}

function matchingDealsReply(matchCount: number, searchTerms: string[]): string {
  const item = searchTerms.join(' ')
  return `I found ${matchCount} current ${item} ${matchCount === 1 ? 'deal' : 'deals'} in Marketplace. Prices and stock can change, so check the retailer before buying.`
}

function marketplaceProductReply(
  query: MarketplaceProductQuery,
  matchCount: number,
  exactPackAvailable: boolean,
): string {
  const product = query.productName ?? query.productTerms.join(' ')
  if (matchCount === 0) {
    const pack = query.requestedPackText ? ` in a ${query.requestedPackText} pack` : ''
    return `I could not find current ${product}${pack} in your visible Marketplace deals. Try another pack size or check again when retailers update their offers.`
  }
  if (query.requestedPackText && !exactPackAvailable) {
    return `No current ${query.requestedPackText} ${product} deal is available in your visible Marketplace results. These are the closest available ${product} pack sizes, ordered by pack-size match and valid price. Prices and stock can change.`
  }
  const pack = query.requestedPackText ? `${query.requestedPackText} ` : ''
  const ordering = query.sort === 'price-asc' ? ' with the lowest valid prices first' : ''
  return `I found ${matchCount} current Marketplace ${matchCount === 1 ? 'deal' : 'deals'} for ${pack}${product}${ordering}. Prices and stock can change, so check the retailer before buying.`
}

function isPersonalOfferRequest(message: string): boolean {
  const normalized = message.normalize('NFKC').toLowerCase()
  return /\b(?:my\s+)?(?:basket|saved|saves|favourites?|favorites?|followed|window\s+shopping|properties)\b/u
    .test(normalized)
}

function personalContextForRequest(
  message: string,
  context: ScoutPersonalContextInput,
): ScoutPersonalContextInput {
  if (isPersonalOfferRequest(message)) return context
  return {
    favouriteStores: context.favouriteStores,
    followedStores: context.followedStores,
  }
}

export async function requestScoutSearchIntent(
  env: TrolleyScoutEnv,
  input: ScoutIntentRequest,
  fetcher: typeof fetch = fetch,
): Promise<ScoutSearchIntent> {
  if (!env.OPENAI_API_KEY) {
    throw new TypeError('Mr Scout search intent needs an OpenAI API key.')
  }
  const response = await fetcher(new Request('https://api.openai.com/v1/responses', {
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'low' },
      max_output_tokens: 300,
      store: false,
      input: [
        {
          role: 'developer',
          content: [
            'Extract the shopper’s retrieval intent before Marketplace search.',
            `The shopper is in ${input.countryCode} and uses ${input.currencyCode}.`,
            'Classify product requests as product. Use catalogue, personal, property, or general for other requests.',
            'For a product, correct obvious spelling and spacing errors using shopping context.',
            'Keep brand, model, product type, variant, material, colour, gender, size, and other requested qualifiers when they identify the item.',
            'productName must be a concise corrected product noun phrase, without request words, store instructions, or price language.',
            'productTerms must contain normalized title-matching terms in singular form where sensible.',
            'Use price-asc for cheapest, cheap, affordable, lowest-price, or equivalent requests. Otherwise use relevance.',
            'Extract a requested grocery pack into grams when stated. Use null when no pack is stated.',
            'Never invent a product that the shopper did not request.',
          ].join('\n'),
        },
        ...input.history.slice(-4).map((turn) => ({
          role: turn.role,
          content: turn.text,
        })),
        { role: 'user', content: input.message },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'mr_scout_search_intent',
          strict: true,
          schema: scoutSearchIntentSchema,
        },
      },
    }),
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
  }))
  if (!response.ok) {
    throw new TypeError(`Mr Scout search intent failed with ${response.status}.`)
  }
  return parseScoutSearchIntent(await response.json())
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

