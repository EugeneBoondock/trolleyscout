import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

const VTON_FLAG = 'vton'

interface GlobalFlagRow {
  enabled: number
}

interface OverrideRow {
  account_id: string
  enabled: number
  updated_at: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return methodNotAllowed(request.method, 'GET, PATCH')
  }
  const session = await getMemberSession(env, request)
  if (session.account?.role !== 'admin') {
    return json({ issues: ['Admin access is required.'] }, { headers: privateHeaders, status: 403 })
  }
  if (!env.DB) {
    return json({ issues: ['The database is unavailable.'] }, { headers: privateHeaders, status: 503 })
  }

  if (request.method === 'GET') {
    return json(await readFlags(env.DB), { headers: privateHeaders })
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json({ issues: ['Request origin is not allowed.'] }, { headers: privateHeaders, status: 403 })
  }
  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request)
  } catch {
    return json({ issues: ['Request body must be valid JSON.'] }, { headers: privateHeaders, status: 400 })
  }
  if (typeof body.enabled !== 'boolean') {
    return json({ issues: ['Say whether the fitting room is enabled.'] }, { headers: privateHeaders, status: 400 })
  }
  const enabled = body.enabled ? 1 : 0
  const now = new Date().toISOString()
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''

  if (accountId) {
    await env.DB.prepare(
      `INSERT INTO member_feature_overrides (account_id, flag, enabled, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (account_id, flag) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    )
      .bind(accountId, VTON_FLAG, enabled, now)
      .run()
  } else {
    await env.DB.prepare(
      `INSERT INTO feature_flags (flag, enabled, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT (flag) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    )
      .bind(VTON_FLAG, enabled, now)
      .run()
  }

  return json(await readFlags(env.DB), { headers: privateHeaders })
}

async function readFlags(db: D1Database) {
  const global = await db
    .prepare('SELECT enabled FROM feature_flags WHERE flag = ?')
    .bind(VTON_FLAG)
    .first<GlobalFlagRow>()
  const overrides = await db
    .prepare(
      'SELECT account_id, enabled, updated_at FROM member_feature_overrides WHERE flag = ? ORDER BY updated_at DESC',
    )
    .bind(VTON_FLAG)
    .all<OverrideRow>()

  return {
    // An absent global row has never been touched, which means enabled.
    globalEnabled: global ? global.enabled === 1 : true,
    overrides: (overrides.results ?? []).map((row) => ({
      accountId: row.account_id,
      enabled: row.enabled === 1,
      updatedAt: row.updated_at,
    })),
  }
}
