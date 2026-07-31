// Admin-only, on-demand run of the scout lanes the older "refresh deal
// sources" control never reached: the structured retailer feeds (Takealot
// campaign shards, Woolworths, Clicks, Dis-Chem, Makro, Game, Builders, Mr
// Price, Loot, Evetech, Wootware, Bob Shop, Decathlon) and the online-only
// storefront sweep over the country registries. Both otherwise only run on the
// 3-hourly cron, so after a deploy there was no way to kick them.
//
// This is a Pages Function, not the cron Worker, so it cannot run for minutes.
// One press takes a bounded slice and reports what it actually did. The stored
// cursors carry the rest: feeds resume from deal_source_cursors and shops from
// store_scout_log's day-long cooldown, so pressing again continues the sweep
// exactly the way the scheduled run advances it.

import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from '../../_shared/env'
import { readLeafletSnapshot } from '../../_shared/dealSnapshotStore'
import { getMemberSession } from '../../_shared/memberStore'
import { countryFromCode } from '../../_shared/countryContext'
import { buildRegistryOnlineStores } from '../../_shared/registryOnlineScout'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'
import {
  getStructuredRetailerSources,
  runStructuredRetailerFeedScout,
  type RetailerFeedSource,
} from '../../_shared/retailerFeedScout'
import { scoutNearbyStores } from '../../_shared/storeScout'
import {
  defaultVoucherSources,
  runVoucherScout,
  type VoucherScoutSource,
} from '../../_shared/voucherScout'
import {
  discoverVoucherSources,
  listDiscoveredVoucherSources,
} from '../../_shared/voucherSourceScout'
import { getStaticRetailersPayload } from '../../../src/api/staticData'
import { leafletTargets } from '../../../src/services/leafletDiscovery'
import type { StoreLeaflet } from '../../../src/types'
import { refreshLeafletCache } from '../discovery'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

const SCOUT_LANES = ['all', 'catalogues', 'feeds', 'stores', 'vouchers'] as const

// Opts a press out of country scoping and back into every registered country.
const ALL_COUNTRIES = 'ALL'

export type ScoutLane = (typeof SCOUT_LANES)[number]

interface LaneBounds {
  feedRequestCap: number
  storeLimit: number
  // How many voucher sources a press may sweep. Each source costs several
  // subrequests, so "all" takes a small slice and the cursor carries the rest.
  voucherSourceLimit: number
}

// Deliberately modest next to the cron (45 feed requests, 40 storefronts): a
// single press has to answer inside the edge request window. A lane run on its
// own gets the larger slice; "all" splits the budget across both.
const LANE_BOUNDS: Record<ScoutLane, LaneBounds> = {
  all: { feedRequestCap: 6, storeLimit: 10, voucherSourceLimit: 2 },
  catalogues: { feedRequestCap: 0, storeLimit: 0, voucherSourceLimit: 0 },
  feeds: { feedRequestCap: 10, storeLimit: 0, voucherSourceLimit: 0 },
  stores: { feedRequestCap: 0, storeLimit: 24, voucherSourceLimit: 0 },
  vouchers: { feedRequestCap: 0, storeLimit: 0, voucherSourceLimit: 6 },
}

// Shorter than the scout's own 12s default so one stalled source cannot eat the
// whole request budget.
const FEED_TIMEOUT_MS = 6_000
const MAX_REPORTED_FAILURES = 5

// The store sweep stops here however many shops are left. Shops that never
// answer cost a full timeout each, and outside South Africa many do, so a run
// bounded only by shop count kept outlasting the app waiting on it. Well
// inside the mobile client's budget, which also has to cover the discovery
// refresh it runs first.
const STORE_LANE_BUDGET_MS = 20_000

interface LaneFailure {
  key: string
  message: string
}

interface FeedLaneSummary {
  acceptedDealCount: number
  catalogueCount: number
  checkedSourceCount: number
  failed: boolean
  failedSourceCount: number
  failures: LaneFailure[]
  message?: string
  ran: boolean
  requestCap: number
}

interface StoreLaneSummary {
  failed: boolean
  message?: string
  ran: boolean
  storeLimit: number
  // Shops in this country that are off cooldown and waiting for a turn, so the
  // console can say how much of the sweep is still ahead.
  storesPending: number
  // Promotions recorded against the shops scouted in this window. A shop whose
  // fetch failed keeps its previous count, so treat this as "promotions on
  // record for what was swept", not "promotions added".
  storePromotionCount: number
  storesOffered: number
  storesScouted: number
}

interface CatalogueLaneSummary {
  catalogueCount: number
  failed: boolean
  message?: string
  ran: boolean
  sourceCount: number
}

interface VoucherLaneSummary {
  // Voucher pages the sweep found for itself this press.
  discoveredSourceCount: number
  // Vouchers whose validity ran out during this press.
  expiredCount: number
  failed: boolean
  message?: string
  ran: boolean
  sourceCount: number
  // Sources that answered with nothing usable, which is the signal that a
  // voucher page has moved or gone behind a login.
  emptySourceCount: number
  voucherCount: number
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  // A scout run has side effects (writes deals, claims shops), so it is POST
  // only — never reachable by a link or a prefetch.
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const session = await getMemberSession(env, request)

  // The role is read from the account row server-side — never from the client.
  // Nothing above this line has started any work.
  if (session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { message: 'Request origin is not allowed.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  let body: Record<string, unknown> = {}

  if (request.headers.get('content-type')?.includes('json')) {
    try {
      body = await readJsonObjectBody(request)
    } catch (error) {
      const tooLarge = error instanceof RangeError
      return json(
        { issues: [tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.'] },
        { headers: privateHeaders, status: tooLarge ? 413 : 400 },
      )
    }
  }

  const lane = readLane(body.lane, request.url)

  if (!lane) {
    return json(
      { issues: ['Provide a lane of all, catalogues, feeds, or stores.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  // The country the admin is currently working in, which the session already
  // reflects through their country switch. A press sweeps that country's shops
  // and nobody else's, so an admin looking at the Netherlands is not spending
  // their run on South African ones. "all" opts back into every country.
  const country = readCountry(body.country, request.url, session.account.countryCode)
  const wholeWorld = country === ALL_COUNTRIES

  // This lane used to be South-Africa-only, on the grounds that every
  // structured feed was a South African retailer. The American chains ended
  // that, and the old rule then had it exactly backwards: pressing this while
  // looking at the United States skipped the only nineteen sources that serve
  // it. A press now runs whatever feeds belong to the country being swept.
  const feedSources = wholeWorld
    ? getStructuredRetailerSources()
    : sourcesForCountry(country)
  const wantsFeeds = lane === 'all' || lane === 'feeds'
  const feedsApply = feedSources.length > 0
  const bounds = feedsApply
    ? LANE_BOUNDS[lane]
    : {
      feedRequestCap: 0,
      storeLimit: LANE_BOUNDS[lane].storeLimit || LANE_BOUNDS.stores.storeLimit,
      voucherSourceLimit: LANE_BOUNDS[lane].voucherSourceLimit,
    }
  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  const databaseAvailable = hasTrolleyScoutDatabase(env)

  // Sequential, not parallel: the two lanes share the same subrequest budget,
  // and the store sweep counts its own work from the scout log afterwards.
  const feeds = bounds.feedRequestCap > 0
    ? await runFeedLane(env, bounds.feedRequestCap, feedSources)
    : skippedFeedLane()
  const stores = bounds.storeLimit > 0
    ? await runStoreLane(
      env,
      bounds.storeLimit,
      startedAtMs,
      startedAt,
      wholeWorld ? undefined : [country],
    )
    : skippedStoreLane()
  const catalogues = lane === 'all' || lane === 'catalogues'
    ? await runCatalogueLane(env, wholeWorld ? undefined : country)
    : skippedCatalogueLane()
  // Vouchers ride along with a plain press. They were only ever collected by
  // the 3-hourly cron, so after a deploy there was no way to fill the wall.
  const vouchers = bounds.voucherSourceLimit > 0 && databaseAvailable
    ? await runVoucherLane(env, bounds.voucherSourceLimit)
    : skippedVoucherLane()

  return json(
    {
      catalogues,
      country,
      databaseAvailable,
      durationMs: Date.now() - startedAtMs,
      feeds,
      finishedAt: new Date().toISOString(),
      lane,
      message: summaryMessage(
        catalogues,
        feeds,
        stores,
        vouchers,
        databaseAvailable,
        wantsFeeds && !feedsApply ? country : undefined,
      ),
      startedAt,
      stores,
      vouchers,
    },
    { headers: privateHeaders },
  )
}

/**
 * One bounded pass over the voucher sources, least recently run first so
 * pressing repeatedly walks the whole list rather than re-sweeping the front
 * of it. Discovered sources come first — they are the ones nobody has vetted.
 */
async function runVoucherLane(
  env: TrolleyScoutEnv,
  sourceLimit: number,
): Promise<VoucherLaneSummary> {
  try {
    const sources = (await voucherSourcesForRun(env)).slice(0, sourceLimit)
    if (sources.length === 0) {
      return { ...skippedVoucherLane(), ran: true }
    }

    const result = await runVoucherScout(env, { sources })
    // A press also looks for pages nobody has registered yet, so the source
    // list grows on its own instead of waiting for someone to notice a URL
    // has rotted.
    const found = await discoverVoucherSources(env, {
      jinaApiKey: env.JINA_API_KEY,
      maxProbes: 4,
      retailers: voucherProbeTargets(),
    }).catch(() => [])

    return {
      discoveredSourceCount: found.filter((probe) => probe.outcome === 'accepted').length,
      emptySourceCount: result.sources.filter((source) => source.discovered === 0).length,
      expiredCount: result.expired,
      failed: false,
      ran: true,
      sourceCount: result.sources.length,
      voucherCount: result.sources.reduce((total, source) => total + source.written, 0),
    }
  } catch (error) {
    return {
      ...skippedVoucherLane(),
      failed: true,
      message: describeError(error),
      ran: true,
    }
  }
}

/**
 * Shops worth probing for a voucher page: the official origin of every
 * retailer in the directory. Only hosts we already trust are probed, so
 * discovery can never wander onto an aggregator.
 */
function voucherProbeTargets(): Array<{ origin: string; retailerId: string }> {
  const targets = new Map<string, string>()

  for (const retailer of getStaticRetailersPayload().retailers) {
    for (const source of retailer.sources) {
      try {
        const origin = new URL(source.url).origin
        if (origin.startsWith('https://') && !targets.has(retailer.id)) {
          targets.set(retailer.id, origin)
        }
      } catch {
        // A source without a readable URL simply offers no origin to probe.
      }
    }
  }

  return [...targets.entries()].map(([retailerId, origin]) => ({ origin, retailerId }))
}

async function voucherSourcesForRun(
  env: TrolleyScoutEnv,
): Promise<readonly VoucherScoutSource[]> {
  const discovered = await listDiscoveredVoucherSources(env).catch(() => [])
  const sources = [...discovered, ...defaultVoucherSources]

  if (!env.DB) {
    return sources
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT source_key, MAX(finished_at) AS last_run
        FROM voucher_source_runs GROUP BY source_key`,
    ).all<{ source_key: string; last_run: string | null }>()
    const lastRun = new Map(rows.results.map((row) => [row.source_key, row.last_run ?? '']))

    // Never run sorts first; ties keep registration order.
    return sources
      .map((source, index) => ({ index, key: lastRun.get(source.sourceKey) ?? '', source }))
      .sort((left, right) => left.key.localeCompare(right.key) || left.index - right.index)
      .map((entry) => entry.source)
  } catch {
    // Without the audit table, registration order is still a valid pass.
    return sources
  }
}

async function runCatalogueLane(
  env: TrolleyScoutEnv,
  countryCode?: string,
): Promise<CatalogueLaneSummary> {
  const targets = leafletTargets.filter((target) =>
    !countryCode || (target.countryCode ?? 'ZA') === countryCode)

  if (targets.length === 0) {
    return {
      catalogueCount: 0,
      failed: false,
      ran: true,
      sourceCount: 0,
    }
  }

  try {
    const prior = await readLeafletSnapshot(env)
    const leaflets = await refreshLeafletCache(env, prior?.leaflets, {
      targets,
    })
    return {
      catalogueCount: countryCode
        ? leaflets.filter((leaflet) =>
          catalogueCountryCode(leaflet) === countryCode).length
        : leaflets.length,
      failed: false,
      ran: true,
      sourceCount: targets.length,
    }
  } catch (error) {
    return {
      ...skippedCatalogueLane(),
      failed: true,
      message: describeError(error),
      ran: true,
      sourceCount: targets.length,
    }
  }
}

function catalogueCountryCode(leaflet: StoreLeaflet): string {
  return (leaflet.countryCode ?? 'ZA').trim().toUpperCase()
}

/// The country a press sweeps: what was asked for, else wherever the admin is
/// working. An unreadable code falls back to their own country rather than
/// silently sweeping the world on a typo.
function readCountry(value: unknown, url: string, fallback: string): string {
  const fromBody = typeof value === 'string' ? value : ''
  const fromQuery = fromBody ? '' : new URL(url).searchParams.get('country') ?? ''
  const requested = (fromBody || fromQuery).trim().toUpperCase()

  if (requested === ALL_COUNTRIES) {
    return ALL_COUNTRIES
  }

  // countryFromCode answers South Africa for anything it cannot read, so a
  // requested code is only honoured when it round-trips. Otherwise a typo
  // would quietly sweep South Africa for an admin working elsewhere.
  const asked = requested ? countryFromCode(requested) : undefined
  return asked && asked.code === requested ? asked.code : countryFromCode(fallback).code
}

function readLane(value: unknown, url: string): ScoutLane | undefined {
  const fromBody = typeof value === 'string' ? value : ''
  const fromQuery = fromBody ? '' : new URL(url).searchParams.get('lane') ?? ''
  const requested = (fromBody || fromQuery).trim().toLowerCase()

  if (!requested) {
    return 'all'
  }

  return SCOUT_LANES.find((lane) => lane === requested)
}

// A bounded run walks the source list from the front, so with the cap this
// endpoint has to keep, it could only ever reach the first handful of sources
// — the ones registered last, Takealot's campaign shards among them, were
// never reached however many times the button was pressed. Ordering by how
// long a source has gone unread makes each press advance whatever is most
// overdue, so pressing repeatedly walks the whole list.
/// A source says nothing about its country when it is South African, which is
/// what every source was before the American chains arrived.
function sourcesForCountry(countryCode: string): readonly RetailerFeedSource[] {
  return getStructuredRetailerSources().filter(
    (source) => (source.countryCode ?? 'ZA') === countryCode,
  )
}

async function leastRecentlyRunFirst(
  env: TrolleyScoutEnv,
  sources: readonly RetailerFeedSource[],
): Promise<readonly RetailerFeedSource[]> {
  if (!env.DB) {
    return sources
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT source_key, MAX(finished_at) AS last_run
        FROM deal_source_runs GROUP BY source_key`,
    ).all<{ source_key: string; last_run: string | null }>()
    const lastRun = new Map(rows.results.map((row) => [row.source_key, row.last_run ?? '']))

    // A source that has never run sorts first; ties keep registration order.
    return [...sources]
      .map((source, index) => ({ index, key: lastRun.get(source.key) ?? '', source }))
      .sort((left, right) => left.key.localeCompare(right.key) || left.index - right.index)
      .map((entry) => entry.source)
  } catch {
    // Without the audit table the registration order is still a valid pass.
    return sources
  }
}

async function runFeedLane(
  env: TrolleyScoutEnv,
  requestCap: number,
  sources: readonly RetailerFeedSource[],
): Promise<FeedLaneSummary> {
  try {
    const result = await runStructuredRetailerFeedScout(env, {
      requestCap,
      sources: await leastRecentlyRunFirst(env, sources),
      timeoutMs: FEED_TIMEOUT_MS,
    })

    return {
      acceptedDealCount: result.acceptedDealCount,
      catalogueCount: result.catalogueCount,
      checkedSourceCount: result.checkedSourceCount,
      failed: false,
      failedSourceCount: result.failedSourceCount,
      failures: result.sources
        .filter((source) => source.status === 'failed')
        .slice(0, MAX_REPORTED_FAILURES)
        .map((source) => ({
          key: source.key,
          message: source.errorText ?? 'The source did not answer.',
        })),
      ran: true,
      requestCap,
    }
  } catch (error) {
    // A lane that blew up is reported, not thrown: the other lane still ran and
    // the admin needs to see which half failed.
    return {
      ...skippedFeedLane(),
      failed: true,
      message: describeError(error),
      ran: true,
      requestCap,
    }
  }
}

async function runStoreLane(
  env: TrolleyScoutEnv,
  storeLimit: number,
  startedAtMs: number,
  startedAt: string,
  countryCodes?: string[],
): Promise<StoreLaneSummary> {
  let storesOffered = 0

  try {
    // Online-only retailers have no branch for the near-me scout to reach, so
    // the whole registry is handed over and scoutNearbyStores paces it: it
    // claims at most storeLimit shops that are off cooldown.
    const registryStores = buildRegistryOnlineStores(countryCodes)
    storesOffered = registryStores.length
    await scoutNearbyStores(
      env,
      registryStores,
      startedAtMs,
      storeLimit,
      startedAtMs + STORE_LANE_BUDGET_MS,
    )
  } catch (error) {
    return {
      ...skippedStoreLane(),
      failed: true,
      message: describeError(error),
      ran: true,
      storeLimit,
      storesOffered,
    }
  }

  return {
    ...skippedStoreLane(),
    ...(await countStoresScoutedSince(env, startedAt)),
    ran: true,
    storeLimit,
    storesOffered,
    storesPending: await countStoresPending(env, storesOffered, countryCodes),
  }
}

/// How many of this country's shops are still waiting for a turn: everything
/// registered, less whatever is currently held by a cooldown.
async function countStoresPending(
  env: TrolleyScoutEnv,
  storesOffered: number,
  countryCodes?: string[],
): Promise<number> {
  // Across every country at once there is no single prefix to count by, so the
  // figure is only reported for a country-scoped run.
  if (!hasTrolleyScoutDatabase(env) || countryCodes?.length !== 1) {
    return 0
  }

  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS held FROM store_scout_log
        WHERE place_id LIKE ? AND next_scout_at > ?`,
    )
      .bind(`online:${countryCodes[0].toLowerCase()}:%`, new Date().toISOString())
      .first<{ held: number }>()

    return Math.max(0, storesOffered - Number(row?.held ?? 0))
  } catch {
    return 0
  }
}

// scoutNearbyStores resolves void, so the only honest count of what it just did
// is the log it writes: every shop it reaches has scouted_at stamped. A nearby
// search running at the same moment can add to this, so it is reported as what
// the scout log recorded since this run started.
async function countStoresScoutedSince(
  env: TrolleyScoutEnv,
  sinceIso: string,
): Promise<{ storePromotionCount: number; storesScouted: number }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { storePromotionCount: 0, storesScouted: 0 }
  }

  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS stores, COALESCE(SUM(promotion_count), 0) AS promotions
        FROM store_scout_log
        WHERE scouted_at >= ?`,
    )
      .bind(sinceIso)
      .first<{ promotions: number; stores: number }>()

    return {
      storePromotionCount: Number(row?.promotions ?? 0),
      storesScouted: Number(row?.stores ?? 0),
    }
  } catch {
    // The sweep still happened; only its tally is unavailable.
    return { storePromotionCount: 0, storesScouted: 0 }
  }
}

function skippedFeedLane(): FeedLaneSummary {
  return {
    acceptedDealCount: 0,
    catalogueCount: 0,
    checkedSourceCount: 0,
    failed: false,
    failedSourceCount: 0,
    failures: [],
    ran: false,
    requestCap: 0,
  }
}

function skippedStoreLane(): StoreLaneSummary {
  return {
    failed: false,
    ran: false,
    storeLimit: 0,
    storePromotionCount: 0,
    storesOffered: 0,
    storesPending: 0,
    storesScouted: 0,
  }
}

function skippedCatalogueLane(): CatalogueLaneSummary {
  return {
    catalogueCount: 0,
    failed: false,
    ran: false,
    sourceCount: 0,
  }
}

function skippedVoucherLane(): VoucherLaneSummary {
  return {
    discoveredSourceCount: 0,
    emptySourceCount: 0,
    expiredCount: 0,
    failed: false,
    ran: false,
    sourceCount: 0,
    voucherCount: 0,
  }
}

function summaryMessage(
  catalogues: CatalogueLaneSummary,
  feeds: FeedLaneSummary,
  stores: StoreLaneSummary,
  vouchers: VoucherLaneSummary,
  databaseAvailable: boolean,
  countryWithoutFeeds?: string,
): string {
  if (!databaseAvailable) {
    return 'No scout database is connected, so nothing could be refreshed.'
  }

  const done: string[] = []

  if (feeds.ran) {
    done.push(`${count(feeds.checkedSourceCount, 'source')} checked`)
    done.push(`${count(feeds.acceptedDealCount, 'deal')} added`)
  }

  if (stores.ran) {
    done.push(`${count(stores.storesScouted, 'store')} swept`)

    if (stores.storesPending > 0) {
      done.push(`${stores.storesPending} still to sweep`)
    }
  }

  if (catalogues.ran) {
    done.push(`${count(catalogues.catalogueCount, 'catalogue')} refreshed`)
  }

  if (vouchers.ran) {
    done.push(`${count(vouchers.voucherCount, 'voucher')} collected`)

    if (vouchers.expiredCount > 0) {
      done.push(`${vouchers.expiredCount} expired`)
    }
  }

  const problems: string[] = []

  if (feeds.failed) {
    problems.push('the retailer feeds could not run')
  } else if (feeds.failedSourceCount > 0) {
    problems.push(`${count(feeds.failedSourceCount, 'source')} failed`)
  }

  if (stores.failed) {
    problems.push('the store sweep could not run')
  }

  if (catalogues.failed) {
    problems.push('the catalogue sweep could not run')
  }

  if (vouchers.failed) {
    problems.push('the voucher sweep could not run')
  } else if (vouchers.ran && vouchers.emptySourceCount > 0) {
    // A voucher page that answers with nothing has usually moved or gone
    // behind a login, which is worth saying rather than reporting zero.
    problems.push(`${count(vouchers.emptySourceCount, 'voucher source')} returned nothing`)
  }

  const summary = done.length ? `${done.join(', ')}.` : 'Nothing ran.'
  const withProblems = problems.length
    ? `${summary} ${sentence(problems.join(' and '))}.`
    : summary

  // Said plainly rather than left as a suspiciously small number. It no longer
  // reads "feeds are South African", because they are not — it names the
  // country that has none, which is a thing that can be fixed by building one.
  return countryWithoutFeeds
    ? `${withProblems} No retailer feed covers ${countryFromCode(countryWithoutFeeds).name} yet, so it swept shops only.`
    : withProblems
}

function count(value: number, noun: string): string {
  return `${value} ${value === 1 ? noun : `${noun}s`}`
}

function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The lane stopped with an unexpected error.'
}

