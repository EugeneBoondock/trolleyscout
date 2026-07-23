// @vitest-environment node

import { readdir, readFile } from 'node:fs/promises'
import { URL as NodeUrl, fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { deleteMemberAccount } from './memberStore'
import { hashPassword } from './password'

const migrationsDir = fileURLToPath(new NodeUrl('../../migrations', import.meta.url))

describe('account deletion (right to erasure)', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'member-delete-account-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }

    // The full migration chain: deletion touches tables from many migrations,
    // so the schema must match production exactly.
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) {
      const migration = (await readFile(join(migrationsDir, file), 'utf8'))
        .replace(/^--.*$/gm, '')
        .trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }

    await db.prepare(
      `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status, password_hash)
       VALUES (?, ?, ?, 'free', 'active', ?)`,
    ).bind('member-1', 'member@example.test', 'Member', await hashPassword('correct horse battery')).run()
    await db.prepare(
      `INSERT INTO member_sessions (token, account_id, created_at, expires_at)
       VALUES ('token-1', 'member-1', '2026-07-23T00:00:00.000Z', '2036-07-23T00:00:00.000Z')`,
    ).run()
    await db.prepare(
      `INSERT INTO member_saved_deals (
        id, account_id, deal_id, retailer_id, source_label, source_url,
        product_url, title, captured_at, price_text, evidence_text
      ) VALUES ('saved-1', 'member-1', 'deal-1', 'checkers', 'Feed',
        'https://example.test', 'https://example.test/p', 'Deal',
        '2026-07-23T00:00:00.000Z', 'R10', 'ev')`,
    ).run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('refuses deletion when the password is wrong and keeps every row', async () => {
    const result = await deleteMemberAccount(env, 'member-1', { currentPassword: 'wrong' })

    expect(result).toEqual({ issues: ['Your current password is not correct.'] })
    const account = await db.prepare("SELECT id FROM member_accounts WHERE id = 'member-1'").first()
    expect(account).not.toBeNull()
  })

  it('deletes the account, sessions, and personal data with the right password', async () => {
    const result = await deleteMemberAccount(env, 'member-1', {
      currentPassword: 'correct horse battery',
    })

    expect(result).toEqual({ deleted: true })
    for (const [table, column] of [
      ['member_accounts', 'id'],
      ['member_sessions', 'account_id'],
      ['member_saved_deals', 'account_id'],
    ] as const) {
      const row = await db.prepare(`SELECT 1 AS present FROM ${table} WHERE ${column} = 'member-1'`).first()
      expect(row, `${table} must have no rows for the deleted account`).toBeNull()
    }
  })
})

// Trigger-aware: fragments inside CREATE TRIGGER ... BEGIN ... END; contain
// semicolons and must stay one statement.
function splitMigrationStatements(sql: string) {
  const statements: string[] = []
  let pending = ''
  for (const fragment of sql.split(';')) {
    pending = pending ? `${pending};${fragment}` : fragment
    const opensBody = /\bBEGIN\b/i.test(pending)
    const closesBody = /\bEND\s*$/i.test(pending.trim())
    if (opensBody && !closesBody) {
      continue
    }
    const statement = pending.trim()
    if (statement) {
      statements.push(statement)
    }
    pending = ''
  }
  const rest = pending.trim()
  if (rest) {
    statements.push(rest)
  }
  return statements
}
