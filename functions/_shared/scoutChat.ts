import type {
  ScoutChatAnswer,
  ScoutChatCatalogueCard,
  ScoutChatDealCard,
  ScoutChatRole,
  ScoutChatTurn,
  StoreLeaflet,
} from '../../src/types'
import type { StoredDealItem } from './dealItemStore'

const MAX_MESSAGE_LENGTH = 600
const MAX_HISTORY_TURNS = 8
const MAX_HISTORY_TEXT_LENGTH = 900
const MAX_CONTEXT_DEALS = 40
const MAX_CONTEXT_CATALOGUES = 12
const MAX_CATALOGUE_PAGES = 12
const MAX_PERSONAL_ITEMS = 20
const MAX_PERSONAL_DEAL_CARDS = 24
const MAX_RESULT_DEALS = 6
const MAX_RESULT_CATALOGUES = 4
const MAX_FOLLOW_UPS = 3

export interface NormalizedScoutChatRequest {
  history: ScoutChatTurn[]
  message: string
}

export interface ScoutChatContext {
  catalogues: ScoutChatCatalogueCard[]
  deals: ScoutChatDealCard[]
  shopper: ScoutShopperContext
}

export interface ScoutPersonalContextInput {
  basket?: unknown
  favouriteStores?: unknown
  followedStores?: unknown
  recentPropertySearches?: unknown
  savedDeals?: unknown
  savedProperties?: unknown
  windowShoppingSaves?: unknown
}

export interface ScoutShopperContext {
  basket: ScoutPersonalOffer[]
  favouriteStores: ScoutPersonalStore[]
  followedStores: ScoutPersonalStore[]
  properties: {
    recentSearches: string[]
    saved: ScoutPersonalProperty[]
  }
  savedDeals: ScoutPersonalOffer[]
  windowShoppingSaves: ScoutPersonalOffer[]
}

interface ScoutPersonalOffer {
  dealId?: string
  previousPriceText?: string
  priceText?: string
  productUrl?: string
  quantity?: number
  retailerName: string
  savingText?: string
  soldOut?: boolean
  title: string
}

interface ScoutPersonalStore {
  id?: string
  name: string
  sourceUrl?: string
}

interface ScoutPersonalProperty {
  bedrooms?: number
  listingType?: string
  listingUrl?: string
  location?: string
  portalName?: string
  priceText?: string
  title: string
}

export interface ScoutModelAnswer {
  catalogueIds: string[]
  dealIds: string[]
  followUps: string[]
  reply: string
}

export function normalizeScoutChatRequest(input: unknown): NormalizedScoutChatRequest {
  if (!isRecord(input)) {
    throw new TypeError('Request body must be an object.')
  }

  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (!message) {
    throw new TypeError('Enter a message for Mr Scout.')
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new TypeError(`Keep your message within ${MAX_MESSAGE_LENGTH} characters.`)
  }

  const history = Array.isArray(input.history)
    ? input.history
      .map(normalizeHistoryTurn)
      .filter((turn): turn is ScoutChatTurn => Boolean(turn))
      .slice(-MAX_HISTORY_TURNS)
    : []

  return { history, message }
}

export function buildScoutContext(
  dealItems: readonly StoredDealItem[],
  leaflets: readonly StoreLeaflet[],
  currencyCode: string,
  personalInput: ScoutPersonalContextInput = {},
): ScoutChatContext {
  const liveDeals = dealItems
    .filter((item) => item.status === 'active' && !item.soldOut && isHttpUrl(item.productUrl))
    .sort((a, b) => {
      const savingDifference = savingCents(b) - savingCents(a)
      if (savingDifference !== 0) return savingDifference
      if (Boolean(a.imageUrl) !== Boolean(b.imageUrl)) return a.imageUrl ? -1 : 1
      return a.title.localeCompare(b.title)
    })
    .slice(0, MAX_CONTEXT_DEALS)
    .map((item): ScoutChatDealCard => ({
      id: item.id,
      imageUrl: safeHttpUrl(item.imageUrl),
      previousPriceText: item.previousPriceCents === undefined
        ? undefined
        : formatMoney(item.previousPriceCents, item.currencyCode || currencyCode),
      priceText: formatMoney(item.priceCents, item.currencyCode || currencyCode),
      productUrl: item.productUrl,
      retailerName: humanizeRetailer(item.retailerId),
      savingText: item.savingText,
      title: item.title,
    }))

  const { cards: personalDealCards, shopper } = normalizeShopperContext(personalInput)
  const deals = [...liveDeals, ...personalDealCards].slice(
    0,
    MAX_CONTEXT_DEALS + MAX_PERSONAL_DEAL_CARDS,
  )

  const catalogues = leaflets
    .filter((leaflet) => isHttpUrl(leaflet.documentUrl ?? leaflet.url))
    .slice(0, MAX_CONTEXT_CATALOGUES)
    .map((leaflet): ScoutChatCatalogueCard => {
      const pageImageUrls = (leaflet.pages ?? [])
        .map((page) => safeHttpUrl(page.imageUrl))
        .filter((url): url is string => Boolean(url))
        .slice(0, MAX_CATALOGUE_PAGES)
      const pagesUrl = safeHttpUrl(leaflet.pagesUrl)
      const catalogueUrl = safeHttpUrl(leaflet.documentUrl ?? leaflet.url)
      const hasRemoteDocument =
        Boolean(pagesUrl) ||
        /\.pdf(?:$|[?#])/i.test(catalogueUrl ?? '')
      const pageCount = hasRemoteDocument && pageImageUrls.length <= 1
        ? 0
        : leaflet.pages?.length ?? (leaflet.imageUrl ? 1 : 0)

      return {
        id: leaflet.id,
        imageUrl: safeHttpUrl(leaflet.imageUrl) ?? pageImageUrls[0],
        name: leaflet.name,
        pageCount,
        pageImageUrls,
        pagesUrl,
        retailerName: leaflet.retailerName,
        url: leaflet.documentUrl ?? leaflet.url,
        validTo: leaflet.validTo,
      }
    })

  return { catalogues, deals, shopper }
}

export function mapScoutAnswer(
  modelAnswer: ScoutModelAnswer,
  context: ScoutChatContext,
): ScoutChatAnswer {
  const dealById = new Map(context.deals.map((deal) => [deal.id, deal]))
  const catalogueById = new Map(context.catalogues.map((catalogue) => [catalogue.id, catalogue]))

  return {
    reply: boundedText(modelAnswer.reply, 1_600) || 'I found a few options for you.',
    deals: uniqueStrings(modelAnswer.dealIds)
      .map((id) => dealById.get(id))
      .filter((deal): deal is ScoutChatDealCard => Boolean(deal))
      .slice(0, MAX_RESULT_DEALS),
    catalogues: uniqueStrings(modelAnswer.catalogueIds)
      .map((id) => catalogueById.get(id))
      .filter((catalogue): catalogue is ScoutChatCatalogueCard => Boolean(catalogue))
      .slice(0, MAX_RESULT_CATALOGUES),
    followUps: uniqueStrings(modelAnswer.followUps)
      .map((text) => boundedText(text, 100))
      .filter(Boolean)
      .slice(0, MAX_FOLLOW_UPS),
  }
}

export function parseScoutModelAnswer(payload: unknown): ScoutModelAnswer {
  if (!isRecord(payload)) {
    throw new TypeError('Mr Scout returned an invalid response.')
  }

  const text = extractResponseText(payload)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new TypeError('Mr Scout returned an unreadable response.')
  }

  if (!isRecord(parsed)) {
    throw new TypeError('Mr Scout returned an invalid answer.')
  }

  return {
    catalogueIds: stringArray(parsed.catalogueIds),
    dealIds: stringArray(parsed.dealIds),
    followUps: stringArray(parsed.followUps),
    reply: typeof parsed.reply === 'string' ? parsed.reply : '',
  }
}

export const scoutAnswerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    dealIds: { type: 'array', items: { type: 'string' }, maxItems: MAX_RESULT_DEALS },
    catalogueIds: {
      type: 'array',
      items: { type: 'string' },
      maxItems: MAX_RESULT_CATALOGUES,
    },
    followUps: { type: 'array', items: { type: 'string' }, maxItems: MAX_FOLLOW_UPS },
  },
  required: ['reply', 'dealIds', 'catalogueIds', 'followUps'],
} as const

function normalizeHistoryTurn(input: unknown): ScoutChatTurn | undefined {
  if (!isRecord(input) || (input.role !== 'assistant' && input.role !== 'user')) {
    return undefined
  }
  const text = typeof input.text === 'string'
    ? boundedText(input.text.trim(), MAX_HISTORY_TEXT_LENGTH)
    : ''
  return text ? { role: input.role as ScoutChatRole, text } : undefined
}

function extractResponseText(payload: Record<string, unknown>): string {
  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (!isRecord(content)) continue
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text
      }
      if (content.type === 'refusal' && typeof content.refusal === 'string') {
        throw new TypeError(content.refusal)
      }
    }
  }
  throw new TypeError('Mr Scout returned no answer.')
}

function savingCents(item: StoredDealItem): number {
  return Math.max(0, (item.previousPriceCents ?? item.priceCents) - item.priceCents)
}

function formatMoney(cents: number, currencyCode: string): string {
  const currency = /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : 'ZAR'
  if (currency === 'ZAR') {
    return `R${(cents / 100).toFixed(2)}`
  }
  return new Intl.NumberFormat('en', {
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(cents / 100)
}

function humanizeRetailer(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeShopperContext(
  input: ScoutPersonalContextInput,
): { cards: ScoutChatDealCard[]; shopper: ScoutShopperContext } {
  const cards: ScoutChatDealCard[] = []
  const savedDeals = normalizePersonalOffers(input.savedDeals, 'saved', cards)
  const windowShoppingSaves = normalizePersonalOffers(
    input.windowShoppingSaves,
    'window',
    cards,
  )
  const basketItems = isRecord(input.basket) && Array.isArray(input.basket.items)
    ? input.basket.items
    : []
  const basket = basketItems
    .slice(0, MAX_PERSONAL_ITEMS)
    .map((item, index) => {
      if (!isRecord(item)) return undefined
      const deal = isRecord(item.deal) ? item.deal : item
      return normalizePersonalOffer(
        deal,
        `personal:basket:${index}`,
        cards,
        positiveInteger(item.quantity),
      )
    })
    .filter((item): item is ScoutPersonalOffer => Boolean(item))

  return {
    cards: cards.slice(0, MAX_PERSONAL_DEAL_CARDS),
    shopper: {
      basket,
      favouriteStores: normalizePersonalStores(input.favouriteStores),
      followedStores: normalizePersonalStores(input.followedStores),
      properties: {
        recentSearches: normalizeRecentSearches(input.recentPropertySearches),
        saved: normalizePersonalProperties(input.savedProperties),
      },
      savedDeals,
      windowShoppingSaves,
    },
  }
}

function normalizePersonalOffers(
  value: unknown,
  source: 'saved' | 'window',
  cards: ScoutChatDealCard[],
): ScoutPersonalOffer[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_PERSONAL_ITEMS)
    .map((item, index) => isRecord(item)
      ? normalizePersonalOffer(item, `personal:${source}:${index}`, cards)
      : undefined)
    .filter((item): item is ScoutPersonalOffer => Boolean(item))
}

function normalizePersonalOffer(
  value: Record<string, unknown>,
  dealId: string,
  cards: ScoutChatDealCard[],
  quantity?: number,
): ScoutPersonalOffer | undefined {
  const title = safeText(value.title, 160)
  if (!title) return undefined
  const retailerName = firstText(
    [value.retailerName, value.sourceLabel, value.retailerId, value.source],
    80,
  ) ?? 'Saved retailer'
  const productUrl = safeHttpUrl(safeText(value.productUrl, 1_000))
  const priceText = safeText(value.priceText, 60)
  const previousPriceText = safeText(value.previousPriceText, 60)
  const savingText = safeText(value.savingText, 100)
  const soldOut = value.soldOut === true
  const imageUrl = safeHttpUrl(safeText(value.imageUrl, 1_000))
  const canAddCard = Boolean(productUrl) && cards.length < MAX_PERSONAL_DEAL_CARDS

  const offer: ScoutPersonalOffer = {
    dealId: canAddCard ? dealId : undefined,
    previousPriceText,
    priceText,
    productUrl,
    quantity,
    retailerName,
    savingText,
    soldOut: soldOut || undefined,
    title,
  }

  if (productUrl && canAddCard) {
    cards.push({
      id: dealId,
      imageUrl,
      previousPriceText,
      priceText: priceText ?? 'See current price',
      productUrl,
      retailerName,
      savingText,
      soldOut: soldOut || undefined,
      title,
    })
  }

  return offer
}

function normalizePersonalStores(value: unknown): ScoutPersonalStore[] {
  if (!Array.isArray(value)) return []
  const stores: ScoutPersonalStore[] = []
  for (const item of value.slice(0, MAX_PERSONAL_ITEMS)) {
    if (!isRecord(item)) continue
    const name = firstText([item.displayName, item.retailerName, item.sourceLabel, item.name], 100)
    if (!name) continue
    stores.push({
        id: safeText(item.id ?? item.retailerId, 100),
        name,
        sourceUrl: safeHttpUrl(safeText(item.sourceUrl, 1_000)),
    })
  }
  return stores
}

function normalizePersonalProperties(value: unknown): ScoutPersonalProperty[] {
  if (!Array.isArray(value)) return []
  const properties: ScoutPersonalProperty[] = []
  for (const item of value.slice(0, MAX_PERSONAL_ITEMS)) {
    if (!isRecord(item)) continue
    const title = safeText(item.title, 180)
    if (!title) continue
    properties.push({
        bedrooms: positiveInteger(item.bedrooms),
        listingType: safeText(item.listingType, 20),
        listingUrl: safeHttpUrl(safeText(item.listingUrl, 1_000)),
        location: safeText(item.location, 120),
        portalName: safeText(item.portalName ?? item.portal, 80),
        priceText: safeText(item.priceText, 60),
        title,
    })
  }
  return properties
}

function normalizeRecentSearches(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(
    value
      .map((item) => safeText(item, 120))
      .filter((item): item is string => Boolean(item)),
  ).slice(0, MAX_PERSONAL_ITEMS)
}

function safeHttpUrl(value: string | undefined): string | undefined {
  return value && isHttpUrl(value) ? value : undefined
}

function safeText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim().slice(0, limit)
  return text || undefined
}

function firstText(values: unknown[], limit: number): string | undefined {
  for (const value of values) {
    const text = safeText(value, limit)
    if (text) return text
  }
  return undefined
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.min(99, Math.round(value))
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function boundedText(value: string, limit: number): string {
  return value.slice(0, limit)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
