/**
 * Finds voucher pages the way the deal scout finds deal sites.
 *
 * Voucher sources were four hand-written URLs. Two had rotted without anyone
 * noticing — Woolworths' served a store-card article, Yuppiechef had moved
 * /specials.htm to /promotions.htm — so the wall showed Amazon and nothing
 * else. A hand-maintained list of URLs on somebody else's website is a list
 * that goes stale.
 *
 * This walks the official retailer hosts we already trust, tries the paths
 * shops actually publish vouchers on, keeps whatever yields real candidates,
 * and retires a source that stops yielding.
 */

import { extractPublicVoucherCandidates } from '../../src/services/vouchers/voucherDiscovery'
import type { TrolleyScoutEnv } from './env'
import type { VoucherScoutSource } from './voucherScout'

const PROBE_TIMEOUT_MS = 9_000
const MAX_BODY_BYTES = 3_000_000
/** Consecutive empty probes before a source is retired. */
const EMPTY_STREAK_LIMIT = 4
/** A probed path is not retried for this long, however it went. */
const PROBE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000

/**
 * Where shops put vouchers. Ordered by how often they pay off, because a run
 * is bounded and the early paths should be the likely ones.
 */
export const VOUCHER_PATH_CANDIDATES: readonly string[] = [
  '/vouchers',
  '/coupons',
  '/promotions',
  '/promo-codes',
  '/specials',
  '/deals',
  '/discount-codes',
  '/offers',
]

export interface VoucherSourceProbeResult {
  candidateCount: number
  outcome: 'accepted' | 'empty' | 'unreachable'
  retailerId: string
  url: string
}

export interface DiscoverVoucherSourcesOptions {
  fetchImpl?: typeof fetch
  jinaApiKey?: string
  /** Hosts to probe, as retailerId → official origin. */
  retailers: ReadonlyArray<{ origin: string; retailerId: string }>
  /** Bounds the sweep; every probe is one subrequest. */
  maxProbes?: number
  now?: Date
}

export async function discoverVoucherSources(
  env: TrolleyScoutEnv,
  options: DiscoverVoucherSourcesOptions,
): Promise<VoucherSourceProbeResult[]> {
  if (!env.DB) return []

  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? new Date()
  const maxProbes = Math.max(1, Math.min(24, options.maxProbes ?? 6))
  const recent = await recentlyProbedUrls(env, now)
  const results: VoucherSourceProbeResult[] = []

  for (const retailer of options.retailers) {
    for (const path of VOUCHER_PATH_CANDIDATES) {
      if (results.length >= maxProbes) return results

      const url = candidateUrl(retailer.origin, path)
      if (!url || recent.has(url)) continue

      const result = await probeVoucherSource(
        retailer.retailerId,
        url,
        fetchImpl,
        options.jinaApiKey,
        now,
      )
      results.push(result)
      await recordProbe(env, result, now).catch(() => undefined)

      if (result.outcome === 'accepted') {
        await acceptSource(env, result, now).catch(() => undefined)
        // One good page per shop is enough; the rest of the budget is better
        // spent on a shop we have nothing for.
        break
      }
    }
  }

  return results
}

export async function probeVoucherSource(
  retailerId: string,
  url: string,
  fetchImpl: typeof fetch,
  jinaApiKey: string | undefined,
  now: Date,
): Promise<VoucherSourceProbeResult> {
  let html: string
  try {
    html = await readCandidatePage(url, fetchImpl, jinaApiKey)
  } catch {
    return { candidateCount: 0, outcome: 'unreachable', retailerId, url }
  }

  const candidates = extractPublicVoucherCandidates({
    capturedAt: now.toISOString(),
    html,
    limit: 50,
    retailerId,
    sourceUrl: url,
  })

  return {
    candidateCount: candidates.length,
    outcome: candidates.length > 0 ? 'accepted' : 'empty',
    retailerId,
    url,
  }
}

async function readCandidatePage(
  url: string,
  fetchImpl: typeof fetch,
  jinaApiKey?: string,
): Promise<string> {
  const direct = await fetchImpl(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'TrolleyScout/1.0 (+https://trolleyscout.co.za)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  })

  // A 404 is the honest answer that this shop has no such page — never worth
  // spending a reader call on.
  if (direct.status === 404 || direct.status === 410) {
    throw new Error(`No voucher page at ${url}`)
  }
  if (direct.ok) {
    const body = await direct.text()
    if (body.length > MAX_BODY_BYTES) throw new Error('Voucher page is too large')
    return body
  }

  // Bot walls and JavaScript shells answer to the reader when they will not
  // answer to us.
  const reader = await fetchImpl(`https://r.jina.ai/${url}`, {
    headers: {
      accept: 'text/html,text/plain',
      'x-return-format': 'html',
      ...(jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : {}),
    },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS * 2),
  })
  if (!reader.ok) throw new Error(`Voucher page returned HTTP ${direct.status}`)

  const body = await reader.text()
  if (body.length > MAX_BODY_BYTES) throw new Error('Voucher page is too large')
  return body
}

/** Discovered sources in the shape the voucher scout already runs. */
export async function listDiscoveredVoucherSources(
  env: TrolleyScoutEnv,
): Promise<VoucherScoutSource[]> {
  if (!env.DB) return []

  const rows = await env.DB.prepare(
    `SELECT source_key, retailer_id, url, parser
      FROM voucher_discovered_sources
      WHERE status = 'active'
      ORDER BY last_checked_at IS NOT NULL, last_checked_at`,
  ).all<{ parser: string; retailer_id: string; source_key: string; url: string }>()

  return rows.results.map((row) => ({
    countryCode: 'ZA',
    parser: row.parser === 'amazon' || row.parser === 'promotion-sweep'
      ? row.parser
      : 'public-code',
    retailerId: row.retailer_id,
    sourceKey: row.source_key,
    url: row.url,
  }))
}

/**
 * Records what a sweep found. A source that comes back empty too many times
 * running is retired — the page has moved or gone behind a login, and retrying
 * it forever is how the old list stayed broken.
 */
export async function recordVoucherSourceYield(
  env: TrolleyScoutEnv,
  sourceKey: string,
  discovered: number,
  now = new Date(),
): Promise<void> {
  if (!env.DB) return

  const checkedAt = now.toISOString()
  if (discovered > 0) {
    await env.DB.prepare(
      `UPDATE voucher_discovered_sources
        SET candidate_count = ?, empty_streak = 0,
            last_checked_at = ?, last_yield_at = ?
        WHERE source_key = ?`,
    )
      .bind(discovered, checkedAt, checkedAt, sourceKey)
      .run()
    return
  }

  await env.DB.prepare(
    `UPDATE voucher_discovered_sources
      SET empty_streak = empty_streak + 1,
          last_checked_at = ?,
          status = CASE WHEN empty_streak + 1 >= ? THEN 'retired' ELSE status END
      WHERE source_key = ?`,
  )
    .bind(checkedAt, EMPTY_STREAK_LIMIT, sourceKey)
    .run()
}

async function acceptSource(
  env: TrolleyScoutEnv,
  result: VoucherSourceProbeResult,
  now: Date,
): Promise<void> {
  if (!env.DB) return

  const checkedAt = now.toISOString()
  await env.DB.prepare(
    `INSERT INTO voucher_discovered_sources (
      source_key, retailer_id, url, parser, candidate_count,
      empty_streak, status, discovered_at, last_checked_at, last_yield_at
    ) VALUES (?, ?, ?, 'public-code', ?, 0, 'active', ?, ?, ?)
    ON CONFLICT (source_key) DO UPDATE SET
      candidate_count = excluded.candidate_count,
      empty_streak = 0,
      status = 'active',
      last_checked_at = excluded.last_checked_at,
      last_yield_at = excluded.last_yield_at`,
  )
    .bind(
      discoveredSourceKey(result.retailerId, result.url),
      result.retailerId,
      result.url,
      result.candidateCount,
      checkedAt,
      checkedAt,
      checkedAt,
    )
    .run()
}

async function recordProbe(
  env: TrolleyScoutEnv,
  result: VoucherSourceProbeResult,
  now: Date,
): Promise<void> {
  if (!env.DB) return

  await env.DB.prepare(
    `INSERT INTO voucher_source_probes (probe_key, retailer_id, url, outcome, checked_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (probe_key) DO UPDATE SET
        outcome = excluded.outcome,
        checked_at = excluded.checked_at`,
  )
    .bind(`${result.retailerId}::${result.url}`, result.retailerId, result.url, result.outcome, now.toISOString())
    .run()
}

async function recentlyProbedUrls(env: TrolleyScoutEnv, now: Date): Promise<Set<string>> {
  if (!env.DB) return new Set()

  try {
    const since = new Date(now.getTime() - PROBE_COOLDOWN_MS).toISOString()
    const rows = await env.DB.prepare(
      'SELECT url FROM voucher_source_probes WHERE checked_at >= ?',
    )
      .bind(since)
      .all<{ url: string }>()
    return new Set(rows.results.map((row) => row.url))
  } catch {
    return new Set()
  }
}

export function discoveredSourceKey(retailerId: string, url: string): string {
  return `${retailerId}::discovered::${url}`
}

function candidateUrl(origin: string, path: string): string | undefined {
  try {
    const url = new URL(path, origin)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}
