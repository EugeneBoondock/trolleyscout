import type {
  CountryOption,
  PropertyListing,
  PropertyListingType,
  PropertyPortalSourceMeta,
  PropertySearchResult,
} from '../../src/types'
import { filterAndSortListings, type PropertySort } from '../../src/services/propertyPortals'
import type { TrolleyScoutEnv } from './env'
import { reverseGeocodePlace } from './reverseGeocode'
import { searchWeb } from './searchWeb'

const SEARCH_TTL_MS = 3 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 9_000
const MAX_BODY_BYTES = 2_000_000
const MAX_RESULTS_TO_FETCH = 8
const MAX_PROPERTY_STATE_BYTES = 750_000
const MAX_PROPERTY_STATE_OBJECTS = 12_000

export interface GlobalPropertySearchParams {
  query: string
  lat?: number
  lon?: number
  listingType: PropertyListingType
  page?: number
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  sort?: PropertySort
}

interface PropertyCacheRow {
  fetched_at: string
  payload_json: string
}

export async function searchGlobalProperties(
  env: TrolleyScoutEnv,
  params: GlobalPropertySearchParams,
  country: CountryOption,
): Promise<PropertySearchResult> {
  const page = Math.max(1, Math.min(params.page ?? 1, 5))
  const location = await resolveLocation(env, params)
  const locationText = location || country.capital || country.name
  const key = `global:${country.code}:${params.listingType}:${slug(locationText)}:${page}`
  const cached = await readCache(env, key)

  let listings: PropertyListing[] = []
  let sources: PropertyPortalSourceMeta[] = []
  let refreshedAt = new Date().toISOString()

  if (cached && Date.now() - Date.parse(cached.fetched_at) < SEARCH_TTL_MS) {
    const parsed = parseCached(cached.payload_json)
    if (parsed.listings.length > 0 || parsed.sources.length > 0) {
      listings = parsed.listings
      sources = parsed.sources
      refreshedAt = cached.fetched_at
    }
  }

  if (listings.length === 0 && sources.length === 0) {
    const action = params.listingType === 'rent' ? 'property to rent' : 'property for sale'
    const resultGroups = await Promise.all([
      searchWeb(`${action} ${locationText} ${country.name}`, env.JINA_API_KEY),
      searchWeb(
        `(immobilier OR imoveis OR nyumba) ${locationText} ${country.name} ${
          params.listingType === 'rent'
            ? '(louer OR alugar OR kukodisha)'
            : '(vente OR venda OR inauzwa)'
        }`,
        env.JINA_API_KEY,
      ),
    ])
    const results = dedupeSearchResults(resultGroups.flat())
    const relevantResults = results.filter((result) =>
      isLikelyPropertySearchResult(result, country, locationText),
    )
    const fetched = await Promise.all(
      relevantResults.slice(0, MAX_RESULTS_TO_FETCH).map(async (result) => {
        const html = await fetchPropertyPage(env, result.url)
        const parsed = html
          ? parseGenericPropertyListings(html, result.url, params.listingType, country.currencyCode)
          : []
        return {
          listings: parsed.length > 0
            ? parsed
            : fallbackSearchListing(result, params.listingType, country.currencyCode),
          source: sourceFromUrl(result.url, parsed.length > 0),
        }
      }),
    )

    listings = dedupeListings(fetched.flatMap((entry) => entry.listings))
    sources = mergeSources(fetched.map((entry) => entry.source))
    refreshedAt = new Date().toISOString()
    if (listings.length > 0 || sources.length > 0) {
      await writeCache(env, key, country.code, { listings, sources })
    }
  }

  listings = filterAndSortListings(listings, {
    maxPrice: params.maxPrice,
    minBeds: params.minBeds,
    minPrice: params.minPrice,
    sort: params.sort,
  })

  return {
    country,
    listings,
    listingType: params.listingType,
    locationText,
    page,
    refreshedAt,
    sources,
  }
}

export function parseGenericPropertyListings(
  html: string,
  sourceUrl: string,
  listingType: PropertyListingType,
  defaultCurrency: string,
): PropertyListing[] {
  const source = safeHttpUrl(sourceUrl)
  if (!source) return []
  const objects: Record<string, unknown>[] = []
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptPattern.exec(html)) !== null) {
    const attributes = match[1] ?? ''
    const body = (match[2] ?? '').trim()
    if (
      !body ||
      body.length > MAX_PROPERTY_STATE_BYTES ||
      !isPropertyStateScript(attributes)
    ) continue
    const parsed = parseJsonScript(body)
    if (parsed !== undefined) collectObjects(parsed, objects)
    if (objects.length >= MAX_PROPERTY_STATE_OBJECTS) break
  }

  const sourceHost = normalizeSourceHost(source.hostname)
  const portalName = labelFromHost(sourceHost)
  const portal = `web:${slug(sourceHost)}`
  const listings = objects
    .filter(isPropertyObject)
    .map((object) => objectToListing(object, {
      defaultCurrency,
      listingType,
      portal,
      portalName,
      source,
    }))
    .filter((listing): listing is PropertyListing => Boolean(listing))

  return dedupeListings(listings).slice(0, 60)
}

async function resolveLocation(env: TrolleyScoutEnv, params: GlobalPropertySearchParams): Promise<string> {
  if (params.lat !== undefined && params.lon !== undefined) {
    const place = await reverseGeocodePlace(env, params.lat, params.lon)
    return place?.names[0] ?? ''
  }
  return params.query.trim()
}

async function fetchPropertyPage(env: TrolleyScoutEnv, url: string): Promise<string | undefined> {
  const safe = safeHttpUrl(url)
  if (!safe) return undefined
  const direct = await timedFetch(safe.toString())
  if (direct) return direct
  return timedFetch(`https://r.jina.ai/${safe.toString()}`, env.JINA_API_KEY)
}

async function timedFetch(url: string, apiKey?: string): Promise<string | undefined> {
  const target = safeHttpUrl(url)
  if (!target) return undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(target.toString(), {
      headers: {
        accept: 'text/html, application/xhtml+xml',
        ...(apiKey ? { authorization: `Bearer ${apiKey}`, 'x-return-format': 'html' } : {}),
      },
      redirect: 'manual',
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    return readLimitedText(response, MAX_BODY_BYTES)
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function collectObjects(value: unknown, output: Record<string, unknown>[]): void {
  if (output.length >= MAX_PROPERTY_STATE_OBJECTS) return
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, output)
    return
  }
  if (!value || typeof value !== 'object') return
  const object = value as Record<string, unknown>
  output.push(object)
  for (const child of Object.values(object)) collectObjects(child, output)
}

function isPropertyObject(object: Record<string, unknown>): boolean {
  const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']]
  const typed = types.some((type) => typeof type === 'string' && /realestate|house|apartment|residence|accommodation/i.test(type))
  const hasListingShape = Boolean(
    listingUrlValue(object) &&
    (object.offers || object.price || object.priceValue || object.listingPrice) &&
    (
      object.address ||
      object.location ||
      object.suburb ||
      object.city ||
      object.bedrooms ||
      object.beds ||
      object.numberOfBedrooms ||
      object.numberOfRooms
    ),
  )
  return typed || hasListingShape
}

function objectToListing(
  object: Record<string, unknown>,
  context: {
    defaultCurrency: string
    listingType: PropertyListingType
    portal: string
    portalName: string
    source: URL
  },
): PropertyListing | undefined {
  const offer = firstObject(object.offers)
  const rawUrl = listingUrlValue(object)
  const listingUrl = rawUrl ? safeHttpUrl(rawUrl, context.source) : undefined
  const title =
    stringValue(object.name) ??
    stringValue(object.headline) ??
    stringValue(object.title) ??
    stringValue(object.displayName)
  if (!listingUrl || !title) return undefined

  const priceValue = positiveNumber(
    offer?.price ??
    offer?.lowPrice ??
    object.price ??
    object.priceValue ??
    object.listingPrice,
  )
  const currencyCode =
    stringValue(offer?.priceCurrency) ??
    stringValue(object.priceCurrency) ??
    stringValue(object.currencyCode) ??
    stringValue(object.currency) ??
    context.defaultCurrency
  const address = firstObject(object.address)
  const structuredLocation = [
    stringValue(address?.streetAddress),
    stringValue(address?.addressLocality),
  ].filter(Boolean).join(', ') || undefined
  const location =
    structuredLocation ??
    stringValue(object.location) ??
    stringValue(object.suburb) ??
    stringValue(object.city)
  const imageUrl = imageFrom(
    object.image ?? object.imageUrl ?? object.thumbnailUrl ?? object.coverImage,
    context.source,
  )

  return {
    bathrooms: positiveNumber(
      object.numberOfBathroomsTotal ??
      object.numberOfBathrooms ??
      object.bathrooms ??
      object.baths,
    ),
    bedrooms: positiveNumber(
      object.numberOfBedrooms ??
      object.numberOfRooms ??
      object.bedrooms ??
      object.beds,
    ),
    currencyCode,
    id: `${context.portal}:${hash(listingUrl.toString())}`,
    imageUrl,
    images: imageUrl ? [imageUrl] : undefined,
    listingType: context.listingType,
    listingUrl: listingUrl.toString(),
    location,
    portal: context.portal,
    portalName: context.portalName,
    priceText: priceValue ? formatMoney(priceValue, currencyCode) : undefined,
    priceValue,
    propertyType:
      typeName(object['@type']) ??
      stringValue(object.propertyType) ??
      stringValue(object.homeType),
    province: stringValue(address?.addressRegion),
    title,
  }
}

function isPropertyStateScript(attributes: string): boolean {
  return (
    /\btype=["']application\/(?:ld\+)?json["']/i.test(attributes) ||
    /\bid=["']__(?:NEXT_DATA|NUXT_DATA)__["']/i.test(attributes)
  )
}

function parseJsonScript(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function listingUrlValue(object: Record<string, unknown>): string | undefined {
  return (
    stringValue(object.url) ??
    stringValue(object['@id']) ??
    stringValue(object.listingUrl) ??
    stringValue(object.detailUrl) ??
    stringValue(object.propertyUrl) ??
    stringValue(object.href)
  )
}

function fallbackSearchListing(
  result: { title: string; url: string },
  listingType: PropertyListingType,
  currencyCode: string,
): PropertyListing[] {
  const url = safeHttpUrl(result.url)
  if (!url || !isLikelyPropertySearchResult(result)) return []
  const portal = `web:${slug(url.hostname)}`
  return [{
    currencyCode,
    id: `${portal}:${hash(url.toString())}`,
    listingType,
    listingUrl: url.toString(),
    portal,
    portalName: labelFromHost(url.hostname),
    title: result.title,
  }]
}

function isLikelyPropertySearchResult(
  result: { title: string; url: string },
  country?: CountryOption,
  locationText?: string,
): boolean {
  const searchable = `${result.title} ${result.url}`
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const propertyMatch =
    /property|real[\s-]*estate|realty|house|home|apartment|flat|bedroom|immobilier|imobiliari|imoveis|maison|appartement|moradia|venda|alugar|arrendar|terrain|nyumba|kiwanja/.test(searchable)
  if (!propertyMatch || !country) return propertyMatch

  const host = safeHttpUrl(result.url)?.hostname.toLowerCase() ?? ''
  if (host.endsWith(`.${country.code.toLowerCase()}`)) return true
  return [country.name, country.capital, locationText].some((value) => {
    if (!value) return false
    const normalized = value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
    return normalized.length >= 3 && searchable.includes(normalized)
  })
}

function dedupeSearchResults(
  results: Array<{ title: string; url: string }>,
): Array<{ title: string; url: string }> {
  return [...new Map(results.map((result) => [result.url, result])).values()]
}

function sourceFromUrl(urlValue: string, ok: boolean): PropertyPortalSourceMeta {
  const url = safeHttpUrl(urlValue)
  const host = normalizeSourceHost(url?.hostname ?? 'web')
  return { count: ok ? 1 : 0, id: `web:${slug(host)}`, label: labelFromHost(host), ok }
}

function mergeSources(sources: PropertyPortalSourceMeta[]): PropertyPortalSourceMeta[] {
  const merged = new Map<string, PropertyPortalSourceMeta>()
  for (const source of sources) {
    const current = merged.get(source.id)
    merged.set(source.id, {
      ...source,
      count: (current?.count ?? 0) + source.count,
      ok: Boolean(current?.ok || source.ok),
    })
  }
  return [...merged.values()]
}

function dedupeListings(listings: PropertyListing[]): PropertyListing[] {
  return [...new Map(listings.map((listing) => [listing.listingUrl, listing])).values()]
}

async function readCache(env: TrolleyScoutEnv, key: string): Promise<PropertyCacheRow | undefined> {
  if (!env.DB) return undefined
  try {
    return (await env.DB.prepare(
      'SELECT payload_json, fetched_at FROM property_cache WHERE cache_key = ?',
    ).bind(key).first<PropertyCacheRow>()) ?? undefined
  } catch {
    return undefined
  }
}

async function writeCache(
  env: TrolleyScoutEnv,
  key: string,
  countryCode: string,
  payload: { listings: PropertyListing[]; sources: PropertyPortalSourceMeta[] },
): Promise<void> {
  if (!env.DB) return
  try {
    await env.DB.prepare(
      `INSERT INTO property_cache (cache_key, payload_json, item_count, fetched_at, country_code)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (cache_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          item_count = excluded.item_count,
          fetched_at = excluded.fetched_at,
          country_code = excluded.country_code`,
    ).bind(key, JSON.stringify(payload), payload.listings.length, new Date().toISOString(), countryCode).run()
  } catch {
    // Search results still return when cache storage is unavailable.
  }
}

function parseCached(value: string): { listings: PropertyListing[]; sources: PropertyPortalSourceMeta[] } {
  try {
    const parsed = JSON.parse(value) as { listings?: unknown; sources?: unknown }
    return {
      listings: Array.isArray(parsed.listings) ? parsed.listings as PropertyListing[] : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources as PropertyPortalSourceMeta[] : [],
    }
  } catch {
    return { listings: [], sources: [] }
  }
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return item && typeof item === 'object' ? item as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveNumber(value: unknown): number | undefined {
  const number = Number(typeof value === 'string' ? value.replace(/[^\d.]/g, '') : value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function imageFrom(value: unknown, base: URL): string | undefined {
  const item = Array.isArray(value) ? value[0] : value
  const raw = typeof item === 'string'
    ? item
    : item && typeof item === 'object'
      ? stringValue((item as Record<string, unknown>).url) ?? stringValue((item as Record<string, unknown>).contentUrl)
      : undefined
  return raw ? safeHttpUrl(raw, base)?.toString() : undefined
}

function safeHttpUrl(value: string, base?: URL): URL | undefined {
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' && isPublicHostname(url.hostname) ? url : undefined
  } catch {
    return undefined
  }
}

function isPublicHostname(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')))
  ) {
    return false
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!ipv4) return true
  const octets = ipv4.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return false
  const [first, second] = octets
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  )
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let output = ''

  try {
    while (received < limit) {
      const chunk = await reader.read()
      if (chunk.done) break
      const remaining = limit - received
      const value = chunk.value.subarray(0, remaining)
      received += value.byteLength
      output += decoder.decode(value, { stream: received < limit })
      if (value.byteLength < chunk.value.byteLength) break
    }
    output += decoder.decode()
    return output
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function typeName(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.replace(/([a-z])([A-Z])/g, '$1 $2') : undefined
}

function formatMoney(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en', { currency: currencyCode, maximumFractionDigits: 0, style: 'currency' }).format(value)
  } catch {
    return `${currencyCode} ${value.toLocaleString('en')}`
  }
}

function labelFromHost(host: string): string {
  const labels = normalizeSourceHost(host).split('.')
  const secondLevelIndex =
    labels.length >= 3 && ['co', 'com', 'net', 'org'].includes(labels.at(-2) ?? '')
      ? labels.length - 3
      : Math.max(0, labels.length - 2)
  const token = labels[secondLevelIndex] ?? host
  return token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeSourceHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function hash(value: string): string {
  let output = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index)
    output = Math.imul(output, 16777619)
  }
  return (output >>> 0).toString(36)
}
