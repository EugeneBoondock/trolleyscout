// Public feed of deals from the external deal sites (OneDayOnly, Hyperli,
// Daddy's Deals, MyRunway). Powers the "Scroll" window-shopping reel and can be
// mixed into the deals board. Reads the D1 cache, and when the cache is empty or
// stale it fetches fresh data (inline on a cold cache, in the background
// otherwise) so a shopper never waits on four upstream sites.

import type { TrolleyScoutEnv } from '../_shared/env'
import {
  dealSitesNeedRefresh,
  readDealSiteFeed,
  refreshDealSites,
} from '../_shared/dealSiteScout'
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
const BACKGROUND_REFRESH_BACKOFF_MS = 5 * 60 * 1000
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
    await refreshDealSites(env)
  } finally {
    await releaseRefreshLease(env, token)
  }
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const forceLive = new URL(request.url).searchParams.get('refresh') === '1'
  let feed = await readDealSiteFeed(env)

  // Pull-to-refresh bypasses response caches and waits for the upstream scouts
  // so the shopper receives the newest available rows in this response.
  if (forceLive) {
    try {
      await requestDealSiteRefresh(env, FORCE_REFRESH_BACKOFF_MS)
    } catch {
      // Keep serving the last usable rows when an upstream site is down.
    }
    feed = await readDealSiteFeed(env)

    return json(
      { deals: feed.deals, refreshedAt: feed.refreshedAt, sources: feed.sources },
      { headers: refreshHeaders },
    )
  }

  // Cold cache: fetch once inline so the first visitor sees deals. A populated
  // but stale cache is served immediately and refreshed in the background.
  if (feed.deals.length === 0) {
    try {
      await requestDealSiteRefresh(env, FORCE_REFRESH_BACKOFF_MS)
    } catch {
      // Fall through with whatever (empty) feed we have.
    }
    feed = await readDealSiteFeed(env)
  } else if (await dealSitesNeedRefresh(env, Date.now())) {
    waitUntil(requestDealSiteRefresh(env, BACKGROUND_REFRESH_BACKOFF_MS).catch(() => undefined))
  }

  return json(
    { deals: feed.deals, refreshedAt: feed.refreshedAt, sources: feed.sources },
    { headers: publicHeaders },
  )
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
