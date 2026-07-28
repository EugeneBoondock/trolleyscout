// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MemberAccount } from '../../src/types'
import {
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  refreshOAuthTokens,
  registerOAuthClient,
  validateAuthorizationInput,
} from './developerOAuth'
import type { TrolleyScoutEnv } from './env'

const migrationUrls = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0008_auth_roles.sql', import.meta.url),
  new NodeUrl('../../migrations/0030_organization_onboarding.sql', import.meta.url),
  new NodeUrl('../../migrations/0035_organization_publications.sql', import.meta.url),
  new NodeUrl('../../migrations/0043_developer_mcp_campaign_insights.sql', import.meta.url),
]

describe('developer OAuth', () => {
  let miniflare: Miniflare
  let env: TrolleyScoutEnv & { DB: D1Database }
  let account: MemberAccount

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'developer-oauth-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    const db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    for (const migrationUrl of migrationUrls) {
      const sql = (await readFile(migrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
      for (const statement of sql.split(';').map((value) => value.trim()).filter(Boolean)) {
        await db.prepare(statement).run()
      }
    }
    await db.prepare(
      `INSERT INTO member_accounts (
        id, email, display_name, plan_id, plan_status, role
      ) VALUES ('developer-1', 'dev@example.com', 'Dev User', 'developers', 'active', 'member')`,
    ).run()
    account = {
      countryCode: 'ZA',
      countryName: 'South Africa',
      createdAt: '2026-07-29T00:00:00.000Z',
      currencyCode: 'ZAR',
      displayName: 'Dev User',
      email: 'dev@example.com',
      id: 'developer-1',
      initials: 'DU',
      planId: 'developers',
      planName: 'Developers',
      planStatus: 'active',
      propertiesAccess: true,
      role: 'member',
      status: 'active',
      updatedAt: '2026-07-29T00:00:00.000Z',
    }
  })

  afterEach(async () => miniflare.dispose())

  it('requires S256 PKCE', async () => {
    const client = await register()
    await expect(validateAuthorizationInput(env, {
      clientId: client.client_id,
      codeChallenge: 'x'.repeat(43),
      codeChallengeMethod: 'plain',
      redirectUri: 'https://client.example/callback',
      scopes: ['shopping:read'],
    })).rejects.toMatchObject({ error: 'invalid_request' })
  })

  it('exchanges a single-use code and rotates refresh tokens', async () => {
    const client = await register()
    const verifier = 'a'.repeat(64)
    const code = await issueAuthorizationCode(env, account, {
      clientId: client.client_id,
      codeChallenge: await challenge(verifier),
      codeChallengeMethod: 'S256',
      redirectUri: 'https://client.example/callback',
      scopes: ['shopping:read', 'trends:read'],
    })
    const tokens = await exchangeAuthorizationCode(env, {
      clientId: client.client_id,
      code,
      codeVerifier: verifier,
      redirectUri: 'https://client.example/callback',
    })
    expect(tokens.access_token).toMatch(/^ts_oauth_at_/)
    expect(tokens.refresh_token).toMatch(/^ts_oauth_rt_/)
    await expect(exchangeAuthorizationCode(env, {
      clientId: client.client_id,
      code,
      codeVerifier: verifier,
      redirectUri: 'https://client.example/callback',
    })).rejects.toMatchObject({ error: 'invalid_grant' })

    const refreshed = await refreshOAuthTokens(env, {
      clientId: client.client_id,
      refreshToken: tokens.refresh_token,
    })
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token)
    await expect(refreshOAuthTokens(env, {
      clientId: client.client_id,
      refreshToken: tokens.refresh_token,
    })).rejects.toMatchObject({ error: 'invalid_grant' })
  })

  function register() {
    return registerOAuthClient(env, {
      clientName: 'Test MCP Client',
      redirectUris: ['https://client.example/callback'],
    })
  }
})

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
