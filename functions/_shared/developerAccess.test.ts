// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  authorizeDeveloperRequest,
  consumeDeveloperCall,
  hashDeveloperSecret,
} from './developerAccess'
import type { TrolleyScoutEnv } from './env'

const migrations = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0008_auth_roles.sql', import.meta.url),
  new NodeUrl('../../migrations/0030_organization_onboarding.sql', import.meta.url),
  new NodeUrl('../../migrations/0035_organization_publications.sql', import.meta.url),
  new NodeUrl('../../migrations/0043_developer_mcp_campaign_insights.sql', import.meta.url),
]

describe('developer access', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'developer-access-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    for (const migrationUrl of migrations) {
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
  })

  afterEach(async () => miniflare.dispose())

  it('hashes secrets deterministically without retaining the input', async () => {
    const hash = await hashDeveloperSecret('ts_dev_example')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).toBe(await hashDeveloperSecret('ts_dev_example'))
    expect(hash).not.toContain('ts_dev_example')
  })

  it('authorizes an active scoped key and consumes the shared allowance', async () => {
    const secret = 'ts_dev_test-key'
    await insertKey(secret, ['shopping:read'])
    const principal = await authorizeDeveloperRequest(
      env,
      request(secret),
      ['shopping:read'],
    )
    await consumeDeveloperCall(
      env,
      principal,
      'search_deals',
      'req-1',
      new Date('2026-07-29T12:34:20.000Z'),
    )
    expect(principal.accountId).toBe('developer-1')
    expect(
      await db.prepare(
        `SELECT call_count FROM developer_usage_monthly
          WHERE account_id = 'developer-1' AND usage_month = '2026-07'`,
      ).first<{ call_count: number }>(),
    ).toEqual({ call_count: 1 })
  })

  it('rejects missing scopes and an inactive Developers subscription', async () => {
    const secret = 'ts_dev_scope-key'
    await insertKey(secret, ['shopping:read'])
    await expect(
      authorizeDeveloperRequest(env, request(secret), ['campaigns:write']),
    ).rejects.toMatchObject({ code: 'scope_required', httpStatus: 403 })

    await db.prepare(
      `UPDATE member_accounts SET plan_status = 'checkout_required'
        WHERE id = 'developer-1'`,
    ).run()
    await expect(
      authorizeDeveloperRequest(env, request(secret), ['shopping:read']),
    ).rejects.toMatchObject({
      code: 'developer_subscription_required',
      httpStatus: 402,
    })
  })

  async function insertKey(secret: string, scopes: string[]) {
    await db.prepare(
      `INSERT INTO developer_api_keys (
        id, account_id, key_hash, key_prefix, name, scopes
      ) VALUES ('key-1', 'developer-1', ?, 'ts_dev_test', 'Test key', ?)`,
    ).bind(await hashDeveloperSecret(secret), JSON.stringify(scopes)).run()
  }
})

function request(secret: string) {
  return new Request('https://trolleyscout.co.za/api/developer/v1/deals', {
    headers: { authorization: `Bearer ${secret}` },
  })
}
