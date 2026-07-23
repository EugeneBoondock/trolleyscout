import { countSources, getSourceKinds } from '../../src/services/sourceEngine'
import type { NearbyStore } from '../../src/services/nearbyStores'
import type { Retailer, RetailerGroup, SourceKind } from '../../src/types'
import type { CountryOption } from '../../src/types'
import type { TrolleyScoutEnv } from './env'
import { searchWeb } from './searchWeb'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const RESULT_LIMIT = 18
const BLOCKED_HOSTS = [
  'cataloguespecials.',
  'facebook.com',
  'guzzle.',
  'instagram.com',
  'kimbino.',
  'linkedin.com',
  'tiktok.com',
  'tiendeo.',
  'wikipedia.org',
  'youtube.com',
  'yellowpages',
  'tripadvisor.',
]

interface RetailerCacheRow {
  checked_at: string
  retailers_json: string
}

interface StoreWebsiteRow {
  store_name: string
  website: string
}

export async function getCountryRetailers(
  env: TrolleyScoutEnv,
  country: CountryOption,
): Promise<Retailer[]> {
  const cached = await readCache(env, country.code)
  if (cached && Date.now() - Date.parse(cached.checked_at) < CACHE_TTL_MS) {
    const parsed = parseRetailerCache(cached.retailers_json)
    if (parsed.length > 0) return parsed
  }

  const [results, stores] = await Promise.all([
    searchWeb(
      `supermarkets grocery chains ${country.name} official specials catalogues`,
      env.JINA_API_KEY,
    ),
    readStoreWebsites(env, country.code),
  ])

  const discovered = buildCountryRetailers(country, [
    ...stores.map((store) => ({ title: store.store_name, url: store.website })),
    ...results,
  ])

  if (discovered.length > 0) {
    await writeCache(env, country.code, discovered)
    return discovered
  }

  return cached ? parseRetailerCache(cached.retailers_json) : []
}

export function buildCountryRetailers(
  country: CountryOption,
  results: Array<{ title: string; url: string }>,
): Retailer[] {
  const byBrand = new Map<string, Retailer>()

  for (const result of results) {
    const url = safeHttpUrl(result.url)
    if (!url || BLOCKED_HOSTS.some((host) => url.hostname.includes(host))) continue

    const host = url.hostname.replace(/^www\./, '')
    const name = retailerName(result.title, host)
    if (!name || !looksOfficial(name, host)) continue

    const sourceKind: SourceKind = /special|deal|promot|catalog|leaflet|offer/i.test(url.pathname)
      ? 'specials'
      : 'store-finder'
    const source = {
      kind: sourceKind,
      label: sourceKind === 'specials' ? 'Offers and catalogues' : 'Official website',
      url: url.toString(),
    } as const
    const brandKey = slug(name)
    const existing = byBrand.get(brandKey)
    if (existing) {
      if (!existing.sources.some((item) => safeHost(item.url) === host)) {
        existing.sources.push(source)
      }
      continue
    }
    if (byBrand.size >= RESULT_LIMIT) break

    const checked = new Date().toISOString().slice(0, 10)

    byBrand.set(brandKey, {
      accentColor: colorFromHost(host),
      group: classifyGroup(name),
      id: `country:${country.code.toLowerCase()}:${slug(host)}`,
      name,
      program: `${country.name} store`,
      shortName: name,
      sourceNote: `Found from a live ${country.name} web search. Open the source to confirm current local offers.`,
      sources: [source],
      verifiedOn: checked,
    })
  }

  return [...byBrand.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function resolveCountryRetailerWebsite(
  storeName: string,
  country: CountryOption,
  retailers: Retailer[],
): string | undefined {
  const storeTokens = new Set(words(storeName))
  if (storeTokens.size === 0) return undefined

  const countryTokens = new Set(words(country.name))
  const matches: Array<{ retailer: Retailer; score: number }> = []

  for (const retailer of retailers) {
    const brandTokens = words(retailer.name).filter((token) => (
      !countryTokens.has(token) &&
      !RETAILER_NAME_STOP_WORDS.has(token) &&
      (token.length >= 3 || token === 'ok')
    ))
    if (
      brandTokens.length === 0 ||
      !brandTokens.every((token) => storeTokens.has(token))
    ) {
      continue
    }

    matches.push({
      retailer,
      score: brandTokens.reduce((total, token) => total + token.length, 0),
    })
  }

  matches.sort((left, right) => right.score - left.score)
  if (
    matches.length === 0 ||
    (matches[1] && matches[1].score === matches[0]?.score)
  ) {
    return undefined
  }

  return preferredRetailerSource(matches[0]!.retailer)?.url
}

export function applyCountryRetailerWebsites(
  stores: NearbyStore[],
  country: CountryOption,
  retailers: Retailer[],
): NearbyStore[] {
  return stores.map((store) => {
    if (store.website) return store
    const website = resolveCountryRetailerWebsite(store.name, country, retailers)
    return website ? { ...store, website } : store
  })
}

export function countryRetailerSummary(retailers: Retailer[]) {
  return {
    dataPolicy: 'International sources are found from live web search and retain their source link and check date.',
    retailerCount: retailers.length,
    sourceCount: countSources(retailers),
    sourceKinds: getSourceKinds(retailers),
    verifiedOfferCount: 0,
  }
}

async function readCache(env: TrolleyScoutEnv, countryCode: string): Promise<RetailerCacheRow | undefined> {
  if (!env.DB) return undefined
  try {
    return (await env.DB.prepare(
      'SELECT retailers_json, checked_at FROM country_retailer_cache WHERE country_code = ?',
    ).bind(countryCode).first<RetailerCacheRow>()) ?? undefined
  } catch {
    return undefined
  }
}

async function writeCache(env: TrolleyScoutEnv, countryCode: string, retailers: Retailer[]): Promise<void> {
  if (!env.DB) return
  try {
    await env.DB.prepare(
      `INSERT INTO country_retailer_cache (country_code, retailers_json, checked_at, source_count)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (country_code) DO UPDATE SET
          retailers_json = excluded.retailers_json,
          checked_at = excluded.checked_at,
          source_count = excluded.source_count`,
    ).bind(countryCode, JSON.stringify(retailers), new Date().toISOString(), countSources(retailers)).run()
  } catch {
    // A failed cache write must not hide live results.
  }
}

async function readStoreWebsites(env: TrolleyScoutEnv, countryCode: string): Promise<StoreWebsiteRow[]> {
  if (!env.DB) return []
  try {
    const rows = await env.DB.prepare(
      `SELECT store_name, website FROM discovered_stores
        WHERE country_code = ? AND website IS NOT NULL
        ORDER BY last_seen_at DESC LIMIT 100`,
    ).bind(countryCode).all<StoreWebsiteRow>()
    return rows.results
  } catch {
    return []
  }
}

function parseRetailerCache(value: string): Retailer[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as Retailer[] : []
  } catch {
    return []
  }
}

function safeHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined
  } catch {
    return undefined
  }
}

function retailerName(title: string, host: string): string {
  const first = title.split(/\s+(?:[|\u2013\u2014-])\s+/)[0]?.trim()
  const generic = /^(home|official site|supermarkets?|grocery stores?|specials?|catalogues?)$/i
  if (first && first.length >= 2 && first.length <= 60 && !generic.test(first)) return first
  const token = host.split('.').slice(-2, -1)[0] ?? host
  return token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const RETAILER_NAME_STOP_WORDS = new Set([
  'and',
  'cash',
  'carry',
  'food',
  'foods',
  'fresh',
  'grocer',
  'grocery',
  'local',
  'market',
  'online',
  'shop',
  'store',
  'stores',
  'supermarket',
  'supermarkets',
])

function words(value: string): string[] {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function preferredRetailerSource(retailer: Retailer) {
  return [...retailer.sources]
    .filter((source) => safeHttpUrl(source.url))
    .sort((left, right) => sourceScore(right) - sourceScore(left))[0]
}

function sourceScore(source: Retailer['sources'][number]): number {
  let score = source.kind === 'specials' ? 100 : 0
  try {
    const url = new URL(source.url)
    if (/special|deal|promot|catalog|leaflet|offer/i.test(url.pathname)) score += 80
    if (/(?:^|[.-])(?:online|shop)(?:[.-]|$)/i.test(url.hostname)) score += 40
  } catch {
    return -1
  }
  return score
}

function safeHost(value: string): string | undefined {
  return safeHttpUrl(value)?.hostname.replace(/^www\./, '')
}

function looksOfficial(name: string, host: string): boolean {
  const nameTokens = slug(name).split('-').filter((token) => token.length >= 4)
  const hostToken = slug(host)
  return nameTokens.some((token) => hostToken.includes(token))
}

function classifyGroup(name: string): RetailerGroup {
  if (/pharmacy|chemist|drug/i.test(name)) return 'Pharmacy'
  if (/market|grocery|super|food/i.test(name)) return 'Supermarket'
  if (/wholesale|cash and carry/i.test(name)) return 'Wholesale'
  return 'General retailer'
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function colorFromHost(host: string): string {
  let hash = 0
  for (const character of host) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360} 58% 36%)`
}
