import { getDeveloperAllowance } from '../../src/data/memberPlans'
import type { MemberPlanId } from '../../src/types'
import type { TrolleyScoutEnv } from './env'
import { hasTrolleyScoutDatabase } from './env'

export const DEVELOPER_SCOPES = [
  'shopping:read',
  'trends:read',
  'campaigns:read',
  'campaigns:write',
] as const

export type DeveloperScope = (typeof DEVELOPER_SCOPES)[number]
export type DeveloperCredentialType = 'api_key' | 'oauth' | 'session' | 'unknown'

export interface DeveloperPrincipal {
  accountId: string
  credentialId: string
  credentialType: DeveloperCredentialType
  displayName: string
  email: string
  isAdmin: boolean
  planId: MemberPlanId
  scopes: DeveloperScope[]
}

interface CredentialRow {
  account_id: string
  credential_id: string
  display_name: string
  email: string
  expires_at: string | null
  plan_id: string
  plan_status: string
  revoked_at: string | null
  role: string
  scopes: string
}

export class DeveloperAccessError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
  ) {
    super(message)
  }
}

export async function hashDeveloperSecret(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function normalizeDeveloperScopes(value: unknown): DeveloperScope[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? safeJsonArray(value)
      : []
  return [...new Set(candidates.filter(isDeveloperScope))]
}

export async function authorizeDeveloperRequest(
  env: TrolleyScoutEnv,
  request: Request,
  requiredScopes: DeveloperScope[] = [],
): Promise<DeveloperPrincipal> {
  if (!hasTrolleyScoutDatabase(env)) {
    throw new DeveloperAccessError(
      'developer_service_unavailable',
      503,
      'Developer access is temporarily unavailable.',
    )
  }

  const authorization = request.headers.get('authorization')?.trim() ?? ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
  if (!match) {
    throw new DeveloperAccessError(
      'invalid_credentials',
      401,
      'Provide a developer API key as a bearer token.',
    )
  }

  const keyHash = await hashDeveloperSecret(match[1])
  const nowIso = new Date().toISOString()
  const row = await env.DB.prepare(
    `SELECT key.id AS credential_id, key.account_id, key.scopes, key.expires_at,
        key.revoked_at, account.email, account.display_name, account.plan_id,
        account.plan_status, account.role
      FROM developer_api_keys AS key
      INNER JOIN member_accounts AS account ON account.id = key.account_id
      WHERE key.key_hash = ?`,
  ).bind(keyHash).first<CredentialRow>()

  if (!row || row.revoked_at || (row.expires_at && row.expires_at <= nowIso)) {
    throw new DeveloperAccessError('invalid_credentials', 401, 'The developer API key is invalid.')
  }

  return principalFromCredential(row, requiredScopes)
}

export async function authorizeOAuthToken(
  env: TrolleyScoutEnv,
  token: string,
  requiredScopes: DeveloperScope[] = [],
): Promise<DeveloperPrincipal> {
  if (!hasTrolleyScoutDatabase(env)) {
    throw new DeveloperAccessError(
      'developer_service_unavailable',
      503,
      'Developer access is temporarily unavailable.',
    )
  }
  const tokenHash = await hashDeveloperSecret(token)
  const row = await env.DB.prepare(
    `SELECT token.id AS credential_id, token.account_id, token.scopes, token.expires_at,
        token.revoked_at, account.email, account.display_name, account.plan_id,
        account.plan_status, account.role
      FROM developer_oauth_access_tokens AS token
      INNER JOIN member_accounts AS account ON account.id = token.account_id
      WHERE token.token_hash = ?`,
  ).bind(tokenHash).first<CredentialRow>()
  const nowIso = new Date().toISOString()
  if (!row || row.revoked_at || !row.expires_at || row.expires_at <= nowIso) {
    throw new DeveloperAccessError('invalid_token', 401, 'The OAuth access token is invalid or expired.')
  }
  return principalFromCredential(row, requiredScopes, 'oauth')
}

export async function consumeDeveloperCall(
  env: TrolleyScoutEnv,
  principal: DeveloperPrincipal,
  operation: string,
  requestId: string,
  now = new Date(),
): Promise<void> {
  if (!hasTrolleyScoutDatabase(env)) {
    throw new DeveloperAccessError(
      'developer_service_unavailable',
      503,
      'Developer access is temporarily unavailable.',
    )
  }
  const allowance = principal.isAdmin
    ? { callsPerMinute: 120, callsPerMonth: 25_000 }
    : getDeveloperAllowance(principal.planId)
  if (!allowance) {
    throw new DeveloperAccessError(
      'developer_subscription_required',
      402,
      'An active Developers subscription is required.',
    )
  }

  const usageMonth = now.toISOString().slice(0, 7)
  const windowStart = `${now.toISOString().slice(0, 16)}:00.000Z`
  const monthly = await env.DB.prepare(
    `SELECT call_count FROM developer_usage_monthly
      WHERE account_id = ? AND usage_month = ?`,
  ).bind(principal.accountId, usageMonth).first<{ call_count: number }>()
  if (Number(monthly?.call_count ?? 0) >= allowance.callsPerMonth) {
    throw new DeveloperAccessError(
      'monthly_allowance_exhausted',
      402,
      'The monthly developer call allowance has been used.',
    )
  }

  const minute = await env.DB.prepare(
    `SELECT call_count FROM developer_rate_windows
      WHERE account_id = ? AND window_start = ?`,
  ).bind(principal.accountId, windowStart).first<{ call_count: number }>()
  if (Number(minute?.call_count ?? 0) >= allowance.callsPerMinute) {
    throw new DeveloperAccessError(
      'rate_limit_exceeded',
      429,
      'The developer rate limit has been reached. Try again shortly.',
    )
  }

  const nowIso = now.toISOString()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO developer_usage_monthly (account_id, usage_month, call_count, updated_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(account_id, usage_month)
        DO UPDATE SET call_count = call_count + 1, updated_at = excluded.updated_at`,
    ).bind(principal.accountId, usageMonth, nowIso),
    env.DB.prepare(
      `INSERT INTO developer_rate_windows (account_id, window_start, call_count)
        VALUES (?, ?, 1)
        ON CONFLICT(account_id, window_start)
        DO UPDATE SET call_count = call_count + 1`,
    ).bind(principal.accountId, windowStart),
    env.DB.prepare(
      `INSERT INTO developer_call_audit (
        id, request_id, account_id, credential_type, credential_id,
        operation, outcome, status_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'accepted', 200, ?)`,
    ).bind(
      `dev-audit-${crypto.randomUUID()}`,
      requestId,
      principal.accountId,
      principal.credentialType,
      principal.credentialId,
      boundedOperation(operation),
      nowIso,
    ),
  ])
}

export async function recordDeveloperCallFailure(
  env: TrolleyScoutEnv,
  input: {
    accountId?: string
    credentialId?: string
    credentialType?: DeveloperCredentialType
    operation: string
    requestId: string
    statusCode: number
  },
): Promise<void> {
  if (!hasTrolleyScoutDatabase(env)) return
  await env.DB.prepare(
    `INSERT INTO developer_call_audit (
      id, request_id, account_id, credential_type, credential_id,
      operation, outcome, status_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?, ?)`,
  ).bind(
    `dev-audit-${crypto.randomUUID()}`,
    input.requestId,
    input.accountId ?? null,
    input.credentialType ?? 'unknown',
    input.credentialId ?? null,
    boundedOperation(input.operation),
    input.statusCode,
    new Date().toISOString(),
  ).run()
}

function principalFromCredential(
  row: CredentialRow,
  requiredScopes: DeveloperScope[],
  credentialType: DeveloperCredentialType = 'api_key',
): DeveloperPrincipal {
  const planId = normalizePlanId(row.plan_id)
  const isAdmin = row.role === 'admin'
  if (!isAdmin && (planId !== 'developers' || row.plan_status !== 'active')) {
    throw new DeveloperAccessError(
      'developer_subscription_required',
      402,
      'An active Developers subscription is required.',
    )
  }
  const scopes = normalizeDeveloperScopes(row.scopes)
  const missing = requiredScopes.find((scope) => !scopes.includes(scope))
  if (missing) {
    throw new DeveloperAccessError(
      'scope_required',
      403,
      `This credential does not include ${missing}.`,
    )
  }
  return {
    accountId: row.account_id,
    credentialId: row.credential_id,
    credentialType,
    displayName: row.display_name,
    email: row.email,
    isAdmin,
    planId,
    scopes,
  }
}

function isDeveloperScope(value: unknown): value is DeveloperScope {
  return typeof value === 'string' && DEVELOPER_SCOPES.includes(value as DeveloperScope)
}

function safeJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizePlanId(value: string): MemberPlanId {
  return value === 'developers' ||
    value === 'organization' ||
    value === 'household' ||
    value === 'scout'
    ? value
    : 'free'
}

function boundedOperation(value: string): string {
  return value.trim().slice(0, 120) || 'unknown'
}
