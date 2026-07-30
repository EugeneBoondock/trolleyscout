import type {
  CountryOption,
  PropertyListing,
  PropertyListingType,
  PropertyPortalSourceMeta,
  PropertySearchResult,
} from '../../src/types'
import {
  dedupePropertyListings,
  filterAndSortListings,
  filterListingsByLocation,
  type PropertySort,
} from '../../src/services/propertyPortals'
import { getPropertySources } from '../../src/services/propertySourceRegistry'
import { getSadcPropertySources } from '../../src/services/sadcSourceRegistry'
import type { TrolleyScoutEnv } from './env'
import { reverseGeocodePlace } from './reverseGeocode'
import { searchWeb } from './searchWeb'

const SEARCH_TTL_MS = 3 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 9_000
const MAX_BODY_BYTES = 2_000_000
const MAX_RESULTS_TO_FETCH = 8
const MAX_PAGES_TO_FETCH = 32
const PROPERTY_FETCH_CONCURRENCY = 4
const MAX_REDIRECT_HOPS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const HTTP_ACCEPTED = 202
const TRAILING_PRICE_WINDOW = 600
const MAX_PROPERTY_STATE_BYTES = 750_000
const MAX_PROPERTY_STATE_OBJECTS = 12_000
// How far past a link to look for its photo. A card's markup — badges, a
// carousel, the picture itself — runs to a couple of thousand characters on
// the busiest portals, and reaching past that starts borrowing the next card's
// picture.
const MAX_CARD_IMAGE_WINDOW = 2_500
// Bumped whenever parsing changes what a stored result would contain. Cached
// searches outlive a deploy, so without this a fix reaches nobody who already
// looked: they keep being served the answer the old parser gave.
const PROPERTY_CACHE_VERSION = 'v4'

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

interface GlobalPropertyResult {
  label?: string
  title: string
  trusted?: boolean
  url: string
}

export async function searchGlobalProperties(
  env: TrolleyScoutEnv,
  params: GlobalPropertySearchParams,
  country: CountryOption,
): Promise<PropertySearchResult> {
  const page = Math.max(1, Math.min(params.page ?? 1, 5))
  const location = await resolveLocation(env, params)
  const locationText = location || country.capital || country.name
  const key = `global:${PROPERTY_CACHE_VERSION}:${country.code}:${params.listingType}:${slug(locationText)}:${page}`
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
    const registeredSources = [
      ...getSadcPropertySources(country.code, params.listingType),
      ...getPropertySources(country.code, params.listingType),
    ]
    const registeredResults: GlobalPropertyResult[] = registeredSources.flatMap((source) =>
      preferredGlobalPropertyPages(country.code, source.url, page).map((sourcePage) => ({
        label: source.label,
        title: `${source.label} ${country.name} property listings`,
        trusted: true,
        url: propertySourceUrlForLocation(
          source.url,
          locationText,
          params.listingType,
          sourcePage,
        ),
      })),
    ).filter((result) => !hasUnfilledLocation(result.url))
    const results = dedupeSearchResults([...registeredResults, ...resultGroups.flat()])
    const relevantResults = results.filter((result) =>
      result.trusted || isLikelyPropertySearchResult(result, country, locationText),
    )
    // A country with many registered portals must not crowd out the discovered
    // ones: the registered set is fetched on top of the discovery budget.
    const fetchBudget = Math.min(
      MAX_PAGES_TO_FETCH,
      MAX_RESULTS_TO_FETCH + registeredResults.length,
    )
    const fetched = await mapWithConcurrency(
      relevantResults.slice(0, fetchBudget),
      PROPERTY_FETCH_CONCURRENCY,
      async (result) => {
        const html = await fetchPropertyPage(env, result.url)
        const parsed = html
          ? parseGenericPropertyListings(html, result.url, params.listingType, country.currencyCode)
          : []
        return {
          listings: parsed.length > 0
            ? parsed
            : result.trusted
              ? []
              : fallbackSearchListing(
                result,
                params.listingType,
                country.currencyCode,
                result.label,
              ),
          source: sourceFromUrl(
            result.url,
            parsed.length,
            html !== undefined,
            result.label,
          ),
        }
      },
    )

    listings = filterListingsByLocation(
      dedupePropertyListings(
        dedupeListings(fetched.flatMap((entry) => entry.listings)),
      ),
      [locationText],
    )
    const sourceListingUrls = new Map<string, Set<string>>()
    for (const entry of fetched) {
      const sourceId = entry.source.id
      const urls = sourceListingUrls.get(sourceId) ?? new Set<string>()
      for (const listing of entry.listings) urls.add(listing.listingUrl)
      sourceListingUrls.set(sourceId, urls)
    }
    sources = mergeSources(
      fetched
        .map((entry) => entry.source)
        .filter((source): source is PropertyPortalSourceMeta => Boolean(source)),
    ).map((source) => ({
      ...source,
      count: sourceListingUrls.get(source.id)?.size ?? 0,
    }))
    refreshedAt = new Date().toISOString()
    if (listings.length > 0 || sources.some((source) => source.ok)) {
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

export function propertySourceUrlForLocation(
  sourceUrl: string,
  locationText: string,
  listingType: PropertyListingType,
  page = 1,
): string {
  const locationSlug = slug(locationText)
  const templated = locationSlug
    ? sourceUrl
      .replaceAll('{location}', locationSlug)
      .replaceAll('{Location}', titleCase(locationSlug))
    : sourceUrl
  const source = safeHttpUrl(templated)
  if (!source) return templated

  const host = normalizeSourceHost(source.hostname)
  if (host === 'property.co.zw') {
    return withPage(
      `${source.origin}/property-${listingType === 'rent' ? 'for-rent' : 'for-sale'}/${locationSlug}`,
      page,
    )
  }
  if (host === 'propertybook.co.zw') {
    return withPage(
      `${source.origin}/${listingType === 'rent' ? 'to-rent' : 'for-sale'}/${locationSlug}`,
      page,
    )
  }
  if (
    host === 'propzone.co.zw' ||
    host === 'pamgolding.co.zw' ||
    host === 'musha.co.zw'
  ) {
    return withPage(templated, page)
  }

  return templated
}

export function preferredGlobalPropertyPages(
  countryCode: string,
  sourceUrl: string,
  requestedPage: number,
): number[] {
  if (requestedPage !== 1) return [requestedPage]
  if (countryCode.toUpperCase() !== 'ZW') return [1]
  const host = normalizeSourceHost(safeHttpUrl(sourceUrl)?.hostname ?? '')
  return [
    'musha.co.zw',
    'pamgolding.co.zw',
    'property.co.zw',
    'propertybook.co.zw',
    'propzone.co.zw',
  ].includes(host)
    ? [1, 2, 3]
    : [1]
}

function withPage(value: string, page: number): string {
  if (page <= 1) return value
  const url = safeHttpUrl(value)
  if (!url) return value
  url.searchParams.set('page', String(page))
  return url.toString()
}

function hasUnfilledLocation(url: string): boolean {
  return url.includes('{location}') || url.includes('{Location}')
}

function titleCase(value: string): string {
  return value.replace(/(?:^|-)[a-z]/g, (letter) => letter.toUpperCase())
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
  const priceIndex = buildPriceIndex(objects, source)
  // Several portals describe a home in JSON-LD but leave its photo out of that
  // description, keeping it only in the card markup. Redfin is one: 41
  // listings, not one `image` key between them, while the page itself carries
  // a photo for every card.
  const imageIndex = buildCardImageIndex(html, source)
  const structuredListings = objects
    .filter(isPropertyObject)
    .map((object) => objectToListing(object, {
      defaultCurrency,
      imageIndex,
      listingType,
      portal,
      portalName,
      priceIndex,
      source,
    }))
    .filter((listing): listing is PropertyListing => Boolean(listing))

  const visibleListings = parseVisiblePropertyCards(
    html,
    source,
    listingType,
    defaultCurrency,
  )

  return dedupeListings([...structuredListings, ...visibleListings]).slice(0, 60)
}

function parseVisiblePropertyCards(
  html: string,
  source: URL,
  listingType: PropertyListingType,
  defaultCurrency: string,
): PropertyListing[] {
  const listings: PropertyListing[] = []
  const sourceHost = normalizeSourceHost(source.hostname)
  const portal = `web:${slug(sourceHost)}`
  const portalName = labelFromHost(sourceHost)
  const anchorPattern = /<a\b([^>]{0,4000})>([\s\S]{0,24000}?)<\/a>/gi
  let match: RegExpExecArray | null
  let inspected = 0

  while (
    (match = anchorPattern.exec(html)) !== null &&
    inspected < 800 &&
    listings.length < 60
  ) {
    inspected += 1
    const href = htmlAttribute(match[1] ?? '', ['href'])
    const body = stripAttributeSpill(match[2] ?? '')
    const listingUrl = href ? safeHttpUrl(decodeHtml(href), source) : undefined
    if (!listingUrl || !looksLikePropertyDetail(listingUrl, body)) continue

    const text = cleanHtmlText(body)
    const headingWrapped = isHeadingWrapped(html, match.index)
    const price =
      propertyPrice(text, defaultCurrency) ??
      (headingWrapped
        ? trailingCardPrice(html, anchorPattern.lastIndex, defaultCurrency)
        : undefined)
    const title = propertyCardTitle(body, headingWrapped)
    if (!title || (!price && !propertyCardHasDetail(text))) continue

    const imageUrl = propertyCardImage(body, source)
    const location = propertyCardLocation(body)
    listings.push({
      bathrooms: firstMatchedNumber(text, /\b(\d+(?:[.,]\d+)?)\s*(?:bath|bathroom|salle de bain|banheiro)/i),
      bedrooms: firstMatchedNumber(text, /\b(\d+(?:[.,]\d+)?)\s*(?:bed|bedroom|chambre|quarto)/i),
      currencyCode: price?.currencyCode ?? defaultCurrency,
      id: `${portal}:${hash(listingUrl.toString())}`,
      imageUrl,
      images: imageUrl ? [imageUrl] : undefined,
      listingType,
      listingUrl: listingUrl.toString(),
      location,
      portal,
      portalName,
      priceText: price ? formatMoney(price.value, price.currencyCode) : undefined,
      priceValue: price?.value,
      propertyType: propertyCardType(title),
      title,
    })
  }

  return listings
}

const CARD_PRICE_ELEMENT = /class=["'][^"']*\bprice\b/i
const CARD_TITLE_ELEMENT =
  /<([a-z0-9]+)\b[^>]*\bclass=["'][^"']*\b(?:title|street|address)\b[^"']*["'][^>]*>([\s\S]{0,600}?)<\/\1>/i

function looksLikePropertyDetail(url: URL, body: string): boolean {
  const searchable = `${url.pathname} ${cleanHtmlText(body).slice(0, 500)}`
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (/(?:bedroom|room|house|apartment|appartement|flat|home|villa|property|listing|for-sale|for-rent|to-rent|woning|huur|koop|kamer|studio|vivenda|apartamento|moradia|imovel|immobilier|maison|terrain)/.test(searchable)) {
    return true
  }
  // Craigslist names neither the property nor the deal in its URL, but its
  // cards carry a titled row and a priced row, which is listing markup.
  return CARD_PRICE_ELEMENT.test(body) && CARD_TITLE_ELEMENT.test(body)
}

function propertyCardHasDetail(text: string): boolean {
  return /\b(?:bed|bedroom|bath|bathroom|house|apartment|appartement|flat|villa|woning|kamer|vivenda|apartamento|maison|terrain)\b/i.test(text)
}

// A card names the property in one of four ways: a heading inside the link, a
// row the page itself labels as the title or street, the image alt, or, when
// the heading wraps the link instead of sitting inside it, the link's own text.
function propertyCardTitle(body: string, headingWrapped: boolean): string | undefined {
  const heading = /<h[1-6]\b[^>]*>([\s\S]{1,1000}?)<\/h[1-6]>/i.exec(body)?.[1]
  const labelled = CARD_TITLE_ELEMENT.exec(body)?.[2]
  const image = /<img\b([^>]*)>/i.exec(body)?.[1]
  const candidate = [
    heading ? cleanHtmlText(heading) : '',
    labelled ? cleanHtmlText(labelled) : '',
    image ? decodeHtml(htmlAttribute(image, ['alt', 'title']) ?? '').trim() : '',
    headingWrapped ? cleanHtmlText(body) : '',
  ].find((value) => value.length >= 4) ?? ''
  return candidate.length >= 4 ? candidate.slice(0, 180) : undefined
}

// An attribute holding a bare ">" (data-action="click->open") ends the opening
// tag early, so the rest of the attributes arrive as if they were card text.
// Dropping that run keeps attribute noise out of titles and prices.
function stripAttributeSpill(body: string): string {
  const firstTag = body.indexOf('<')
  const head = firstTag === -1 ? body : body.slice(0, firstTag)
  if (!/=["']/.test(head)) return body
  return firstTag === -1 ? '' : body.slice(firstTag)
}

function isHeadingWrapped(html: string, anchorStart: number): boolean {
  return /<h[1-6]\b[^>]*>\s*$/i.test(html.slice(Math.max(0, anchorStart - 200), anchorStart))
}

// Some portals print the price as a sibling of the card heading rather than
// inside the link. Only the run of markup between this link and the next one
// is read, so a price is never borrowed from the card below, and only a link
// the page itself made the card heading is trusted this way: markup after a
// carousel or badge link is as likely to hold "$88 Lower" as a real rent.
function trailingCardPrice(
  html: string,
  anchorEnd: number,
  defaultCurrency: string,
): { currencyCode: string; value: number } | undefined {
  const window = html.slice(anchorEnd, anchorEnd + TRAILING_PRICE_WINDOW)
  const sameCard = window.split(/<a\b/i)[0] ?? ''
  return propertyPrice(cleanHtmlText(sameCard), defaultCurrency)
}

function propertyCardImage(body: string, source: URL): string | undefined {
  const attributes = /<img\b([^>]*)>/i.exec(body)?.[1]
  const value = attributes
    ? htmlAttribute(attributes, ['src', 'data-src', 'data-lazy-src'])
    : undefined
  return value ? safeHttpUrl(decodeHtml(value), source)?.toString() : undefined
}

function propertyCardLocation(body: string): string | undefined {
  const elementPattern = /<([a-z0-9]+)\b([^>]*\bclass=["'][^"']*(?:location|address|suburb)[^"']*["'][^>]*)>([\s\S]{0,800}?)<\/\1>/gi
  const match = elementPattern.exec(body)
  const value = match ? cleanHtmlText(match[3] ?? '') : ''
  return value || undefined
}

function propertyCardType(title: string): string | undefined {
  return /\b(apartment|flat|house|villa|townhouse|land|plot|terrain|vivenda|apartamento|maison)\b/i
    .exec(title)?.[1]
}

// Symbols that mean one thing wherever they are read.
const UNAMBIGUOUS_PRICE_SYMBOLS = '€|US\\$|N\\$|TSh|\\$'
// Short symbols that are also ordinary letters: P for pula, E for emalangeni,
// M for maloti, MT for metical. Read everywhere, they turn the "m" of
// "Amsterdam 65 m2" into a price, so each one is only live on a page whose own
// currency uses it.
const AMBIGUOUS_PRICE_SYMBOLS: Readonly<Record<string, string>> = {
  AOA: 'Kz|AKZ',
  BWP: 'P',
  CDF: 'FC',
  KMF: 'CF',
  LSL: 'M',
  MGA: 'Ar',
  MUR: 'Rs',
  MWK: 'MK|K',
  MZN: 'MT',
  SCR: 'SR',
  SZL: 'E',
  ZMW: 'K',
}
const PRICE_CURRENCY_CODES =
  'AOA|AKZ|BWP|EUR|GBP|KMF|CDF|USD|SZL|LSL|MGA|MWK|MUR|MZN|NAD|SCR|TZS|ZMW|ZWG'
const PRICE_AMOUNT =
  '(\\d{1,3}(?:[\\s\\u00a0\\u202f\'’.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)'
const pricePatterns = new Map<string, RegExp>()

function pricePattern(defaultCurrency: string): RegExp {
  const currency = defaultCurrency.toUpperCase()
  const cached = pricePatterns.get(currency)
  if (cached) return cached
  const local = AMBIGUOUS_PRICE_SYMBOLS[currency]
  const pattern = new RegExp(
    `(?:\\b(?:${PRICE_CURRENCY_CODES})\\b|${UNAMBIGUOUS_PRICE_SYMBOLS}` +
    `${local ? `|\\b(?:${local})` : ''})\\s*${PRICE_AMOUNT}`,
    'i',
  )
  pricePatterns.set(currency, pattern)
  return pattern
}

function propertyPrice(
  text: string,
  defaultCurrency: string,
): { currencyCode: string; value: number } | undefined {
  const match = pricePattern(defaultCurrency).exec(text)
  if (!match) return undefined
  const amount = match[1] ?? ''
  const value = localizedPositiveNumber(amount)
  if (!value) return undefined
  // "$686+" is the cheapest unit in a block, not the price of this home.
  // A number that is only a floor is worse than no number at all.
  if (text.charAt(match.index + match[0].length) === '+') return undefined
  const symbol = match[0].slice(0, match[0].length - amount.length)
  return {
    currencyCode: propertyCurrencyCode(symbol, defaultCurrency),
    value,
  }
}

function propertyCurrencyCode(value: string, fallback: string): string {
  const normalized = value.toUpperCase().replace(/\s/g, '')
  if (normalized.includes('€') || normalized.includes('EUR')) return 'EUR'
  if (normalized.includes('US$') || normalized === '$' || normalized.includes('USD')) return 'USD'
  if (normalized.includes('N$') || normalized.includes('NAD')) return 'NAD'
  if (normalized.includes('TSH') || normalized.includes('TZS')) return 'TZS'
  if (normalized.includes('KZ') || normalized.includes('AOA')) return 'AOA'
  if (normalized.includes('BWP')) return 'BWP'
  if (normalized.includes('KMF') || normalized.includes('CF')) return 'KMF'
  if (normalized.includes('CDF')) return 'CDF'
  if (normalized.includes('SZL')) return 'SZL'
  if (normalized.includes('LSL')) return 'LSL'
  if (normalized.includes('MGA') || normalized.includes('AR')) return 'MGA'
  if (normalized.includes('MWK') || normalized.includes('MK')) return 'MWK'
  if (normalized.includes('MUR') || normalized.includes('RS')) return 'MUR'
  if (normalized.includes('MZN') || normalized.includes('MT')) return 'MZN'
  if (normalized.includes('SCR') || normalized.includes('SR')) return 'SCR'
  if (normalized.includes('ZMW')) return 'ZMW'
  if (normalized.includes('ZWG')) return 'ZWG'
  return fallback
}

function localizedPositiveNumber(value: string): number | undefined {
  const compact = value.replace(/[\s\u00a0\u202f'’]/g, '').replace(/[.,]+$/, '')
  let normalized = compact
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    normalized = compact.replace(/[.,]/g, '')
  } else if (compact.includes(',') && !compact.includes('.')) {
    normalized = compact.replace(',', '.')
  } else if (compact.includes(',') && compact.includes('.')) {
    const decimal = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.'
    const group = decimal === ',' ? '.' : ','
    normalized = compact.replaceAll(group, '').replace(decimal, '.')
  }
  const number = Number(normalized)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function firstMatchedNumber(text: string, pattern: RegExp): number | undefined {
  const raw = pattern.exec(text)?.[1]
  return raw ? localizedPositiveNumber(raw) : undefined
}

function htmlAttribute(attributes: string, names: string[]): string | undefined {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(
      `\\b${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`,
      'i',
    ).exec(attributes)
    const value = match?.[1] ?? match?.[2]
    if (value?.trim()) return value.trim()
  }
  return undefined
}

function cleanHtmlText(value: string): string {
  return decodeHtml(value.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&euro;|&#8364;|&#x20ac;/gi, '€')
    .replace(/&pound;|&#163;/gi, '£')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, '’')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
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
  // The reader is what gets past a Cloudflare challenge on portals such as
  // Pararius. It answers in markdown unless asked for HTML, and the HTML mode
  // header works without an API key, so it is always sent.
  return timedFetch(`https://r.jina.ai/${safe.toString()}`, {
    apiKey: env.JINA_API_KEY,
    readerMode: true,
  })
}

async function timedFetch(
  url: string,
  reader?: { apiKey?: string; readerMode: boolean },
): Promise<string | undefined> {
  const first = safeHttpUrl(url)
  if (!first) return undefined
  let target: URL = first
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
      const response: Response = await fetch(target.toString(), {
        headers: {
          accept: 'text/html, application/xhtml+xml',
          ...(reader?.readerMode ? { 'x-return-format': 'html' } : {}),
          ...(reader?.apiKey ? { authorization: `Bearer ${reader.apiKey}` } : {}),
        },
        redirect: 'manual',
        signal: controller.signal,
      })
      // A portal that moved its search URL answers 301, which is a redirect to
      // real listings rather than a failure. Every hop is re-checked so a
      // redirect cannot walk the fetch onto a private address.
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location')
        const next: URL | undefined = location ? safeHttpUrl(location, target) : undefined
        if (!next || next.toString() === target.toString()) return undefined
        target = next
        continue
      }
      // AWS WAF token pages answer 202 with no listings at all, so a 202 is
      // never a readable page however successful the status code looks.
      if (!response.ok || response.status === HTTP_ACCEPTED) return undefined
      return readLimitedText(response, MAX_BODY_BYTES)
    }
    return undefined
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

// Portals split one listing across sibling objects: RE/MAX hangs the address
// off offers.itemOffered, and Redfin keeps the residence in one block and the
// price in a Product block that shares only the listing URL. Both halves are
// read here so a fully priced listing is never dropped for want of a name.
function buildPriceIndex(
  objects: Record<string, unknown>[],
  source: URL,
): Map<string, { currencyCode?: string; value: number }> {
  const index = new Map<string, { currencyCode?: string; value: number }>()
  for (const object of objects) {
    if (!isPriceCarrier(object)) continue
    const offer = firstObject(object.offers)
    const value = positiveNumber(offer?.price ?? offer?.lowPrice ?? object.price)
    const rawUrl = listingUrlValue(object)
    const url = rawUrl ? safeHttpUrl(rawUrl, source) : undefined
    if (!value || !url || index.has(url.toString())) continue
    index.set(url.toString(), {
      currencyCode: stringValue(offer?.priceCurrency) ?? stringValue(object.priceCurrency),
      value,
    })
  }
  return index
}

// Page furniture that sits in an <img> but is never a home: sponsor logos,
// UI icons, sprites and tracking pixels. Redfin pairs an internet-provider
// logo with its first card, so this is not hypothetical.
const NON_PHOTO_IMAGE = /(?:logo|icon|sprite|badge|placeholder|avatar|pixel|banner|\.svg(?:$|[?#]))/i

/// Maps each listing link on the page to the photo shown with it, so a listing
/// described without one can still be given its own picture. Keyed by resolved
/// URL, exactly as the price index is.
function buildCardImageIndex(html: string, source: URL): Map<string, string> {
  const index = new Map<string, string>()
  const anchorPattern = /<a(\s[^>]*)>/gi
  let match: RegExpExecArray | null

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = htmlAttribute(match[1] ?? '', ['href'])
    if (!href) continue

    const url = safeHttpUrl(decodeHtml(href), source)
    if (!url || index.has(url.toString())) continue

    // The photo of a card sits inside its own link, so only the markup that
    // immediately follows the anchor can speak for it.
    const window = html.slice(match.index, match.index + MAX_CARD_IMAGE_WINDOW)
    const image = firstCardPhoto(window, source)
    if (image) index.set(url.toString(), image)
  }

  return index
}

function firstCardPhoto(window: string, source: URL): string | undefined {
  const imagePattern = /<img(\s[^>]*)>/gi
  let match: RegExpExecArray | null

  while ((match = imagePattern.exec(window)) !== null) {
    const value = htmlAttribute(match[1] ?? '', ['src', 'data-src', 'data-lazy-src'])
    if (!value || NON_PHOTO_IMAGE.test(value)) continue

    const resolved = safeHttpUrl(decodeHtml(value), source)
    if (resolved) return resolved.toString()
  }

  return undefined
}

function isPriceCarrier(object: Record<string, unknown>): boolean {
  const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']]
  return types.some((type) =>
    typeof type === 'string' &&
    /^(?:product|offer|realestate|residence|accommodation|apartment|house|single)/i.test(type))
}

function objectToListing(
  object: Record<string, unknown>,
  context: {
    defaultCurrency: string
    listingType: PropertyListingType
    portal: string
    portalName: string
    imageIndex: Map<string, string>
    priceIndex: Map<string, { currencyCode?: string; value: number }>
    source: URL
  },
): PropertyListing | undefined {
  const offer = firstObject(object.offers)
  const offered = firstObject(offer?.itemOffered)
  const rawUrl = listingUrlValue(object)
  const listingUrl = rawUrl ? safeHttpUrl(rawUrl, context.source) : undefined
  const address = firstObject(object.address) ?? firstObject(offered?.address)
  const title =
    stringValue(object.name) ??
    stringValue(object.headline) ??
    stringValue(object.title) ??
    stringValue(object.displayName) ??
    addressTitle(address)
  if (!listingUrl || !title) return undefined

  const ownPrice = positiveNumber(
    offer?.price ??
    offer?.lowPrice ??
    object.price ??
    object.priceValue ??
    object.listingPrice,
  )
  const sibling = ownPrice === undefined
    ? context.priceIndex.get(listingUrl.toString())
    : undefined
  const priceValue = ownPrice ?? sibling?.value
  const currencyCode =
    stringValue(offer?.priceCurrency) ??
    stringValue(object.priceCurrency) ??
    stringValue(object.currencyCode) ??
    stringValue(object.currency) ??
    sibling?.currencyCode ??
    context.defaultCurrency
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
  ) ?? context.imageIndex.get(listingUrl.toString())

  return {
    bathrooms: positiveNumber(
      object.numberOfBathroomsTotal ??
      object.numberOfBathrooms ??
      object.bathrooms ??
      object.baths ??
      offered?.numberOfBathroomsTotal ??
      offered?.numberOfBathrooms,
    ),
    bedrooms: positiveNumber(
      object.numberOfBedrooms ??
      object.numberOfRooms ??
      object.bedrooms ??
      object.beds ??
      offered?.numberOfBedrooms ??
      offered?.numberOfRooms,
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
      stringValue(object.propertyType) ??
      stringValue(object.homeType) ??
      typeName(offered?.['@type']) ??
      typeName(object['@type']),
    province: stringValue(address?.addressRegion),
    title,
  }
}

function addressTitle(address: Record<string, unknown> | undefined): string | undefined {
  const parts = [
    stringValue(address?.streetAddress),
    stringValue(address?.addressLocality),
    stringValue(address?.addressRegion),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
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
  label?: string,
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
    portalName: label ?? labelFromHost(url.hostname),
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
  results: GlobalPropertyResult[],
): GlobalPropertyResult[] {
  return [...new Map(results.map((result) => [result.url, result])).values()]
}

function sourceFromUrl(
  urlValue: string,
  count: number,
  ok: boolean,
  label?: string,
): PropertyPortalSourceMeta {
  const url = safeHttpUrl(urlValue)
  const host = normalizeSourceHost(url?.hostname ?? 'web')
  return {
    count,
    id: `web:${slug(host)}`,
    label: label ?? labelFromHost(host),
    ok,
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  }))
  return results
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

// One home is often linked twice on a page: once from its photo and once from
// its heading, and only one of the two carries the price. Keeping the first
// and discarding the second used to throw the price away.
function dedupeListings(listings: PropertyListing[]): PropertyListing[] {
  const merged = new Map<string, PropertyListing>()
  for (const listing of listings) {
    const current = merged.get(listing.listingUrl)
    merged.set(listing.listingUrl, current ? mergeListing(current, listing) : listing)
  }
  return [...merged.values()]
}

function mergeListing(current: PropertyListing, next: PropertyListing): PropertyListing {
  const preferNext = current.priceValue === undefined && next.priceValue !== undefined
  const base = preferNext ? next : current
  const fallback = preferNext ? current : next
  const output: Record<string, unknown> = { ...fallback }
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) output[key] = value
  }
  return output as unknown as PropertyListing
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
