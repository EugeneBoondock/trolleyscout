// Public feed of deals from the external deal sites (OneDayOnly, Hyperli,
// Daddy's Deals, MyRunway, Travelstart, Southern Sun, Flight Centre and City
// Lodge Hotels). Powers the "Scroll"
// window-shopping reel and can be
// mixed into the deals board. Normal requests only read D1. Scheduled scouting
// and explicit administrator requests are the only upstream refresh owners.

import type { TrolleyScoutEnv } from '../_shared/env'
import { runDealRefreshWithAlerts } from '../_shared/dealAlertStore'
import {
  readDealSiteFeed,
  refreshDealSites,
  type DealSiteFeed,
} from '../_shared/dealSiteScout'
import { getMemberSession } from '../_shared/memberStore'
import {
  organizationPublicationsToWindowItems,
} from '../_shared/organizationPublicationFeed'
import {
  listLiveOrganizationPublications,
  type OrganizationPublication,
} from '../_shared/organizationPublicationStore'
import { getMemberPlan } from '../../src/data/memberPlans'
import type { MemberPlanId } from '../../src/types'
import { json, methodNotAllowed } from '../_shared/respond'

const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300',
}

const refreshHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'private, no-store',
}

const FORCE_REFRESH_BACKOFF_MS = 15_000
const REFRESH_LEASE_MS = 30_000

async function requestDealSiteRefresh(
  env: TrolleyScoutEnv,
  backoffMs: number,
): Promise<void> {
  const now = Date.now()
  const token = crypto.randomUUID()
  const claimed = await claimRefreshLease(env, token, now, backoffMs)
  if (!claimed) return

  try {
    await runDealRefreshWithAlerts(env, () => refreshDealSites(env))
  } finally {
    await releaseRefreshLease(env, token)
  }
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const session = await getMemberSession(env, request)
  const planId: MemberPlanId = session.account?.role === 'admin'
    ? 'organization'
    : session.account?.planId ?? 'free'
  const forceLive = new URL(request.url).searchParams.get('refresh') === '1'
  if (forceLive) {
    if (session.account?.role !== 'admin') {
      return json(
        { message: 'Admin access is required.' },
        { headers: refreshHeaders, status: 403 },
      )
    }
  }

  const [initialFeed, businessPublications] = await Promise.all([
    readDealSiteFeed(env),
    listLiveOrganizationPublications(env, 'window'),
  ])
  let feed = initialFeed

  // An administrator refresh bypasses response caches and waits for the
  // upstream scouts so the response contains the newest stored rows.
  if (forceLive) {
    try {
      await requestDealSiteRefresh(env, FORCE_REFRESH_BACKOFF_MS)
    } catch {
      // Keep serving the last usable rows when an upstream site is down.
    }
    feed = await readDealSiteFeed(env)

    return json(
      limitDealSiteFeed(addBusinessPublications(feed, businessPublications), planId),
      { headers: refreshHeaders },
    )
  }

  return json(
    limitDealSiteFeed(addBusinessPublications(feed, businessPublications), planId),
    { headers: session.account ? refreshHeaders : publicHeaders },
  )
}

function limitDealSiteFeed<T extends { deals: DealSiteFeed['deals'] }>(
  feed: T,
  planId: MemberPlanId,
) {
  const dealLimit = getMemberPlan(planId).limits.visibleDeals
  return {
    ...feed,
    access: {
      availableDealCount: feed.deals.length,
      dealLimit,
      planId,
    },
    deals: feed.deals.slice(0, dealLimit),
  }
}

function addBusinessPublications(
  feed: DealSiteFeed,
  publications: OrganizationPublication[],
) {
  const businessDeals = organizationPublicationsToWindowItems(publications)
  if (businessDeals.length === 0) return feed

  const fetchedAt = publications.reduce(
    (newest, publication) => publication.updatedAt > newest ? publication.updatedAt : newest,
    publications[0].updatedAt,
  )
  return {
    deals: [...businessDeals, ...feed.deals],
    refreshedAt: !feed.refreshedAt || fetchedAt > feed.refreshedAt ? fetchedAt : feed.refreshedAt,
    sources: [
      {
        count: businessDeals.length,
        fetchedAt,
        id: 'trolleyscout-business',
        label: 'Trolley Scout businesses',
      },
      ...feed.sources,
    ],
  }
}

async function claimRefreshLease(
  env: TrolleyScoutEnv,
  token: string,
  now: number,
  backoffMs: number,
): Promise<boolean> {
  try {
    const result = await env.DB!.prepare(
      `UPDATE deal_site_refresh_state
        SET last_attempt_at = ?, lease_token = ?, lease_until = ?
        WHERE id = 1
          AND (lease_until IS NULL OR lease_until <= ?)
          AND (last_attempt_at IS NULL OR last_attempt_at <= ?)`,
    )
      .bind(now, token, now + REFRESH_LEASE_MS, now, now - backoffMs)
      .run()
    return result.meta.changes > 0
  } catch {
    // During a migration rollout, keep the refresh usable without sharing
    // request-owned promises through Worker module state.
    return true
  }
}

async function releaseRefreshLease(
  env: TrolleyScoutEnv,
  token: string,
): Promise<void> {
  try {
    await env.DB!.prepare(
      `UPDATE deal_site_refresh_state
        SET lease_token = NULL, lease_until = NULL
        WHERE id = 1 AND lease_token = ?`,
    )
      .bind(token)
      .run()
  } catch {
    // The lease expires automatically, including during migration rollout.
  }
}
