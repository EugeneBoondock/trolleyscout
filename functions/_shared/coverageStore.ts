import { getStaticRetailersPayload } from '../../src/api/staticData'
import { selectCatalogueInventory } from '../../src/services/catalogueSelection'
import type { CoverageFreshness, CoverageLedger, Retailer, StoreLeaflet } from '../../src/types'
import { countryFromCode } from './countryContext'
import type { TrolleyScoutEnv } from './env'

const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

interface DirectoryRow {
  checked_at: string
  country_code: string
  retailers_json: string
  source_count: number
}

interface StoreRow {
  country_code: string
  store_count: number
  with_promotions_count: number
}

interface DealRow {
  country_code: string
  deal_count: number
  last_captured_at: string | null
  retailer_count: number
}

interface LeafletSnapshotRow {
  checked_at: string
  deals_json: string
}

interface CatalogueCoverage {
  catalogueCount: number
  checkedAt: string
  retailerCount: number
}

export async function readCoverageLedger(
  env: TrolleyScoutEnv,
  now = new Date().toISOString(),
): Promise<CoverageLedger> {
  const base = getStaticRetailersPayload()
  const directoryRows = await readRows<DirectoryRow>(env, `
    SELECT country_code, retailers_json, checked_at, source_count
      FROM country_retailer_cache
      ORDER BY country_code`)
  const storeRows = await readRows<StoreRow>(env, `
    SELECT country_code,
      COUNT(*) AS store_count,
      SUM(CASE WHEN promotion_count > 0 THEN 1 ELSE 0 END) AS with_promotions_count
      FROM discovered_stores
      GROUP BY country_code`)
  const dealRows = await readRows<DealRow>(env, `
    SELECT country_code,
      COUNT(*) AS deal_count,
      COUNT(DISTINCT retailer_id) AS retailer_count,
      MAX(captured_at) AS last_captured_at
      FROM deal_items
      WHERE status = 'active' AND expires_at > ?
      GROUP BY country_code`, [now])
  const leafletRows = await readRows<LeafletSnapshotRow>(env, `
    SELECT checked_at, deals_json
      FROM deal_snapshots
      WHERE source_key = '__leaflets__'
      LIMIT 1`)

  const directories = new Map<string, {
    checkedAt?: string
    retailerCount: number
    sourceCount: number
  }>()
  directories.set('ZA', {
    retailerCount: base.summary.retailerCount,
    sourceCount: base.summary.sourceCount,
  })
  for (const row of directoryRows) {
    const code = row.country_code.trim().toUpperCase()
    if (code === 'ZA') continue
    const retailers = parseRetailers(row.retailers_json)
    directories.set(code, {
      checkedAt: row.checked_at,
      retailerCount: retailers.length,
      sourceCount: Math.max(Number(row.source_count) || 0, countSources(retailers)),
    })
  }

  const stores = new Map(storeRows.map((row) => [row.country_code.trim().toUpperCase(), row]))
  const deals = new Map(dealRows.map((row) => [row.country_code.trim().toUpperCase(), row]))
  const catalogues = catalogueCoverageByCountry(leafletRows[0], now)
  const codes = new Set([
    ...directories.keys(),
    ...stores.keys(),
    ...deals.keys(),
    ...catalogues.keys(),
  ])
  const nowMs = Date.parse(now)
  const markets = Array.from(codes, (code) => {
    const country = countryFromCode(code)
    const directory = directories.get(code)
    const store = stores.get(code)
    const deal = deals.get(code)
    const catalogue = catalogues.get(code)
    const latest = latestDate(
      directory?.checkedAt,
      deal?.last_captured_at ?? undefined,
      catalogue?.checkedAt,
    )
    return {
      activeCatalogueCount: catalogue?.catalogueCount ?? 0,
      activeCatalogueRetailerCount: catalogue?.retailerCount ?? 0,
      activeDealCount: Number(deal?.deal_count ?? 0),
      activeDealRetailerCount: Number(deal?.retailer_count ?? 0),
      code: country.code,
      catalogueCheckedAt: catalogue?.checkedAt,
      directoryCheckedAt: directory?.checkedAt,
      discoveredStoreCount: Number(store?.store_count ?? 0),
      flag: country.flag,
      freshness: freshness(latest, nowMs),
      lastDealCapturedAt: deal?.last_captured_at ?? undefined,
      name: country.name,
      officialSourceCount: directory?.sourceCount ?? 0,
      retailerCount: directory?.retailerCount ?? Number(deal?.retailer_count ?? 0),
      storesWithPromotionsCount: Number(store?.with_promotions_count ?? 0),
    }
  }).sort((left, right) =>
    right.activeDealCount - left.activeDealCount ||
    right.discoveredStoreCount - left.discoveredStoreCount ||
    left.name.localeCompare(right.name))

  return {
    generatedAt: now,
    markets,
    summary: {
      activeCatalogueCount: sum(markets, 'activeCatalogueCount'),
      activeDealCount: sum(markets, 'activeDealCount'),
      activeMarketCount: markets.length,
      discoveredStoreCount: sum(markets, 'discoveredStoreCount'),
      liveMarketCount: markets.filter((market) => market.freshness === 'live').length,
      officialSourceCount: sum(markets, 'officialSourceCount'),
      retailerCount: sum(markets, 'retailerCount'),
    },
  }
}

function catalogueCoverageByCountry(
  row: LeafletSnapshotRow | undefined,
  now: string,
): Map<string, CatalogueCoverage> {
  const result = new Map<string, CatalogueCoverage>()
  if (!row) return result

  let leaflets: StoreLeaflet[]
  try {
    const parsed: unknown = JSON.parse(row.deals_json)
    leaflets = Array.isArray(parsed)
      ? parsed.filter((item): item is StoreLeaflet => Boolean(item) && typeof item === 'object')
      : []
  } catch {
    return result
  }

  const leafletsByCountry = new Map<string, StoreLeaflet[]>()
  for (const leaflet of leaflets) {
    const code = (leaflet.countryCode ?? 'ZA').trim().toUpperCase()
    const countryLeaflets = leafletsByCountry.get(code) ?? []
    countryLeaflets.push(leaflet)
    leafletsByCountry.set(code, countryLeaflets)
  }

  for (const [code, countryLeaflets] of leafletsByCountry) {
    const selected = selectCatalogueInventory(countryLeaflets, new Date(now))
    if (selected.length === 0) continue
    result.set(code, {
      catalogueCount: selected.length,
      checkedAt: row.checked_at,
      retailerCount: new Set(selected.map(canonicalCatalogueRetailerKey)).size,
    })
  }
  return result
}

function canonicalCatalogueRetailerKey(leaflet: StoreLeaflet): string {
  const words = `${leaflet.retailerId} ${leaflet.retailerName}`
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (/\busave\b/.test(words)) return 'usave'
  if (/\b(?:spar|superspar|kwikspar)\b/.test(words)) return 'spar'
  if (/\bcheckers\b/.test(words)) return 'checkers'
  if (/\bshoprite\b/.test(words)) return 'shoprite'
  if (/\bpick n pay\b|\bpnp\b/.test(words)) return 'pick-n-pay'
  if (/\bboxer\b/.test(words)) return 'boxer'
  if (/\bok foods?\b/.test(words)) return 'ok-foods'
  if (/\bfood lovers?\b/.test(words)) return 'food-lovers'
  return leaflet.retailerId.trim().toLowerCase() || words
}

async function readRows<T>(
  env: TrolleyScoutEnv,
  sql: string,
  bindings: unknown[] = [],
): Promise<T[]> {
  if (!env.DB) return []
  try {
    return (await env.DB.prepare(sql).bind(...bindings).all<T>()).results
  } catch {
    return []
  }
}

function parseRetailers(value: string): Retailer[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Retailer => Boolean(item) && typeof item === 'object')
      : []
  } catch {
    return []
  }
}

function countSources(retailers: Retailer[]) {
  return retailers.reduce((total, retailer) => total + (Array.isArray(retailer.sources) ? retailer.sources.length : 0), 0)
}

function latestDate(...values: Array<string | undefined>): string | undefined {
  return values.filter(Boolean).sort((left, right) => Date.parse(right!) - Date.parse(left!))[0]
}

function freshness(latest: string | undefined, nowMs: number): CoverageFreshness {
  if (!latest) return 'building'
  const age = nowMs - Date.parse(latest)
  if (!Number.isFinite(age) || age < 0) return 'building'
  if (age <= LIVE_WINDOW_MS) return 'live'
  if (age <= RECENT_WINDOW_MS) return 'recent'
  return 'building'
}

function sum<K extends 'activeCatalogueCount' | 'activeDealCount' | 'discoveredStoreCount' | 'officialSourceCount' | 'retailerCount'>(
  markets: CoverageLedger['markets'],
  key: K,
) {
  return markets.reduce((total, market) => total + market[key], 0)
}
