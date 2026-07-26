import type { TrolleyScoutEnv } from './env'

// A feed that dies does not raise an error. It returns an empty list, which is
// indistinguishable from a shop having a quiet week, and the app keeps serving
// an empty aisle until a shopper notices. That is how Checkers came to serve
// none of its 88 live deals for days with nothing anywhere saying so.
//
// The signal is never the current number on its own — "Shoprite has 0 deals"
// could be true and fine. It is the fall: 615 yesterday, 0 today. So a count
// per retailer is written every sweep, and an alarm is a comparison against
// what that retailer normally carries.

/// Below this a retailer is too small for a fall to mean anything — a shop that
/// runs three deals and now runs none is not evidence of a broken feed.
const MIN_MEANINGFUL_PEAK = 10

/// A fall past this much of the recent peak is a collapse. Not 100%: a feed
/// that half breaks (one shard of sixteen still answering) is just as dead to
/// the shopper who wanted the other half.
const COLLAPSE_RATIO = 0.4

/// How far back "normally carries" reaches. Long enough to survive a quiet
/// weekend, short enough that a retailer we deliberately dropped stops being
/// compared against its old self.
const BASELINE_WINDOW_HOURS = 72

/// Snapshots older than this are history nobody reads.
const RETAIN_HOURS = 30 * 24

/// Runs that answered without error and produced neither a deal nor a leaflet,
/// this many times over, are not "quiet" — nothing legitimately returns nothing
/// forever. Leaflets count, or the ten Boxer provinces and Roots would be
/// reported dead for doing exactly what they are for.
const BARREN_RUN_LIMIT = 6

export type SourceHealthLevel = 'collapsed' | 'barren' | 'failing' | 'truncated'

export interface SourceHealthAlert {
  detail: string
  level: SourceHealthLevel
  /// What it carries now, for a collapse. Absent where the alert is not a count.
  currentCount?: number
  peakCount?: number
  retailerId: string
  sourceKey?: string
}

export interface SourceHealthReport {
  alerts: SourceHealthAlert[]
  checkedRetailerCount: number
  healthy: boolean
}

interface CountRow {
  active_deal_count: number
  retailer_id: string
}

interface RunRow {
  barren_runs: number
  retailer_id: string
  source_key: string
  status: string
}

function requireDatabase(env: TrolleyScoutEnv): D1Database {
  if (!env.DB) {
    throw new Error('Source health needs a database')
  }
  return env.DB
}

function isoHoursAgo(now: string, hours: number): string {
  return new Date(Date.parse(now) - hours * 60 * 60 * 1000).toISOString()
}

/**
 * Writes what every retailer carries right now.
 *
 * Retailers with nothing active are written as zero rather than left out — a
 * missing row and a zero row read the same to a human but only one of them can
 * be compared against yesterday.
 */
export async function recordSourceHealth(
  env: TrolleyScoutEnv,
  now: string = new Date().toISOString(),
): Promise<number> {
  const db = requireDatabase(env)

  // Every retailer we have ever stored a deal for, with today's active count
  // beside it, so a shop that has fallen to nothing still gets a row.
  const rows = await db.prepare(
    `SELECT known.retailer_id AS retailer_id,
            COALESCE(known.country_code, 'ZA') AS country_code,
            COALESCE(live.n, 0) AS active_deal_count
      FROM (SELECT DISTINCT retailer_id, country_code FROM deal_items) AS known
      LEFT JOIN (
        SELECT retailer_id, country_code, COUNT(*) AS n
          FROM deal_items
          WHERE status = 'active' AND expires_at > ?
          GROUP BY retailer_id, country_code
      ) AS live
        ON live.retailer_id = known.retailer_id
       AND live.country_code = known.country_code`,
  ).bind(now).all<CountRow & { country_code: string }>()

  if (rows.results.length === 0) {
    return 0
  }

  const insert = db.prepare(
    `INSERT INTO source_health_snapshots
      (retailer_id, country_code, active_deal_count, captured_at)
      VALUES (?, ?, ?, ?)`,
  )

  await db.batch([
    ...rows.results.map((row) => insert.bind(
      row.retailer_id,
      row.country_code,
      row.active_deal_count,
      now,
    )),
    db.prepare('DELETE FROM source_health_snapshots WHERE captured_at < ?')
      .bind(isoHoursAgo(now, RETAIN_HOURS)),
  ])

  return rows.results.length
}

/**
 * What is wrong right now, in the order somebody should care about it.
 *
 * Three different silences are separated because they need different answers: a
 * retailer that fell off a cliff (its feed broke), a source that keeps
 * answering with nothing (its query no longer matches anything, which is what
 * Mr Price did for months), and a source that is erroring outright.
 */
export async function readSourceHealth(
  env: TrolleyScoutEnv,
  now: string = new Date().toISOString(),
): Promise<SourceHealthReport> {
  const db = requireDatabase(env)
  const since = isoHoursAgo(now, BASELINE_WINDOW_HOURS)

  const [counts, runs] = await Promise.all([
    db.prepare(
      `SELECT latest.retailer_id AS retailer_id,
              latest.active_deal_count AS active_deal_count,
              baseline.peak AS peak
        FROM (
          SELECT s.retailer_id, s.active_deal_count
            FROM source_health_snapshots AS s
            JOIN (
              SELECT retailer_id, MAX(captured_at) AS newest
                FROM source_health_snapshots GROUP BY retailer_id
            ) AS newest
              ON newest.retailer_id = s.retailer_id
             AND newest.newest = s.captured_at
        ) AS latest
        JOIN (
          SELECT retailer_id, MAX(active_deal_count) AS peak
            FROM source_health_snapshots
            WHERE captured_at >= ?
            GROUP BY retailer_id
        ) AS baseline
          ON baseline.retailer_id = latest.retailer_id`,
    ).bind(since).all<CountRow & { peak: number }>(),

    db.prepare(
      `SELECT source_key, retailer_id, status, barren_runs FROM (
        SELECT source_key,
               retailer_id,
               status,
               (SELECT COUNT(*) FROM deal_source_runs AS r2
                 WHERE r2.source_key = r1.source_key
                   AND r2.status = 'success'
                   AND r2.candidate_count = 0
                   AND COALESCE(r2.catalogue_count, 0) = 0
                   AND r2.created_at >= ?) AS barren_runs,
               ROW_NUMBER() OVER (PARTITION BY source_key ORDER BY created_at DESC) AS rank
          FROM deal_source_runs AS r1
          WHERE created_at >= ?
      ) WHERE rank = 1`,
    ).bind(since, since).all<RunRow>(),
  ])

  const alerts: SourceHealthAlert[] = []

  for (const row of counts.results) {
    const peak = Number(row.peak)
    const current = Number(row.active_deal_count)

    if (peak < MIN_MEANINGFUL_PEAK || current > peak * COLLAPSE_RATIO) {
      continue
    }

    alerts.push({
      currentCount: current,
      detail: current === 0
        ? `${row.retailer_id} carried ${peak} deals and now carries none.`
        : `${row.retailer_id} fell from ${peak} deals to ${current}.`,
      level: 'collapsed',
      peakCount: peak,
      retailerId: row.retailer_id,
    })
  }

  for (const row of runs.results) {
    if (row.status === 'failed') {
      alerts.push({
        detail: `${row.source_key} last run failed.`,
        level: 'failing',
        retailerId: row.retailer_id,
        sourceKey: row.source_key,
      })
      continue
    }

    if (Number(row.barren_runs) >= BARREN_RUN_LIMIT) {
      alerts.push({
        detail:
          `${row.source_key} has answered ${row.barren_runs} times without a ` +
          'single deal. Nothing legitimately returns nothing this long.',
        level: 'barren',
        retailerId: row.retailer_id,
        sourceKey: row.source_key,
      })
    }
  }

  // Worst first: a shop that vanished matters more than one that is merely
  // quiet, and a reader who only takes in the first line should get the worst.
  const order: Record<SourceHealthLevel, number> = {
    collapsed: 0,
    failing: 1,
    barren: 2,
    truncated: 3,
  }
  alerts.sort((left, right) =>
    order[left.level] - order[right.level] || left.retailerId.localeCompare(right.retailerId))

  return {
    alerts,
    checkedRetailerCount: counts.results.length,
    healthy: alerts.length === 0,
  }
}

/// The feed read every active deal it was allowed to and there were still more.
/// Written as an alert rather than a log line because the shops it hides are
/// whichever ones stay valid longest, and they simply read as empty.
export function truncationAlert(readCount: number): SourceHealthAlert {
  return {
    detail:
      `The deal feed stopped after ${readCount} rows with more still unread, ` +
      'so the longest-running deals are not being served.',
    level: 'truncated',
    retailerId: 'all',
  }
}
