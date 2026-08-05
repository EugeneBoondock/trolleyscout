import type { NearbyStore } from '../../src/services/nearbyStores'
import {
  buildRetailSeasons,
  southAfricanRetailHolidayFallback,
  type RetailHoliday,
  type RetailSeason,
} from '../../src/services/retailSeasons'
import type { Retailer } from '../../src/types'
import type { SearchResult } from '../../src/services/webSearch'
import { buildCountryRetailers, mergeCountryRetailerDiscoveries } from './countryRetailerScout'
import { countryFromCode } from './countryContext'
import { writeSourceCursor } from './dealItemStore'
import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'
import { saveStorePromotions, type StorePromotion } from './locationStore'
import { searchWebWithStatus } from './searchWeb'
import { scoutNearbyStores } from './storeScout'

const HOUR_MS = 60 * 60 * 1_000
const DAY_MS = 24 * HOUR_MS
const SEARCH_DEADLINE_MS = 50_000
const MAX_RESULTS_PER_EVENT = 18
const MAX_STORES_PER_EVENT = 12
const PUBLIC_HOLIDAY_TIMEOUT_MS = 5_000
const ROBOTS_TIMEOUT_MS = 4_000
const COUNTRY_CODE = 'ZA'

const BLOCKED_DISCOVERY_HOSTS = [
  'bing.com',
  'black-friday.global',
  'catalogues24.co.za',
  'cataloguespecials.co.za',
  'coupon.co.za',
  'dealsonspecial.com',
  'duckduckgo.com',
  'facebook.com',
  'flyerok.co.za',
  'guzzle.co.za',
  'instagram.com',
  'linkedin.com',
  'my-catalogue.co.za',
  'pinterest.com',
  'risij.co.za',
  'specialstoday.co.za',
  'tiktok.com',
  'tiendeo.co.za',
  'twitter.com',
  'wikipedia.org',
  'x.com',
  'yahoo.com',
  'youtube.com',
]

// These marketplaces already have direct, public feed adapters. Search results
// from them are used to prioritize their feeds, never mislabelled as a newly
// discovered retailer.
const DIRECT_DEAL_SITE_HOSTS = [
  'daddysdeals.co.za',
  'hyperli.com',
  'onedayonly.co.za',
]

export interface HolidayCampaignPlan {
  aliases: string[]
  cadenceMs: number
  endsOn?: string
  id: string
  queries: string[]
  startsOn?: string
  title: string
}

export interface HolidayCampaignScoutResult {
  checkedEventCount: number
  discoveredRetailerCount: number
  offeredStoreCount: number
  pdfCatalogueCount: number
  skippedEventCount: number
}

interface HolidayCampaignDependencies {
  isDue: (env: TrolleyScoutEnv, campaign: HolidayCampaignPlan, nowMs: number) => Promise<boolean>
  markRun: (env: TrolleyScoutEnv, campaign: HolidayCampaignPlan, nowIso: string) => Promise<void>
  mergeRetailers: typeof mergeCountryRetailerDiscoveries
  now: () => Date
  readHolidays: (fetcher: typeof fetch, now: Date) => Promise<RetailHoliday[]>
  robotsAllows: (fetcher: typeof fetch, url: string) => Promise<boolean>
  savePromotions: typeof saveStorePromotions
  scoutStores: typeof scoutNearbyStores
  search: typeof searchWebWithStatus
}

const defaultDependencies: HolidayCampaignDependencies = {
  isDue: isCampaignDue,
  markRun: markCampaignRun,
  mergeRetailers: mergeCountryRetailerDiscoveries,
  now: () => new Date(),
  readHolidays: readSouthAfricanPublicHolidays,
  robotsAllows: robotsAllowsCampaignPath,
  savePromotions: saveStorePromotions,
  scoutStores: scoutNearbyStores,
  search: searchWebWithStatus,
}

export async function runHolidayCampaignScout(
  env: TrolleyScoutEnv,
  fetcher: typeof fetch = fetch,
  dependencies: HolidayCampaignDependencies = defaultDependencies,
): Promise<HolidayCampaignScoutResult> {
  const empty: HolidayCampaignScoutResult = {
    checkedEventCount: 0,
    discoveredRetailerCount: 0,
    offeredStoreCount: 0,
    pdfCatalogueCount: 0,
    skippedEventCount: 0,
  }
  if (!hasTrolleyScoutDatabase(env)) return empty

  const now = dependencies.now()
  const nowMs = now.getTime()
  const liveHolidays = await dependencies.readHolidays(fetcher, now).catch(() => [])
  const holidays = mergeHolidays(southAfricanRetailHolidayFallback(now), liveHolidays)
  const campaigns = buildHolidayCampaignPlan(now, holidays)
  const country = countryFromCode(COUNTRY_CODE)
  const result = { ...empty }

  for (const campaign of campaigns) {
    if (!await dependencies.isDue(env, campaign, nowMs)) {
      result.skippedEventCount += 1
      continue
    }

    const searches = await Promise.allSettled(
      campaign.queries.map((query) => dependencies.search(query, env.JINA_API_KEY, env)),
    )
    const searchResults = dedupeResults(
      searches.flatMap((settled) => settled.status === 'fulfilled'
        ? settled.value.results
        : []),
    )
      .filter((candidate) => campaignMatchesSearchResult(candidate, campaign))
      .slice(0, MAX_RESULTS_PER_EVENT)

    const allowedResults: SearchResult[] = []
    for (const candidate of searchResults) {
      if (await dependencies.robotsAllows(fetcher, candidate.url)) {
        allowedResults.push(candidate)
      }
    }

    const retailers = buildCountryRetailers(
      country,
      allowedResults.map((candidate) => ({
        title: candidate.title,
        url: candidate.url,
      })),
      MAX_STORES_PER_EVENT,
    )
    const storedRetailers = await dependencies.mergeRetailers(env, country, retailers)
    result.discoveredRetailerCount += retailers.length

    const sourcesByHost = new Map<string, { retailer: Retailer; url: string }>()
    for (const retailer of retailers) {
      for (const source of retailer.sources) {
        const host = safeHost(source.url)
        if (!host || sourcesByHost.has(host)) continue
        sourcesByHost.set(host, { retailer, url: source.url })
      }
    }

    const pdfPromotions: StorePromotion[] = []
    const stores: NearbyStore[] = []
    for (const { retailer, url } of sourcesByHost.values()) {
      const host = safeHost(url)
      if (!host) continue
      const retailerId = storedRetailers.find((candidate) =>
        identityKey(candidate.name) === identityKey(retailer.name),
      )?.id ?? retailer.id
      const placeId = `campaign:${safeSlug(campaign.id)}:${COUNTRY_CODE.toLowerCase()}:${host}`

      if (/\.pdf(?:$|\?)/i.test(url)) {
        pdfPromotions.push({
          countryCode: COUNTRY_CODE,
          id: `${placeId}:pdf:${stableHash(url)}`,
          kind: 'catalogue',
          placeId,
          productUrl: url,
          retailerId,
          sourceUrl: url,
          storeName: retailer.name,
          title: `${retailer.name} ${campaign.title} offers`,
          validTo: campaign.endsOn,
        })
        continue
      }

      stores.push({
        countryCode: COUNTRY_CODE,
        countryName: country.name,
        lat: 0,
        lon: 0,
        name: retailer.name,
        placeId,
        retailerId,
        scoutIntervalMs: campaign.cadenceMs,
        sourceCategory: 'holiday-campaign',
        website: url,
        websiteSource: 'country-retailer',
      })
    }

    if (pdfPromotions.length > 0) {
      await dependencies.savePromotions(env, pdfPromotions, nowMs)
      result.pdfCatalogueCount += pdfPromotions.length
    }
    if (stores.length > 0) {
      await dependencies.scoutStores(
        env,
        stores,
        nowMs,
        Math.min(stores.length, MAX_STORES_PER_EVENT),
        nowMs + SEARCH_DEADLINE_MS,
      )
      result.offeredStoreCount += stores.length
    }

    await dependencies.markRun(env, campaign, now.toISOString())
    result.checkedEventCount += 1
  }

  return result
}

export function buildHolidayCampaignPlan(
  now: Date,
  holidays: readonly RetailHoliday[],
): HolidayCampaignPlan[] {
  return buildRetailSeasons(COUNTRY_CODE, now, holidays)
    .filter((season) => season.status !== 'always')
    .map((season) => {
      const aliases = campaignAliases(season)
      const blackFriday = season.id.startsWith('black-friday-')
      const startsMs = season.startsOn ? Date.parse(`${season.startsOn}T00:00:00Z`) : now.getTime()
      const daysUntil = Math.ceil((startsMs - now.getTime()) / DAY_MS)
      const cadenceMs = blackFriday
        ? daysUntil <= 14 ? HOUR_MS : 3 * HOUR_MS
        : daysUntil <= 14 ? 3 * HOUR_MS : 12 * HOUR_MS
      return {
        aliases,
        cadenceMs,
        endsOn: season.endsOn,
        id: season.id,
        queries: campaignQueries(season, aliases),
        startsOn: season.startsOn,
        title: season.title,
      }
    })
}

function campaignQueries(season: RetailSeason, _aliases: string[]): string[] {
  const event = season.title.replace(/^National\s+/i, '').trim()
  const queries = [
    `\"${event}\" deals specials South Africa`,
    `\"${event}\" sale discount offers South Africa`,
    `\"${event}\" promotion retailer site:co.za`,
  ]

  if (season.id.startsWith('black-friday-')) {
    queries.push(
      'Black Friday South Africa grocery supermarket deals',
      'Black Friday South Africa electronics appliances deals',
      'Black Friday South Africa fashion beauty deals',
      'Black Friday South Africa home furniture hardware deals',
      'Black Friday South Africa travel flights hotel deals',
      'Black Friday South Africa mobile data contract deals',
      'Black Friday South Africa toys gifts deals',
    )
  }

  return [...new Set(queries)]
}

function mergeHolidays(...groups: readonly RetailHoliday[][]): RetailHoliday[] {
  const byDateAndName = new Map<string, RetailHoliday>()
  for (const holiday of groups.flat()) {
    byDateAndName.set(`${holiday.date}:${normalize(holiday.name)}`, holiday)
  }
  return [...byDateAndName.values()]
}

function campaignAliases(season: RetailSeason): string[] {
  const values = [season.title, ...season.searchTerms]
    .map((value) => value.replace(/^national\s+/i, '').trim())
    .filter((value) => value.length >= 4)
  return [...new Set(values.map(normalize).filter(Boolean))]
}

export function campaignMatchesSearchResult(
  result: SearchResult,
  campaign: HolidayCampaignPlan,
): boolean {
  const url = safeCampaignUrl(result.url)
  if (!url) return false
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (
    BLOCKED_DISCOVERY_HOSTS.some((blocked) => sameOrSubdomain(host, blocked)) ||
    DIRECT_DEAL_SITE_HOSTS.some((blocked) => sameOrSubdomain(host, blocked))
  ) {
    return false
  }

  const eventYear = campaign.startsOn?.slice(0, 4)
  const otherYear = `${result.title} ${url.pathname}`.match(/\b(20\d{2})\b/)?.[1]
  if (eventYear && otherYear && otherYear !== eventYear) return false

  const searchable = normalize(`${result.title} ${url.pathname} ${url.search}`)
  const mentionsEvent = campaign.aliases.some((alias) => searchable.includes(alias))
  const promotional = /\b(?:black friday|cyber monday|deals?|discounts?|offers?|promos?|sales?|specials?)\b/.test(searchable)
  const countryRelevant = host.endsWith('.za') || /\b(?:south africa|za)\b/.test(searchable)
  return mentionsEvent && promotional && countryRelevant
}

export async function robotsAllowsCampaignPath(
  fetcher: typeof fetch,
  target: string,
): Promise<boolean> {
  const url = safeCampaignUrl(target)
  if (!url) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ROBOTS_TIMEOUT_MS)
  try {
    const response = await fetcher(`${url.origin}/robots.txt`, {
      headers: { accept: 'text/plain', 'user-agent': 'TrolleyScout/1.0' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (response.status === 404 || response.status === 410) return true
    if (!response.ok) return false
    return robotsTextAllowsPath(await response.text(), `${url.pathname}${url.search}`)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function robotsTextAllowsPath(robots: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; value: string }> }> = []
  let current: { agents: string[]; rules: Array<{ allow: boolean; value: string }> } | undefined

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
    } else if ((key === 'allow' || key === 'disallow') && current) {
      if (value || key === 'allow') current.rules.push({ allow: key === 'allow', value })
    }
  }

  const named = groups.filter((group) => group.agents.some((agent) => agent === 'trolleyscout'))
  const applicable = named.length > 0
    ? named
    : groups.filter((group) => group.agents.some((agent) => agent === '*'))
  const rules = applicable.flatMap((group) => group.rules)
    .filter((rule) => rule.value && robotsRuleMatches(rule.value, path))
    .sort((left, right) => right.value.length - left.value.length || Number(right.allow) - Number(left.allow))
  return rules[0]?.allow ?? true
}

async function readSouthAfricanPublicHolidays(
  fetcher: typeof fetch,
  now: Date,
): Promise<RetailHoliday[]> {
  const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1]
  const lists = await Promise.all(years.map(async (year) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PUBLIC_HOLIDAY_TIMEOUT_MS)
    try {
      const response = await fetcher(
        `https://date.nager.at/api/v3/publicholidays/${year}/${COUNTRY_CODE}`,
        { headers: { accept: 'application/json' }, signal: controller.signal },
      )
      if (!response.ok) return []
      const payload = await response.json() as unknown
      if (!Array.isArray(payload)) return []
      return payload.flatMap((entry): RetailHoliday[] => {
        if (!entry || typeof entry !== 'object') return []
        const value = entry as Record<string, unknown>
        if (
          typeof value.date !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
          typeof value.name !== 'string' ||
          value.global === false ||
          (Array.isArray(value.types) && !value.types.includes('Public'))
        ) return []
        return [{
          date: value.date,
          localName: typeof value.localName === 'string' ? value.localName : undefined,
          name: value.name,
        }]
      })
    } catch {
      return []
    } finally {
      clearTimeout(timer)
    }
  }))
  return lists.flat()
}

async function isCampaignDue(
  env: TrolleyScoutEnv,
  campaign: HolidayCampaignPlan,
  nowMs: number,
): Promise<boolean> {
  if (!env.DB) return false
  try {
    const row = await env.DB.prepare(
      'SELECT updated_at FROM deal_source_cursors WHERE source_key = ?',
    ).bind(campaignSourceKey(campaign)).first<{ updated_at: string }>()
    return !row || nowMs - Date.parse(row.updated_at) >= campaign.cadenceMs
  } catch {
    return true
  }
}

async function markCampaignRun(
  env: TrolleyScoutEnv,
  campaign: HolidayCampaignPlan,
  nowIso: string,
): Promise<void> {
  await writeSourceCursor(env, {
    cursor: { kind: 'token', token: 'checked' },
    sourceKey: campaignSourceKey(campaign),
    updatedAt: nowIso,
  }).catch(() => undefined)
}

function campaignSourceKey(campaign: HolidayCampaignPlan): string {
  return `holiday-campaign::${campaign.id}`
}

function robotsRuleMatches(rule: string, path: string): boolean {
  const endAnchored = rule.endsWith('$')
  const pattern = rule.replace(/\$$/, '')
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${pattern}${endAnchored ? '$' : ''}`).test(path)
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    const url = safeCampaignUrl(result.url)
    if (!url) return false
    url.hash = ''
    const key = url.toString()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function safeCampaignUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      isPrivateHost(url.hostname)
    ) return undefined
    return url
  } catch {
    return undefined
  }
}

function isPrivateHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '')
  return value === 'localhost' || value.endsWith('.local') ||
    /^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) ||
    /^169\.254\./.test(value) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(value) ||
    value === '::1'
}

function safeHost(value: string): string | undefined {
  return safeCampaignUrl(value)?.hostname.replace(/^www\./, '').toLowerCase()
}

function sameOrSubdomain(host: string, blocked: string): boolean {
  return host === blocked || host.endsWith(`.${blocked}`)
}

function identityKey(value: string): string {
  return normalize(value).replace(/\s+/g, '')
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

function safeSlug(value: string): string {
  return normalize(value).replace(/\s+/g, '-').slice(0, 80) || 'event'
}

function stableHash(value: string): string {
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}
