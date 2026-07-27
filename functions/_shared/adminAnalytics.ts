import type { AdminAnalytics, AdminTrafficReport, AdminTrafficDay } from '../../src/types'
import type { TrolleyScoutEnv } from './env'

// Two separate sources feed the admin analytics tab.
//
//  * Our own D1: signups, presence, deal opens, searches. Always available,
//    and the only place that knows anything about *members*.
//  * Cloudflare's zone analytics: requests, page views, unique visitors. Covers
//    everyone including signed-out traffic, but needs a read token to reach.
//
// The tab renders whichever it gets. A missing Cloudflare token degrades to
// "not connected yet" with the setup steps, never to an error.

const DEFAULT_DAYS = 30
const MAX_DAYS = 90
const CLOUDFLARE_GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql'

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/// Every day in the window, oldest first, so a day with no activity renders as
/// a zero rather than vanishing and compressing the chart.
function buildDaySpine(days: number): string[] {
  const today = new Date()
  const spine: string[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() - offset)
    spine.push(dayKey(day))
  }
  return spine
}

function countsToSeries(spine: string[], rows: Array<{ day: string; total: number }>): number[] {
  const byDay = new Map(rows.map((row) => [row.day, Number(row.total) || 0]))
  return spine.map((day) => byDay.get(day) ?? 0)
}

export function clampAnalyticsDays(requested: unknown): number {
  const days = Number(requested)
  if (!Number.isFinite(days)) {
    return DEFAULT_DAYS
  }
  return Math.min(MAX_DAYS, Math.max(1, Math.round(days)))
}

/// Member-side analytics, read straight out of D1.
export async function getMemberAnalytics(
  env: TrolleyScoutEnv,
  countryCode: string,
  days = DEFAULT_DAYS,
): Promise<AdminAnalytics | undefined> {
  if (!env.DB) {
    return undefined
  }

  const spine = buildDaySpine(days)
  const since = `${spine[0]}T00:00:00.000Z`
  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString()
  const oneDayAgo = new Date(now - 86_400_000).toISOString()

  const [signups, presence, dealOpens, searches, totals] = await Promise.all([
    env.DB.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
        FROM member_accounts
        WHERE country_code = ? AND created_at >= ?
        GROUP BY day`,
    ).bind(countryCode, since).all<{ day: string; total: number }>(),
    env.DB.prepare(
      `SELECT substr(last_seen_at, 1, 10) AS day, COUNT(*) AS total
        FROM member_accounts
        WHERE country_code = ? AND last_seen_at >= ?
        GROUP BY day`,
    ).bind(countryCode, since).all<{ day: string; total: number }>(),
    env.DB.prepare(
      `SELECT substr(member_deal_activity.created_at, 1, 10) AS day, COUNT(*) AS total
        FROM member_deal_activity
        INNER JOIN member_accounts ON member_accounts.id = member_deal_activity.account_id
        WHERE member_accounts.country_code = ?
          AND member_deal_activity.created_at >= ?
          AND member_deal_activity.event_type = 'deal_opened'
        GROUP BY day`,
    ).bind(countryCode, since).all<{ day: string; total: number }>(),
    env.DB.prepare(
      `SELECT member_deal_activity.normalized_term AS term, COUNT(*) AS total
        FROM member_deal_activity
        INNER JOIN member_accounts ON member_accounts.id = member_deal_activity.account_id
        WHERE member_accounts.country_code = ?
          AND member_deal_activity.created_at >= ?
          AND member_deal_activity.event_type = 'search_submitted'
          AND member_deal_activity.normalized_term IS NOT NULL
          AND member_deal_activity.normalized_term <> ''
        GROUP BY term
        ORDER BY total DESC
        LIMIT 12`,
    ).bind(countryCode, since).all<{ term: string; total: number }>(),
    env.DB.prepare(
      `SELECT
        COUNT(*) AS account_count,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned_count,
        SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS active_today,
        SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS active_week,
        SUM(CASE WHEN last_seen_at IS NULL THEN 1 ELSE 0 END) AS never_seen
        FROM member_accounts WHERE country_code = ?`,
    ).bind(oneDayAgo, sevenDaysAgo, countryCode).first<{
      account_count: number
      active_today: number | null
      active_week: number | null
      banned_count: number | null
      never_seen: number | null
    }>(),
  ])

  const dealOpenSeries = countsToSeries(spine, dealOpens.results)

  return {
    days: spine,
    signups: countsToSeries(spine, signups.results),
    activeMembers: countsToSeries(spine, presence.results),
    dealViews: dealOpenSeries,
    topSearches: searches.results.map((row) => ({ term: row.term, count: Number(row.total) })),
    totals: {
      accountCount: Number(totals?.account_count ?? 0),
      activeToday: Number(totals?.active_today ?? 0),
      activeThisWeek: Number(totals?.active_week ?? 0),
      bannedCount: Number(totals?.banned_count ?? 0),
      neverSeenCount: Number(totals?.never_seen ?? 0),
      dealViewsInWindow: dealOpenSeries.reduce((total, value) => total + value, 0),
    },
  }
}

interface CloudflareHttpGroup {
  dimensions?: { date?: string }
  sum?: { pageViews?: number; requests?: number; bytes?: number }
  uniq?: { uniques?: number }
}

export function hasCloudflareAnalytics(env: TrolleyScoutEnv): boolean {
  return Boolean(env.CLOUDFLARE_ANALYTICS_TOKEN && env.CLOUDFLARE_ZONE_ID)
}

/// Zone-level traffic from Cloudflare's GraphQL analytics API. Returns a report
/// that always states whether it is connected, so the console can explain the
/// gap instead of showing an empty chart.
export async function getCloudflareTraffic(
  env: TrolleyScoutEnv,
  days = DEFAULT_DAYS,
): Promise<AdminTrafficReport> {
  if (!hasCloudflareAnalytics(env)) {
    return {
      configured: false,
      issue:
        'Cloudflare traffic is not connected. Set CLOUDFLARE_ANALYTICS_TOKEN (a token with ' +
        'Zone → Analytics → Read) and CLOUDFLARE_ZONE_ID on the Pages project.',
      days: [],
    }
  }

  const spine = buildDaySpine(days)
  const query = `query ZoneTraffic($zoneTag: String!, $since: Date!, $until: Date!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(
          limit: ${MAX_DAYS}
          filter: { date_geq: $since, date_leq: $until }
          orderBy: [date_ASC]
        ) {
          dimensions { date }
          sum { requests pageViews bytes }
          uniq { uniques }
        }
      }
    }
  }`

  let payload: {
    data?: { viewer?: { zones?: Array<{ httpRequests1dGroups?: CloudflareHttpGroup[] }> } }
    errors?: Array<{ message?: string }>
  }

  try {
    const response = await fetch(CLOUDFLARE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          zoneTag: env.CLOUDFLARE_ZONE_ID,
          since: spine[0],
          until: spine[spine.length - 1],
        },
      }),
    })

    if (!response.ok) {
      return {
        configured: true,
        issue: `Cloudflare analytics answered ${response.status}. Check the token's zone permissions.`,
        days: [],
      }
    }

    payload = await response.json()
  } catch {
    return { configured: true, issue: 'Cloudflare analytics could not be reached.', days: [] }
  }

  if (payload.errors?.length) {
    return {
      configured: true,
      issue: payload.errors[0]?.message ?? 'Cloudflare analytics rejected the query.',
      days: [],
    }
  }

  const groups = payload.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []
  const byDay = new Map<string, AdminTrafficDay>()
  for (const group of groups) {
    const date = group.dimensions?.date
    if (!date) continue
    byDay.set(date, {
      date,
      requests: Number(group.sum?.requests ?? 0),
      pageViews: Number(group.sum?.pageViews ?? 0),
      uniques: Number(group.uniq?.uniques ?? 0),
      bytes: Number(group.sum?.bytes ?? 0),
    })
  }

  const filled = spine.map(
    (date) => byDay.get(date) ?? { date, requests: 0, pageViews: 0, uniques: 0, bytes: 0 },
  )

  return {
    configured: true,
    days: filled,
    totals: {
      requests: filled.reduce((total, day) => total + day.requests, 0),
      pageViews: filled.reduce((total, day) => total + day.pageViews, 0),
      uniques: filled.reduce((total, day) => total + day.uniques, 0),
      bytes: filled.reduce((total, day) => total + day.bytes, 0),
    },
  }
}
