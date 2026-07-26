import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  FeedCursor,
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  arrayValue,
  integerValue,
  isRecord,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

export const SPORTSMANS_ORIGIN = 'https://www.sportsmanswarehouse.co.za'
export const SPORTSMANS_OUTLET_URL = `${SPORTSMANS_ORIGIN}/category/outlet/`
export const SPORTSMANS_TOKEN_URL =
  `${SPORTSMANS_ORIGIN}/api/search/front-end-token/`
export const SPORTSMANS_SEARCH_URL =
  'https://D6WY1Z4E62-dsn.algolia.net/1/indexes/swh_prod_products/query'
export const SPORTSMANS_PAGE_SIZE = 100
export const MAX_SPORTSMANS_PAGES = 20

const sportsmansRetailerId = retailerSlug('sportsmans-warehouse')
const sportsmansScope = { type: 'online' } as const

export interface SportsmansSearchToken {
  expiresAt?: number
  token: string
  userToken: string
}

export interface SportsmansSearchRequest {
  init: RequestInit
  url: string
}

export function parseSportsmansSearchToken(payload: unknown): SportsmansSearchToken {
  const token = textValue(payload, 'token')
  const userToken = textValue(payload, 'userToken')
  const indices = arrayValue(payload, 'indices').map(String)
  const expiresAt = integerValue(payload, 'expiresAt')

  if (
    token.length < 12 ||
    userToken.length < 6 ||
    !indices.includes('swh_prod_products')
  ) {
    throw new TypeError('Invalid Sportsmans Warehouse search token')
  }

  return { expiresAt, token, userToken }
}

export function buildSportsmansSearchRequest(
  token: string,
  page = 0,
): SportsmansSearchRequest {
  const safePage = Math.max(0, Math.min(
    MAX_SPORTSMANS_PAGES - 1,
    Math.trunc(page) || 0,
  ))

  if (token.length < 12) {
    throw new TypeError('Invalid Sportsmans Warehouse search token')
  }

  return {
    init: {
      body: JSON.stringify({
        facetFilters: [['category_page_id:Outlet']],
        hitsPerPage: SPORTSMANS_PAGE_SIZE,
        page: safePage,
        query: '',
      }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-algolia-api-key': token,
        'x-algolia-application-id': 'D6WY1Z4E62',
      },
      method: 'POST',
    },
    url: SPORTSMANS_SEARCH_URL,
  }
}

export function parseSportsmansFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const hits = arrayValue(payload, 'hits')
  const pageNumber = integerValue(payload, 'page')
  const pageCount = integerValue(payload, 'nbPages')
  const totalCount = integerValue(payload, 'nbHits')

  if (
    !isRecord(payload) ||
    !Array.isArray(payload.hits) ||
    pageNumber === undefined ||
    pageCount === undefined
  ) {
    throw new TypeError('Invalid Sportsmans Warehouse search response')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const hit of hits) {
    const productId = textValue(hit, 'objectID') || textValue(hit, 'code')
    const title = textValue(hit, 'title')
    const slug = textValue(hit, 'slug')
    const priceCents = randToCents(isRecord(hit) ? hit.price : undefined)
    const previousPriceCents = randToCents(
      isRecord(hit) ? hit.was_price : undefined,
    )

    if (
      !productId ||
      !title ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) ||
      priceCents === undefined ||
      previousPriceCents === undefined ||
      previousPriceCents <= priceCents ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)
    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: 'yellow-ticket-sale',
        scope: sportsmansScope,
        sourceId: productId,
      }),
      imageUrl: sportsmansImage(hit),
      previousPriceCents,
      priceCents,
      productId,
      productUrl: `${SPORTSMANS_ORIGIN}/product/${slug}/`,
      promotionId: 'yellow-ticket-sale',
      retailerId: sportsmansRetailerId,
      savingText: percentOffText(
        priceCents,
        previousPriceCents,
        numberValue(hit, 'save_percent'),
      ),
      scope: sportsmansScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const nextCursor: FeedCursor | undefined =
    pageNumber + 1 < pageCount && pageNumber + 1 < MAX_SPORTSMANS_PAGES
      ? { kind: 'page', page: pageNumber + 1 }
      : undefined

  return { candidates, catalogues: [], nextCursor, totalCount }
}

function sportsmansImage(hit: unknown): string | undefined {
  const image = recordValue(hit, 'primary_image')
  const value = textValue(image, 'cdn_path')

  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'res.cloudinary.com' &&
      url.pathname.startsWith('/moresport/image/upload/')
    )
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function numberValue(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const number = Number(value[key])
  return Number.isFinite(number) ? number : undefined
}
