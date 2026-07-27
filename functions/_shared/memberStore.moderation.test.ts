// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { getMemberSession, setMemberBanned } from './memberStore'

const MIGRATIONS = [
  '../../migrations/0002_membership.sql',
  '../../migrations/0006_payfast_billing.sql',
  '../../migrations/0008_auth_roles.sql',
  '../../migrations/0025_scheduled_plan_changes.sql',
]

// The columns the moderation path needs, declared exactly as the migrations
// that add them do — including 0039's status default.
const EXTRA_COLUMNS = [
  'ALTER TABLE member_accounts ADD COLUMN properties_access INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE member_accounts ADD COLUMN email_lookup TEXT',
  "ALTER TABLE member_accounts ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA'",
  "ALTER TABLE member_accounts ADD COLUMN country_name TEXT NOT NULL DEFAULT 'South Africa'",
  "ALTER TABLE member_accounts ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'ZAR'",
  "ALTER TABLE member_accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
  'ALTER TABLE member_accounts ADD COLUMN banned_at TEXT',
  'ALTER TABLE member_accounts ADD COLUMN ban_reason TEXT',
  'ALTER TABLE member_accounts ADD COLUMN last_seen_at TEXT',
]

describe('member moderation', () => {
  let miniflare: Miniflare
  let env: TrolleyScoutEnv & { DB: D1Database }

  async function seedAccount(id: string, role: 'member' | 'admin', email: string) {
    await env.DB.prepare(
      `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status, role, created_at, updated_at)
        VALUES (?, ?, ?, 'free', 'active', ?, ?, ?)`,
    )
      .bind(id, email, 'Thandi', role, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
      .run()
    await env.DB.prepare(
      'INSERT INTO member_sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind(`token-${id}`, id, '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')
      .run()
  }

  function sessionRequest(token: string): Request {
    return new Request('https://trolleyscout.co.za/api/country', {
      headers: { cookie: `ts_member_session=${token}` },
    })
  }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'member-moderation-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    const db = (await miniflare.getD1Database('DB')) as unknown as D1Database
    env = { DB: db }

    for (const path of MIGRATIONS) {
      const migration = (await readFile(new NodeUrl(path, import.meta.url), 'utf8'))
        .replace(/^--.*$/gm, '')
        .trim()
      for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
        await db.prepare(statement).run()
      }
    }
    for (const statement of EXTRA_COLUMNS) {
      await db.prepare(statement).run()
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('bans an account, records the reason, and drops every live session', async () => {
    await seedAccount('account-1', 'member', 'shopper@example.com')

    const result = await setMemberBanned(env, 'account-1', true, 'Posting spam links')

    expect('account' in result && result.account.status).toBe('banned')
    expect('account' in result && result.account.banReason).toBe('Posting spam links')

    const sessions = await env.DB.prepare(
      'SELECT COUNT(*) AS total FROM member_sessions WHERE account_id = ?',
    )
      .bind('account-1')
      .first<{ total: number }>()
    expect(sessions?.total).toBe(0)
  })

  it('resolves a banned account to nobody even while its cookie is still valid', async () => {
    await seedAccount('account-2', 'member', 'shopper2@example.com')
    // Ban without going through setMemberBanned, so the session row survives
    // and the read path itself is what has to refuse.
    await env.DB.prepare("UPDATE member_accounts SET status = 'banned', ban_reason = ? WHERE id = ?")
      .bind('Chargebacks', 'account-2')
      .run()

    const session = await getMemberSession(env, sessionRequest('token-account-2'))

    expect(session.account).toBeUndefined()
    expect(session.isAuthenticated).toBe(false)
  })

  it('refuses to ban an admin account', async () => {
    await seedAccount('account-3', 'admin', 'owner@example.com')

    const result = await setMemberBanned(env, 'account-3', true, 'nope')

    expect('issues' in result).toBe(true)
    expect('issues' in result && result.issues[0]).toContain('admin')
  })

  it('unbanning clears the reason and lets a new session resolve again', async () => {
    await seedAccount('account-4', 'member', 'shopper4@example.com')
    await setMemberBanned(env, 'account-4', true, 'Mistake')

    const result = await setMemberBanned(env, 'account-4', false)

    expect('account' in result && result.account.status).toBe('active')
    expect('account' in result && result.account.banReason).toBeUndefined()

    await env.DB.prepare(
      'INSERT INTO member_sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind('token-fresh', 'account-4', '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')
      .run()

    const session = await getMemberSession(env, sessionRequest('token-fresh'))
    expect(session.account?.id).toBe('account-4')
  })

  it('stamps last_seen_at from an authenticated read', async () => {
    await seedAccount('account-5', 'member', 'shopper5@example.com')

    await getMemberSession(env, sessionRequest('token-account-5'))
    // The stamp is fire-and-forget, so let the microtask queue drain first.
    await new Promise((resolve) => setTimeout(resolve, 20))

    const row = await env.DB.prepare('SELECT last_seen_at FROM member_accounts WHERE id = ?')
      .bind('account-5')
      .first<{ last_seen_at: string | null }>()
    expect(row?.last_seen_at).toBeTruthy()
  })
})
