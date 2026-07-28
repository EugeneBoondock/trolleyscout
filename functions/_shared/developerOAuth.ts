import type { MemberAccount } from '../../src/types'
import {
  DEVELOPER_SCOPES,
  hashDeveloperSecret,
  normalizeDeveloperScopes,
  type DeveloperScope,
} from './developerAccess'
import type { TrolleyScoutEnv } from './env'
import { hasTrolleyScoutDatabase } from './env'

const ACCESS_TOKEN_SECONDS = 60 * 60
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60
const AUTHORIZATION_CODE_SECONDS = 5 * 60

export interface OAuthClientInput {
  clientName: string
  redirectUris: string[]
  tokenEndpointAuthMethod?: 'none' | 'client_secret_post'
}

export interface OAuthAuthorizationInput {
  clientId: string
  codeChallenge: string
  codeChallengeMethod: string
  redirectUri: string
  scopes: DeveloperScope[]
}

interface OAuthClientRow {
  client_id: string
  client_name: string
  client_secret_hash: string | null
  redirect_uris: string
  token_endpoint_auth_method: 'none' | 'client_secret_post'
}

interface OAuthCodeRow {
  account_id: string
  client_id: string
  code_challenge: string
  consumed_at: string | null
  expires_at: string
  id: string
  redirect_uri: string
  scopes: string
}

interface OAuthRefreshRow {
  account_id: string
  client_id: string
  expires_at: string
  id: string
  revoked_at: string | null
  scopes: string
}

export class OAuthError extends Error {
  constructor(
    public error: string,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export function oauthIssuer(env: TrolleyScoutEnv, request: Request): string {
  const configured = env.APP_URL?.trim()
  return configured ? new URL(configured).origin : new URL(request.url).origin
}

export async function registerOAuthClient(
  env: TrolleyScoutEnv,
  input: OAuthClientInput,
) {
  const db = requiredDatabase(env)
  const clientName = input.clientName.trim().slice(0, 100)
  const redirectUris = [...new Set(input.redirectUris.map((value) => value.trim()))]
  const method = input.tokenEndpointAuthMethod ?? 'none'
  if (clientName.length < 2) throw new OAuthError('invalid_client_metadata', 'Provide a client name.')
  if (redirectUris.length === 0 || redirectUris.some((uri) => !validRedirectUri(uri))) {
    throw new OAuthError('invalid_redirect_uri', 'Provide valid HTTPS or loopback redirect URIs.')
  }
  if (method !== 'none' && method !== 'client_secret_post') {
    throw new OAuthError('invalid_client_metadata', 'Unsupported token endpoint authentication method.')
  }

  const clientId = `ts_oauth_client_${randomSecret(18)}`
  const clientSecret = method === 'client_secret_post'
    ? `ts_oauth_secret_${randomSecret(32)}`
    : undefined
  await db.prepare(
    `INSERT INTO developer_oauth_clients (
      id, client_id, client_secret_hash, client_name, redirect_uris,
      token_endpoint_auth_method, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `oauth-client-${crypto.randomUUID()}`,
    clientId,
    clientSecret ? await hashDeveloperSecret(clientSecret) : null,
    clientName,
    JSON.stringify(redirectUris),
    method,
    new Date().toISOString(),
  ).run()
  return {
    client_id: clientId,
    client_name: clientName,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: method,
  }
}

export async function readOAuthClient(
  env: TrolleyScoutEnv,
  clientId: string,
): Promise<OAuthClientRow | undefined> {
  return (await requiredDatabase(env).prepare(
    `SELECT client_id, client_name, client_secret_hash, redirect_uris,
        token_endpoint_auth_method
      FROM developer_oauth_clients WHERE client_id = ?`,
  ).bind(clientId).first<OAuthClientRow>()) ?? undefined
}

export async function issueAuthorizationCode(
  env: TrolleyScoutEnv,
  account: MemberAccount,
  input: OAuthAuthorizationInput,
) {
  if (
    account.role !== 'admin' &&
    (account.planId !== 'developers' || account.planStatus !== 'active')
  ) {
    throw new OAuthError(
      'access_denied',
      'An active Developers subscription is required.',
      403,
    )
  }
  const client = await validateAuthorizationInput(env, input)
  const code = `ts_oauth_code_${randomSecret(32)}`
  const now = Date.now()
  await requiredDatabase(env).prepare(
    `INSERT INTO developer_oauth_codes (
      id, code_hash, client_id, account_id, redirect_uri, scopes,
      code_challenge, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `oauth-code-${crypto.randomUUID()}`,
    await hashDeveloperSecret(code),
    client.client_id,
    account.id,
    input.redirectUri,
    JSON.stringify(input.scopes),
    input.codeChallenge,
    new Date(now + AUTHORIZATION_CODE_SECONDS * 1000).toISOString(),
    new Date(now).toISOString(),
  ).run()
  return code
}

export async function validateAuthorizationInput(
  env: TrolleyScoutEnv,
  input: OAuthAuthorizationInput,
) {
  const client = await readOAuthClient(env, input.clientId)
  if (!client) throw new OAuthError('invalid_client', 'OAuth client not found.', 401)
  const redirectUris = safeStringArray(client.redirect_uris)
  if (!redirectUris.includes(input.redirectUri)) {
    throw new OAuthError('invalid_redirect_uri', 'Redirect URI does not match the registered client.')
  }
  if (input.codeChallengeMethod !== 'S256' || input.codeChallenge.length < 43) {
    throw new OAuthError('invalid_request', 'S256 PKCE is required.')
  }
  if (input.scopes.length === 0) throw new OAuthError('invalid_scope', 'Choose at least one scope.')
  return client
}

export async function exchangeAuthorizationCode(
  env: TrolleyScoutEnv,
  input: {
    clientId: string
    clientSecret?: string
    code: string
    codeVerifier: string
    redirectUri: string
  },
) {
  const db = requiredDatabase(env)
  const client = await validateClient(env, input.clientId, input.clientSecret)
  const code = await db.prepare(
    `SELECT id, client_id, account_id, redirect_uri, scopes, code_challenge,
        expires_at, consumed_at
      FROM developer_oauth_codes WHERE code_hash = ?`,
  ).bind(await hashDeveloperSecret(input.code)).first<OAuthCodeRow>()
  const nowIso = new Date().toISOString()
  if (
    !code ||
    code.client_id !== client.client_id ||
    code.redirect_uri !== input.redirectUri ||
    code.consumed_at ||
    code.expires_at <= nowIso
  ) {
    throw new OAuthError('invalid_grant', 'Authorization code is invalid or expired.')
  }
  if ((await pkceChallenge(input.codeVerifier)) !== code.code_challenge) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed.')
  }
  const tokens = await createTokenPair(env, code.account_id, code.client_id, normalizeDeveloperScopes(code.scopes))
  await db.prepare(
    'UPDATE developer_oauth_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
  ).bind(nowIso, code.id).run()
  return tokens
}

export async function refreshOAuthTokens(
  env: TrolleyScoutEnv,
  input: { clientId: string; clientSecret?: string; refreshToken: string },
) {
  const db = requiredDatabase(env)
  const client = await validateClient(env, input.clientId, input.clientSecret)
  const current = await db.prepare(
    `SELECT id, client_id, account_id, scopes, expires_at, revoked_at
      FROM developer_oauth_refresh_tokens WHERE token_hash = ?`,
  ).bind(await hashDeveloperSecret(input.refreshToken)).first<OAuthRefreshRow>()
  const nowIso = new Date().toISOString()
  if (
    !current ||
    current.client_id !== client.client_id ||
    current.revoked_at ||
    current.expires_at <= nowIso
  ) {
    throw new OAuthError('invalid_grant', 'Refresh token is invalid or expired.')
  }
  const next = await createTokenPair(
    env,
    current.account_id,
    current.client_id,
    normalizeDeveloperScopes(current.scopes),
  )
  await db.prepare(
    `UPDATE developer_oauth_refresh_tokens
      SET revoked_at = ?, replaced_by_id = ?
      WHERE id = ? AND revoked_at IS NULL`,
  ).bind(nowIso, next.refreshTokenId, current.id).run()
  return next
}

export async function revokeOAuthSecret(env: TrolleyScoutEnv, secret: string): Promise<void> {
  const db = requiredDatabase(env)
  const hash = await hashDeveloperSecret(secret)
  const nowIso = new Date().toISOString()
  await db.batch([
    db.prepare(
      `UPDATE developer_oauth_access_tokens SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL`,
    ).bind(nowIso, hash),
    db.prepare(
      `UPDATE developer_oauth_refresh_tokens SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL`,
    ).bind(nowIso, hash),
  ])
}

async function createTokenPair(
  env: TrolleyScoutEnv,
  accountId: string,
  clientId: string,
  scopes: DeveloperScope[],
) {
  const db = requiredDatabase(env)
  const accessToken = `ts_oauth_at_${randomSecret(32)}`
  const refreshToken = `ts_oauth_rt_${randomSecret(32)}`
  const accessTokenId = `oauth-access-${crypto.randomUUID()}`
  const refreshTokenId = `oauth-refresh-${crypto.randomUUID()}`
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  await db.batch([
    db.prepare(
      `INSERT INTO developer_oauth_access_tokens (
        id, token_hash, client_id, account_id, scopes, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      accessTokenId,
      await hashDeveloperSecret(accessToken),
      clientId,
      accountId,
      JSON.stringify(scopes),
      new Date(now + ACCESS_TOKEN_SECONDS * 1000).toISOString(),
      nowIso,
    ),
    db.prepare(
      `INSERT INTO developer_oauth_refresh_tokens (
        id, token_hash, client_id, account_id, scopes, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      refreshTokenId,
      await hashDeveloperSecret(refreshToken),
      clientId,
      accountId,
      JSON.stringify(scopes),
      new Date(now + REFRESH_TOKEN_SECONDS * 1000).toISOString(),
      nowIso,
    ),
  ])
  return {
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refreshToken,
    refreshTokenId,
    scope: scopes.join(' '),
    token_type: 'Bearer',
  }
}

async function validateClient(
  env: TrolleyScoutEnv,
  clientId: string,
  clientSecret?: string,
) {
  const client = await readOAuthClient(env, clientId)
  if (!client) throw new OAuthError('invalid_client', 'OAuth client not found.', 401)
  if (client.token_endpoint_auth_method === 'client_secret_post') {
    if (
      !clientSecret ||
      !client.client_secret_hash ||
      await hashDeveloperSecret(clientSecret) !== client.client_secret_hash
    ) {
      throw new OAuthError('invalid_client', 'OAuth client authentication failed.', 401)
    }
  }
  return client
}

function requiredDatabase(env: TrolleyScoutEnv): D1Database {
  if (!hasTrolleyScoutDatabase(env)) {
    throw new OAuthError('temporarily_unavailable', 'OAuth is temporarily unavailable.', 503)
  }
  return env.DB
}

function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

function randomSecret(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function safeStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export { DEVELOPER_SCOPES }
