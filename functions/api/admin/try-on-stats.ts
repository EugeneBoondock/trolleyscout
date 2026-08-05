// Who is using the fitting room, and the lever to give someone more. GET
// reports this month's usage per member; PATCH grants (or removes) fittings.

import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import { hasTrustedMutationOrigin } from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'
import { adjustTryOnCredits, monthKey } from '../../_shared/tryOnQuota'

const privateHeaders = { 'cache-control': 'private, no-store' }
const MAX_ROWS = 200

interface UsageRow {
  account_id: string
  credits: number | null
  display_name: string | null
  email: string | null
  plan_id: string | null
  used_count: number
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  if (session.account?.role !== 'admin') {
    return json(
      { issues: ['Admins only.'] },
      { headers: privateHeaders, status: 403 },
    )
  }
  if (!env.DB) {
    return json(
      { issues: ['Member storage is not configured.'] },
      { headers: privateHeaders, status: 503 },
    )
  }

  if (request.method === 'GET') {
    const month = new URL(request.url).searchParams.get('month') ?? monthKey()
    const result = await env.DB.prepare(
      `SELECT
        try_on_usage.account_id AS account_id,
        try_on_usage.used_count AS used_count,
        member_accounts.email AS email,
        member_accounts.display_name AS display_name,
        member_accounts.plan_id AS plan_id,
        try_on_credits.balance AS credits
        FROM try_on_usage
        LEFT JOIN member_accounts
          ON member_accounts.id = try_on_usage.account_id
        LEFT JOIN try_on_credits
          ON try_on_credits.account_id = try_on_usage.account_id
        WHERE try_on_usage.month_key = ?
        ORDER BY try_on_usage.used_count DESC
        LIMIT ?`,
    )
      .bind(month, MAX_ROWS)
      .all<UsageRow>()

    const rows = result.results ?? []
    return json(
      {
        month,
        shoppers: rows.map((row) => ({
          accountId: row.account_id,
          credits: row.credits ?? 0,
          displayName: row.display_name ?? '',
          email: row.email ?? '',
          planId: row.plan_id ?? 'free',
          used: row.used_count,
        })),
        totals: {
          fittings: rows.reduce((total, row) => total + row.used_count, 0),
          shoppers: rows.length,
        },
      },
      { headers: privateHeaders },
    )
  }

  if (request.method !== 'PATCH') {
    return methodNotAllowed(request.method, 'GET, PATCH')
  }
  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { issues: ['Request origin is not allowed.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  let body: { accountId?: string; credits?: number }
  try {
    body = (await request.json()) as { accountId?: string; credits?: number }
  } catch {
    return json(
      { issues: ['Request body must be valid JSON.'] },
      { headers: privateHeaders, status: 400 },
    )
  }

  const accountId = (body.accountId ?? '').trim()
  const credits = Number(body.credits)
  if (!accountId || !Number.isFinite(credits) || credits === 0) {
    return json(
      { issues: ['Provide an account and a non-zero number of fittings.'] },
      { headers: privateHeaders, status: 400 },
    )
  }

  const balance = await adjustTryOnCredits(
    env,
    accountId,
    Math.trunc(credits),
    'admin-grant',
    session.account.id,
  )

  return json({ accountId, balance }, { headers: privateHeaders })
}
