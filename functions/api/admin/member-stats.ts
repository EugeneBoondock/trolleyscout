// The deeper read behind a member's card in the admin console, and the place
// an admin sets that member's ceilings.
//
// Assembled from tables that already exist — saved deals, basket, window
// shopping, voucher claims, Mr Scout usage — plus the usage counters, so
// nothing new has to be recorded to answer "what does this person do here".

import type { TrolleyScoutEnv } from '../../_shared/env'
import { hasTrolleyScoutDatabase } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import {
  readMemberLimits,
  readMemberUsage,
  setMemberLimits,
} from '../../_shared/memberUsageStore'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowed(request.method, 'GET, POST')
  }

  const session = await getMemberSession(env, request)
  if (session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (!hasTrolleyScoutDatabase(env)) {
    return json(
      { message: 'No member database is connected.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  if (request.method === 'POST') {
    if (!hasTrustedMutationOrigin(request)) {
      return json(
        { message: 'Request origin is not allowed.' },
        { headers: privateHeaders, status: 403 },
      )
    }

    let body: Record<string, unknown>
    try {
      body = await readJsonObjectBody(request)
    } catch {
      return json(
        { issues: ['Request body must be valid JSON.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
    if (!accountId) {
      return json(
        { issues: ['An account ID is required.'] },
        { headers: privateHeaders, status: 422 },
      )
    }

    const limits = await setMemberLimits(env, accountId, {
      compareBlocked: body.compareBlocked === true,
      note: typeof body.note === 'string' ? body.note : undefined,
      scoutChatBlocked: body.scoutChatBlocked === true,
      scoutMessagesPerDay: optionalCount(body.scoutMessagesPerDay),
      visibleCatalogues: optionalCount(body.visibleCatalogues),
      visibleDeals: optionalCount(body.visibleDeals),
    }, session.account.id)

    return json({ limits }, { headers: privateHeaders })
  }

  const accountId = new URL(request.url).searchParams.get('accountId')?.trim() ?? ''
  if (!accountId) {
    return json(
      { issues: ['An account ID is required.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  const [usage, limits, counts] = await Promise.all([
    readMemberUsage(env, accountId),
    readMemberLimits(env, accountId),
    readRelatedCounts(env, accountId),
  ])

  return json(
    {
      stats: {
        ...counts,
        dealViewCount: usage.dealViewCount,
        limits,
        propertyViewCount: usage.propertyViewCount,
        voucherViewCount: usage.voucherViewCount,
        windowShoppingSeconds: usage.windowShoppingSeconds,
      },
    },
    { headers: privateHeaders },
  )
}

/**
 * Counts drawn from the tables that already hold this member's activity. Each
 * one is read on its own so a missing table (an older deployment) costs that
 * single figure rather than the whole panel.
 */
async function readRelatedCounts(env: TrolleyScoutEnv, accountId: string) {
  const count = async (sql: string): Promise<number> => {
    try {
      if (!env.DB) return 0
      const row = await env.DB.prepare(sql).bind(accountId).first<{ total: number }>()
      return Number(row?.total ?? 0)
    } catch {
      return 0
    }
  }

  const [
    basketItemCount,
    savedDealCount,
    savedPropertyCount,
    scoutMessageCount,
    voucherClaimedCount,
    windowShoppingSaveCount,
  ] = await Promise.all([
    count('SELECT COUNT(*) AS total FROM member_basket_items WHERE account_id = ?'),
    count('SELECT COUNT(*) AS total FROM member_saved_deals WHERE account_id = ?'),
    count(
      `SELECT COUNT(*) AS total FROM member_state
        WHERE account_id = ? AND state_key = 'saved_properties_v1'`,
    ),
    // Mr Scout keeps a per-minute usage window rather than a message log, so
    // the honest total is the sum of those windows.
    count('SELECT COALESCE(SUM(request_count), 0) AS total FROM scout_chat_usage WHERE account_id = ?'),
    count('SELECT COUNT(*) AS total FROM member_voucher_claims WHERE account_id = ?'),
    count('SELECT COUNT(*) AS total FROM window_saves WHERE account_id = ?'),
  ])

  return {
    basketItemCount,
    savedDealCount,
    savedPropertyCount,
    scoutMessageCount,
    voucherClaimedCount,
    windowShoppingSaveCount,
  }
}

function optionalCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.trunc(value)
}
