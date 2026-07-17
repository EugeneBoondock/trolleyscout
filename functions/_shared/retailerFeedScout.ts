import { parseBuildersFeed } from '../../src/services/retailerFeeds/builders'
import { parseClicksFeed } from '../../src/services/retailerFeeds/clicks'
import { parseDischemFeed } from '../../src/services/retailerFeeds/dischem'
import { parseFoodLoversFeed } from '../../src/services/retailerFeeds/foodLovers'
import {
  decodeMakroInitialState,
  parseMakroFeed,
} from '../../src/services/retailerFeeds/makro'
import { parseMassmartFeed } from '../../src/services/retailerFeeds/massmart'
import { parseWoolworthsFeed } from '../../src/services/retailerFeeds/woolworths'
import {
  retailerSlug,
  type FeedCursor,
  type RetailerCatalogueRecord,
  type RetailerDealScope,
  type RetailerFeedPage,
  type RetailerSlug,
} from '../../src/services/retailerFeeds/types'
import type { StoreLeaflet } from '../../src/types'
import {
  readSourceCursor,
  upsertDealItems,
  writeSourceCursor,
} from './dealItemStore'
import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

const PAGE_SIZE = 100
const DEFAULT_REQUEST_CAP = 10
const MAX_REQUEST_CAP = 10
const DEFAULT_TIMEOUT_MS = 12_000
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_RESPONSE_BYTES = 4 * 1024 * 1024
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024
const MAX_CANDIDATES_PER_RUN = 100
const INITIAL_STATE_MARKER = 'window.__INITIAL_STATE__'
const WINDOW_CURSOR_PREFIX = 'trolley-scout:candidate-window:v1:'

const BROWSER_HEADERS = {
  accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

export interface RetailerFeedRequest {
  init?: RequestInit
  url: string
}

export interface RetailerFeedParseInput {
  capturedAt: string
  cursor: FeedCursor
  payload: unknown
  sourceUrl: string
}

export interface RetailerFeedSource {
  buildRequest: (cursor: FeedCursor) => RetailerFeedRequest
  decode: (body: string) => unknown
  initialCursor: FeedCursor
  key: string
  parse: (input: RetailerFeedParseInput) => RetailerFeedPage
  retailerId: RetailerSlug
  retailerName: string
  sourceLabel: string
  sourceUrl: string
}

export interface RetailerFeedScoutStorage {
  readSourceCursor: typeof readSourceCursor
  upsertDealItems: typeof upsertDealItems
  writeSourceCursor: typeof writeSourceCursor
}

export interface RetailerFeedScoutOptions {
  fetcher?: typeof fetch
  now?: () => string
  requestCap?: number
  responseByteLimit?: number
  sources?: readonly RetailerFeedSource[]
  storage?: RetailerFeedScoutStorage
  timeoutMs?: number
}

export interface RetailerFeedSourceMetric {
  acceptedDealCount: number
  catalogueCount: number
  errorText?: string
  key: string
  status: 'failed' | 'success'
}

export interface RetailerFeedScoutResult {
  acceptedDealCount: number
  catalogueCount: number
  catalogues: StoreLeaflet[]
  checkedSourceCount: number
  databaseAvailable: boolean
  failedSourceCount: number
  physicalRequestCount: number
  sources: RetailerFeedSourceMetric[]
}

interface CandidateWindowCursor {
  fingerprint: string
  nextCandidateOffset: number
  sourceCursor: FeedCursor
  version: 1
}

const defaultStorage: RetailerFeedScoutStorage = {
  readSourceCursor,
  upsertDealItems,
  writeSourceCursor,
}

const structuredSources: readonly RetailerFeedSource[] = [
  {
    buildRequest(cursor) {
      const offset = requireCursor(cursor, 'offset')
      const page = Math.floor(offset / PAGE_SIZE) + 1
      const url = new URL('https://www.woolworths.co.za/browse/food-south-africa/all-savings')
      url.searchParams.set('page', String(page))
      url.searchParams.set('num_results_per_page', String(PAGE_SIZE))
      return { init: { headers: BROWSER_HEADERS }, url: url.toString() }
    },
    decode: decodeWoolworthsInitialState,
    initialCursor: { kind: 'offset', offset: 0 },
    key: 'woolworths::all-savings',
    parse({ capturedAt, cursor, payload, sourceUrl }) {
      const offset = requireCursor(cursor, 'offset')
      return parseWoolworthsFeed(payload, {
        capturedAt,
        offset,
        pageSize: PAGE_SIZE,
        sourceUrl,
      })
    },
    retailerId: retailerSlug('woolworths'),
    retailerName: 'Woolworths',
    sourceLabel: 'All savings',
    sourceUrl: 'https://www.woolworths.co.za/browse/food-south-africa/all-savings',
  },
  {
    buildRequest(cursor) {
      const page = requireCursor(cursor, 'page')
      const url = new URL('https://clicks.co.za/products/c/OH1/results')
      url.searchParams.set('q', ':relevance:promoStickerplp:1')
      url.searchParams.set('page', String(page))
      return { init: { headers: BROWSER_HEADERS }, url: url.toString() }
    },
    decode: decodeClicksPromotions,
    initialCursor: { kind: 'page', page: 0 },
    key: 'clicks::promotion-products',
    parse({ capturedAt, payload, sourceUrl }) {
      return parseClicksFeed(payload, { capturedAt, sourceUrl })
    },
    retailerId: retailerSlug('clicks'),
    retailerName: 'Clicks',
    sourceLabel: 'Promotion products',
    sourceUrl: 'https://clicks.co.za/specials',
  },
  {
    buildRequest() {
      return {
        init: {
          body: new URLSearchParams({ action: 'get_specials' }).toString(),
          headers: {
            ...BROWSER_HEADERS,
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          method: 'POST',
        },
        url: 'https://foodloversmarket.co.za/wp-admin/admin-ajax.php',
      }
    },
    decode: (body) => body,
    initialCursor: { kind: 'page', page: 0 },
    key: 'food-lovers::specials',
    parse({ capturedAt, payload, sourceUrl }) {
      return parseFoodLoversFeed(payload, { capturedAt, sourceUrl })
    },
    retailerId: retailerSlug('food-lovers'),
    retailerName: 'Food Lovers Market',
    sourceLabel: 'Current specials',
    sourceUrl: 'https://foodloversmarket.co.za/specials/',
  },
  gameSource('game::bundle-deals', 'Bundle deals', ':relevance:promotions:Bundle+Deals'),
  gameSource('game::savings', 'Savings', ':relevance:promotions:Savings'),
  buildersSource(),
  makroSource(),
  dischemSource(),
]

export function getStructuredRetailerSources(): readonly RetailerFeedSource[] {
  return structuredSources
}

export function decodeWoolworthsInitialState(body: string): unknown {
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new RangeError('Woolworths response exceeded the decoder limit')
  }

  const markerIndex = body.indexOf(INITIAL_STATE_MARKER)
  const equalsIndex = markerIndex < 0 ? -1 : body.indexOf('=', markerIndex + INITIAL_STATE_MARKER.length)
  const objectStart = equalsIndex < 0 ? -1 : findNextNonWhitespace(body, equalsIndex + 1)

  if (objectStart < 0 || body[objectStart] !== '{') {
    throw new TypeError('Invalid Woolworths initial-state response')
  }

  const objectEnd = findBalancedObjectEnd(body, objectStart)
  if (objectEnd < 0) {
    throw new TypeError('Invalid Woolworths initial-state response')
  }

  let initialState: unknown
  try {
    initialState = JSON.parse(body.slice(objectStart, objectEnd + 1))
  } catch {
    throw new TypeError('Invalid Woolworths initial-state response')
  }

  const response = nestedRecord(initialState, ['plpReducer', 'data', 'response'])
  if (!response || !Array.isArray(response.results)) {
    throw new TypeError('Invalid Woolworths product response')
  }

  return { response }
}

export function decodeClicksPromotions(body: string): unknown {
  const payload = parseJsonObject(body, 'Clicks')
  const pagination = isRecord(payload.pagination) ? payload.pagination : undefined

  if (!pagination) {
    return payload
  }

  return {
    ...payload,
    pagination: {
      ...pagination,
      totalPages: pagination.totalPages ?? pagination.numberOfPages,
    },
  }
}

export async function runStructuredRetailerFeedScout(
  env: TrolleyScoutEnv,
  options: RetailerFeedScoutOptions = {},
): Promise<RetailerFeedScoutResult> {
  const emptyResult: RetailerFeedScoutResult = {
    acceptedDealCount: 0,
    catalogueCount: 0,
    catalogues: [],
    checkedSourceCount: 0,
    databaseAvailable: hasTrolleyScoutDatabase(env),
    failedSourceCount: 0,
    physicalRequestCount: 0,
    sources: [],
  }

  if (!hasTrolleyScoutDatabase(env)) {
    return emptyResult
  }

  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? (() => new Date().toISOString())
  const requestCap = boundedInteger(
    options.requestCap ?? DEFAULT_REQUEST_CAP,
    'requestCap',
    1,
    MAX_REQUEST_CAP,
  )
  const timeoutMs = boundedInteger(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    'timeoutMs',
    1,
    MAX_TIMEOUT_MS,
  )
  const responseByteLimit = boundedInteger(
    options.responseByteLimit ?? DEFAULT_RESPONSE_BYTES,
    'responseByteLimit',
    1,
    MAX_RESPONSE_BYTES,
  )
  const sources = options.sources ?? structuredSources
  const storage = options.storage ?? defaultStorage
  const result = emptyResult
  const seenCatalogueUrls = new Set<string>()

  for (const source of sources) {
    if (result.physicalRequestCount >= requestCap) {
      break
    }

    let startedAt = now()
    let requested = false
    let acceptedForSource = 0

    try {
      const storedCursor = await storage.readSourceCursor(env, source.key) ?? source.initialCursor
      const windowCursor = readCandidateWindowCursor(storedCursor)
      const sourceCursor = windowCursor?.sourceCursor ?? storedCursor
      const request = source.buildRequest(sourceCursor)
      startedAt = now()
      requested = true
      result.physicalRequestCount += 1
      result.checkedSourceCount += 1
      const response = await fetchWithTimeout(fetcher, request, timeoutMs)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const body = await readBoundedBody(response, responseByteLimit)
      const responseFingerprint = await fingerprintText(body)
      const payload = source.decode(body)
      const page = source.parse({
        capturedAt: startedAt,
        cursor: sourceCursor,
        payload,
        sourceUrl: source.sourceUrl,
      })
      const candidateOffset = windowCursor?.fingerprint === responseFingerprint
        ? windowCursor.nextCandidateOffset
        : 0
      const candidates = page.candidates.slice(
        candidateOffset,
        candidateOffset + MAX_CANDIDATES_PER_RUN,
      )
      const stored = await storage.upsertDealItems(env, {
        candidates,
        retailerId: source.retailerId,
        run: {
          finishedAt: now(),
          startedAt,
          status: 'success',
        },
        sourceKey: source.key,
      })
      acceptedForSource = stored.processed

      const mappedCatalogues = mapStructuredCatalogues(page.catalogues, source)
      const newCatalogues = mappedCatalogues.filter((catalogue) => {
        const key = canonicalDocumentUrl(catalogue.documentUrl ?? catalogue.url)
        if (seenCatalogueUrls.has(key)) {
          return false
        }
        seenCatalogueUrls.add(key)
        return true
      })
      result.catalogues.push(...newCatalogues)
      result.catalogueCount = result.catalogues.length

      const nextCandidateOffset = candidateOffset + candidates.length
      const nextCursor = nextCandidateOffset < page.candidates.length
        ? writeCandidateWindowCursor({
          fingerprint: responseFingerprint,
          nextCandidateOffset,
          sourceCursor,
          version: 1,
        })
        : page.nextCursor ?? source.initialCursor

      await storage.writeSourceCursor(env, {
        cursor: nextCursor,
        sourceKey: source.key,
        updatedAt: now(),
      })

      result.acceptedDealCount += acceptedForSource
      result.sources.push({
        acceptedDealCount: acceptedForSource,
        catalogueCount: newCatalogues.length,
        key: source.key,
        status: 'success',
      })
    } catch (error) {
      if (!requested) {
        result.checkedSourceCount += 1
      }
      result.failedSourceCount += 1
      result.acceptedDealCount += acceptedForSource
      const errorText = boundedErrorText(error)

      try {
        await storage.upsertDealItems(env, {
          candidates: [],
          retailerId: source.retailerId,
          run: {
            errorText,
            finishedAt: now(),
            startedAt,
            status: 'failed',
          },
          sourceKey: source.key,
        })
      } catch {
        // A rollout without the audit table still lets later sources run.
      }

      result.sources.push({
        acceptedDealCount: acceptedForSource,
        catalogueCount: 0,
        errorText,
        key: source.key,
        status: 'failed',
      })
    }
  }

  return result
}

function readCandidateWindowCursor(cursor: FeedCursor): CandidateWindowCursor | undefined {
  if (cursor.kind !== 'token' || !cursor.token.startsWith(WINDOW_CURSOR_PREFIX)) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(
      decodeURIComponent(cursor.token.slice(WINDOW_CURSOR_PREFIX.length)),
    )
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(parsed.fingerprint) ||
      !Number.isSafeInteger(parsed.nextCandidateOffset) ||
      (parsed.nextCandidateOffset as number) <= 0 ||
      !isFeedCursor(parsed.sourceCursor) ||
      (
        parsed.sourceCursor.kind === 'token' &&
        parsed.sourceCursor.token.startsWith(WINDOW_CURSOR_PREFIX)
      )
    ) {
      return undefined
    }

    return parsed as unknown as CandidateWindowCursor
  } catch {
    return undefined
  }
}

function writeCandidateWindowCursor(state: CandidateWindowCursor): FeedCursor {
  return {
    kind: 'token',
    token: `${WINDOW_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(state))}`,
  }
}

async function fingerprintText(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function mapStructuredCatalogues(
  catalogues: RetailerCatalogueRecord[],
  source: RetailerFeedSource,
): StoreLeaflet[] {
  return catalogues.flatMap((catalogue) => {
    const documentUrl = validatedPublicUrl(catalogue.documentUrl)
    const sourceUrl = validatedPublicUrl(catalogue.sourceUrl)
    const imageUrl = catalogue.imageUrl
      ? validatedPublicUrl(catalogue.imageUrl)
      : undefined

    if (
      catalogue.retailerId !== source.retailerId ||
      !requiredCompactText(catalogue.catalogueId) ||
      !requiredCompactText(catalogue.title) ||
      !documentUrl ||
      !sourceUrl ||
      !validInstant(catalogue.capturedAt) ||
      !validScope(catalogue.scope) ||
      (catalogue.imageUrl !== undefined && !imageUrl) ||
      !validOptionalWindow(catalogue.validFrom) ||
      !validOptionalWindow(catalogue.validTo)
    ) {
      return []
    }

    return [{
      capturedAt: catalogue.capturedAt,
      documentUrl,
      id: catalogue.catalogueId,
      imageUrl,
      name: catalogue.title,
      priceScope: catalogue.scope,
      retailerId: catalogue.retailerId,
      retailerName: source.retailerName,
      sourceLabel: source.sourceLabel,
      url: sourceUrl,
      validFrom: catalogue.validFrom,
      validTo: catalogue.validTo,
    }]
  })
}

function canonicalDocumentUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  return url.toString()
}

function validatedPublicUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function validInstant(value: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function validOptionalWindow(value: string | undefined) {
  return value === undefined || (
    (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value)) &&
    Number.isFinite(Date.parse(value))
  )
}

function validScope(scope: RetailerDealScope) {
  if (scope.type === 'national' || scope.type === 'online') {
    return true
  }
  return scope.type === 'province'
    ? scope.regionIds.length > 0
    : scope.storeIds.length > 0
}

function requiredCompactText(value: string) {
  return value.trim().length > 0 && value.length <= 500
}

function isFeedCursor(value: unknown): value is FeedCursor {
  if (!isRecord(value)) {
    return false
  }
  if (value.kind === 'offset') {
    return Number.isSafeInteger(value.offset) && (value.offset as number) >= 0
  }
  if (value.kind === 'page') {
    return Number.isSafeInteger(value.page) && (value.page as number) >= 0
  }
  return value.kind === 'token' && typeof value.token === 'string' && value.token.length > 0
}

function gameSource(
  key: string,
  sourceLabel: string,
  query: string,
): RetailerFeedSource {
  const sourceUrl = 'https://www.game.co.za/on-promotion'

  return {
    buildRequest(cursor) {
      const page = requireCursor(cursor, 'page')
      const url = new URL(
        'https://api-beta-game.walmart.com/occ/v2/game/channel/web/zone/G205/products/search',
      )
      url.searchParams.set('fields', 'FULL')
      url.searchParams.set('currentPage', String(page))
      url.searchParams.set('pageSize', String(PAGE_SIZE))
      return {
        init: {
          body: JSON.stringify({ query }),
          headers: {
            ...BROWSER_HEADERS,
            'content-type': 'application/json',
            referer: `${sourceUrl}/`,
          },
          method: 'POST',
        },
        url: url.toString(),
      }
    },
    decode: (body) => parseJsonObject(body, 'Game'),
    initialCursor: { kind: 'page', page: 0 },
    key,
    parse({ capturedAt, payload, sourceUrl: officialSourceUrl }) {
      return parseMassmartFeed(payload, {
        capturedAt,
        retailerId: 'game',
        sourceUrl: officialSourceUrl,
      })
    },
    retailerId: retailerSlug('game'),
    retailerName: 'Game',
    sourceLabel,
    sourceUrl,
  }
}

function buildersSource(): RetailerFeedSource {
  const sourceUrl = 'https://www.builders.co.za/deals-occ'

  return {
    buildRequest(cursor) {
      const page = requireCursor(cursor, 'page')
      return {
        init: {
          body: JSON.stringify({
            currentPage: page,
            pageSize: PAGE_SIZE,
            query: ':bs-relevance',
          }),
          headers: {
            ...BROWSER_HEADERS,
            'content-type': 'application/json',
            referer: sourceUrl,
          },
          method: 'POST',
        },
        url: 'https://www.builders.co.za/web/v2/builders/channel/web/zone/B14/category/deals-17/search',
      }
    },
    decode: (body) => parseJsonObject(body, 'Builders'),
    initialCursor: { kind: 'page', page: 0 },
    key: 'builders::deals',
    parse({ capturedAt, payload, sourceUrl: officialSourceUrl }) {
      return parseBuildersFeed(payload, { capturedAt, sourceUrl: officialSourceUrl })
    },
    retailerId: retailerSlug('builders'),
    retailerName: 'Builders',
    sourceLabel: 'Deals',
    sourceUrl,
  }
}

function makroSource(): RetailerFeedSource {
  const sourceUrl = 'https://www.makro.co.za/catalogues-store'

  return {
    buildRequest(cursor) {
      requireCursor(cursor, 'page')
      return { init: { headers: BROWSER_HEADERS }, url: sourceUrl }
    },
    decode: decodeMakroInitialState,
    initialCursor: { kind: 'page', page: 0 },
    key: 'makro::catalogues-store',
    parse({ capturedAt, payload, sourceUrl: officialSourceUrl }) {
      return parseMakroFeed(payload, { capturedAt, sourceUrl: officialSourceUrl })
    },
    retailerId: retailerSlug('makro'),
    retailerName: 'Makro',
    sourceLabel: 'Catalogue products',
    sourceUrl,
  }
}

function dischemSource(): RetailerFeedSource {
  const sourceUrl = 'https://www.dischem.co.za/on-promotion'

  return {
    buildRequest(cursor) {
      const page = requireCursor(cursor, 'page')
      const url = new URL(sourceUrl)
      if (page > 0) {
        url.searchParams.set('p', String(page + 1))
      }
      return { init: { headers: BROWSER_HEADERS }, url: url.toString() }
    },
    decode: (body) => body,
    initialCursor: { kind: 'page', page: 0 },
    key: 'dis-chem::on-promotion',
    parse({ capturedAt, cursor, payload, sourceUrl: officialSourceUrl }) {
      return parseDischemFeed(payload, {
        capturedAt,
        page: requireCursor(cursor, 'page'),
        sourceUrl: officialSourceUrl,
      })
    },
    retailerId: retailerSlug('dis-chem'),
    retailerName: 'Dis-Chem',
    sourceLabel: 'On promotion',
    sourceUrl,
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  request: RetailerFeedRequest,
  timeoutMs: number,
) {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new Error(`Request timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    return await Promise.race([
      fetcher(request.url, { ...request.init, signal: controller.signal }),
      timeoutPromise,
    ])
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
  }
}

async function readBoundedBody(response: Response, byteLimit: number) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
    throw new RangeError(`Response exceeded ${byteLimit} bytes`)
  }

  if (!response.body) {
    return ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let bytes = 0

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }

    bytes += chunk.value.byteLength
    if (bytes > byteLimit) {
      await reader.cancel()
      throw new RangeError(`Response exceeded ${byteLimit} bytes`)
    }
    body += decoder.decode(chunk.value, { stream: true })
  }

  return body + decoder.decode()
}

function findBalancedObjectEnd(value: string, start: number) {
  let depth = 0
  let escaped = false
  let quoted = false

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]

    if (quoted) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        quoted = false
      }
      continue
    }

    if (character === '"') {
      quoted = true
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return index
      }
      if (depth < 0) {
        return -1
      }
    }
  }

  return -1
}

function findNextNonWhitespace(value: string, start: number) {
  for (let index = start; index < value.length; index += 1) {
    if (!/\s/.test(value[index])) {
      return index
    }
  }
  return -1
}

function nestedRecord(value: unknown, path: string[]) {
  let current = value
  for (const key of path) {
    if (!isRecord(current) || !isRecord(current[key])) {
      return undefined
    }
    current = current[key]
  }
  return current as Record<string, unknown>
}

function parseJsonObject(body: string, sourceName: string) {
  try {
    const payload: unknown = JSON.parse(body)
    if (!isRecord(payload)) {
      throw new TypeError()
    }
    return payload
  } catch {
    throw new TypeError(`Invalid ${sourceName} response`)
  }
}

function requireCursor(cursor: FeedCursor, kind: 'offset' | 'page') {
  if (cursor.kind !== kind) {
    throw new TypeError(`Expected a ${kind} cursor`)
  }
  return kind === 'offset'
    ? (cursor as Extract<FeedCursor, { kind: 'offset' }>).offset
    : (cursor as Extract<FeedCursor, { kind: 'page' }>).page
}

function boundedInteger(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`)
  }
  return value
}

function boundedErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500) || 'Unknown structured source failure'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
