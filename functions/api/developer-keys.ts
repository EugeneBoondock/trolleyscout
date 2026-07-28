import { getDeveloperAllowance } from '../../src/data/memberPlans'
import type { DeveloperApiKeySummary } from '../../src/types'
import {
  DEVELOPER_SCOPES,
  hashDeveloperSecret,
  normalizeDeveloperScopes,
  type DeveloperScope,
} from '../_shared/developerAccess'
import type { TrolleyScoutEnv } from '../_shared/env'
import { hasTrolleyScoutDatabase } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }
const MAX_ACTIVE_KEYS = 10

interface DeveloperKeyBody {
  expiresAt?: string
  keyId?: string
  name?: string
  scopes?: unknown
}

interface KeyRow {
  created_at: string
  expires_at: string | null
  id: string
  key_prefix: string
  last_used_at: string | null
  name: string
  revoked_at: string | null
  scopes: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json({ issues: ['Sign in first.'] }, { headers: privateHeaders, status: 401 })
  }
  if (
    account.role !== 'admin' &&
    (account.planId !== 'developers' || account.planStatus !== 'active')
  ) {
    return json(
      { issues: ['An active Developers subscription is required.'] },
      { headers: privateHeaders, status: 402 },
    )
  }
  if (!hasTrolleyScoutDatabase(env)) {
    return json(
      { issues: ['Developer access is temporarily unavailable.'] },
      { headers: privateHeaders, status: 503 },
    )
  }

  if (request.method === 'GET') {
    return json(await developerKeyResource(env.DB, account.id, account.planId), {
      headers: privateHeaders,
    })
  }

  if (request.method === 'POST') {
    const body = await readBody(request)
    if (!body) {
      return json(
        { issues: ['Request body must be valid JSON.'] },
        { headers: privateHeaders, status: 400 },
      )
    }
    const name = body.name?.trim().slice(0, 80) ?? ''
    const scopes = normalizeDeveloperScopes(body.scopes)
    const expiresAt = normalizeExpiry(body.expiresAt)
    const issues: string[] = []
    if (name.length < 2) issues.push('Give this API key a name.')
    if (scopes.length === 0) issues.push('Choose at least one API scope.')
    if (
      Array.isArray(body.scopes) &&
      body.scopes.some((scope) => !DEVELOPER_SCOPES.includes(scope as DeveloperScope))
    ) {
      issues.push('Choose only supported API scopes.')
    }
    if (body.expiresAt && !expiresAt) issues.push('Choose a future expiry date.')
    const active = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM developer_api_keys
        WHERE account_id = ? AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?)`,
    ).bind(account.id, new Date().toISOString()).first<{ count: number }>()
    if (Number(active?.count ?? 0) >= MAX_ACTIVE_KEYS) {
      issues.push(`Revoke an API key before creating more than ${MAX_ACTIVE_KEYS}.`)
    }
    if (issues.length > 0) {
      return json({ issues }, { headers: privateHeaders, status: 422 })
    }

    const secret = createApiKey()
    const id = `dev-key-${crypto.randomUUID()}`
    await env.DB.prepare(
      `INSERT INTO developer_api_keys (
        id, account_id, key_hash, key_prefix, name, scopes, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      account.id,
      await hashDeveloperSecret(secret),
      secret.slice(0, 15),
      name,
      JSON.stringify(scopes),
      expiresAt ?? null,
      new Date().toISOString(),
    ).run()
    const resource = await developerKeyResource(env.DB, account.id, account.planId)
    return json(
      { ...resource, secret },
      { headers: privateHeaders, status: 201 },
    )
  }

  if (request.method === 'DELETE') {
    const body = await readBody(request)
    if (!body?.keyId) {
      return json(
        { issues: ['Choose an API key to revoke.'] },
        { headers: privateHeaders, status: 422 },
      )
    }
    const result = await env.DB.prepare(
      `UPDATE developer_api_keys SET revoked_at = ?
        WHERE id = ? AND account_id = ? AND revoked_at IS NULL`,
    ).bind(new Date().toISOString(), body.keyId, account.id).run()
    if (!result.meta.changes) {
      return json({ issues: ['API key not found.'] }, { headers: privateHeaders, status: 404 })
    }
    return json(await developerKeyResource(env.DB, account.id, account.planId), {
      headers: privateHeaders,
    })
  }

  return methodNotAllowed(request.method, 'GET, POST, DELETE')
}

async function developerKeyResource(
  db: D1Database,
  accountId: string,
  planId: Parameters<typeof getDeveloperAllowance>[0],
) {
  const rows = await db.prepare(
    `SELECT id, key_prefix, name, scopes, expires_at, revoked_at, last_used_at, created_at
      FROM developer_api_keys WHERE account_id = ?
      ORDER BY created_at DESC`,
  ).bind(accountId).all<KeyRow>()
  const usageMonth = new Date().toISOString().slice(0, 7)
  const usage = await db.prepare(
    `SELECT call_count FROM developer_usage_monthly
      WHERE account_id = ? AND usage_month = ?`,
  ).bind(accountId, usageMonth).first<{ call_count: number }>()
  return {
    allowance: getDeveloperAllowance(planId) ?? {
      callsPerMinute: 120,
      callsPerMonth: 25_000,
    },
    keys: rows.results.map(rowToSummary),
    scopes: DEVELOPER_SCOPES,
    usage: Number(usage?.call_count ?? 0),
  }
}

function rowToSummary(row: KeyRow): DeveloperApiKeySummary {
  return {
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
    id: row.id,
    keyPrefix: row.key_prefix,
    lastUsedAt: row.last_used_at ?? undefined,
    name: row.name,
    revokedAt: row.revoked_at ?? undefined,
    scopes: normalizeDeveloperScopes(row.scopes),
  }
}

function createApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const raw = String.fromCharCode(...bytes)
  return `ts_dev_${btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`
}

function normalizeExpiry(value: string | undefined): string | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now()
    ? new Date(timestamp).toISOString()
    : undefined
}

async function readBody(request: Request): Promise<DeveloperKeyBody | undefined> {
  try {
    return (await request.json()) as DeveloperKeyBody
  } catch {
    return undefined
  }
}
