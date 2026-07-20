// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import {
  countOpenSupportMessages,
  createSupportMessage,
  listSupportMessages,
  setSupportMessageStatus,
} from './supportStore'

const membershipMigrationUrl = new NodeUrl('../../migrations/0002_membership.sql', import.meta.url)
const supportMigrationUrl = new NodeUrl(
  '../../migrations/0024_support_and_billing_cleanup.sql',
  import.meta.url,
)

const validInput = {
  email: 'shopper@example.co.za',
  message: 'A tin of beans showed the wrong price at my local store.',
  name: 'Thandi',
  topic: 'Deal or price problem',
}

describe('support store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'support-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = (await miniflare.getD1Database('DB')) as unknown as D1Database
    env = { DB: db }

    for (const migrationUrl of [membershipMigrationUrl, supportMigrationUrl]) {
      const migration = (await readFile(migrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('rejects a message with a missing name, bad email or too-short body', async () => {
    const result = await createSupportMessage(env, {
      email: 'not-an-email',
      message: 'short',
      name: '',
      topic: '',
    })

    expect('issues' in result).toBe(true)
    if ('issues' in result) {
      expect(result.issues.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('stores a valid message as open and returns it in the list', async () => {
    const result = await createSupportMessage(env, validInput)

    expect('id' in result).toBe(true)

    const messages = await listSupportMessages(env)
    expect(messages).toHaveLength(1)
    expect(messages[0].status).toBe('open')
    expect(messages[0].email).toBe('shopper@example.co.za')
    expect(messages[0].topic).toBe('Deal or price problem')
  })

  it('lowercases the email and links an account when provided', async () => {
    await db
      .prepare(
        `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status, created_at, updated_at)
          VALUES ('member-1', 'member@example.co.za', 'Member', 'free', 'active', ?, ?)`,
      )
      .bind('2026-07-20T09:00:00.000Z', '2026-07-20T09:00:00.000Z')
      .run()

    await createSupportMessage(env, {
      ...validInput,
      accountId: 'member-1',
      email: 'MixedCase@Example.co.za',
    })

    const messages = await listSupportMessages(env)
    expect(messages[0].email).toBe('mixedcase@example.co.za')
    expect(messages[0].accountId).toBe('member-1')
  })

  it('throttles once an address has sent several messages in the window', async () => {
    for (let i = 0; i < 5; i += 1) {
      const ok = await createSupportMessage(env, validInput)
      expect('id' in ok).toBe(true)
    }

    const blocked = await createSupportMessage(env, validInput)
    expect('issues' in blocked).toBe(true)
  })

  it('resolves a message and sorts open messages ahead of resolved ones', async () => {
    const first = await createSupportMessage(env, { ...validInput, email: 'a@example.co.za' })
    await createSupportMessage(env, { ...validInput, email: 'b@example.co.za' })

    expect(await countOpenSupportMessages(env)).toBe(2)

    if ('id' in first) {
      const update = await setSupportMessageStatus(env, first.id, 'resolved')
      expect('ok' in update).toBe(true)
    }

    expect(await countOpenSupportMessages(env)).toBe(1)

    const messages = await listSupportMessages(env)
    expect(messages[0].status).toBe('open')
    expect(messages[messages.length - 1].status).toBe('resolved')
  })

  it('reports a missing message when resolving an unknown id', async () => {
    const result = await setSupportMessageStatus(env, 'support-missing', 'resolved')
    expect('issues' in result).toBe(true)
  })
})

function splitMigrationStatements(sql: string) {
  const statements: string[] = []
  let current = ''
  let triggerDepth = 0

  for (const line of sql.split(/\r?\n/)) {
    const normalized = line.trim().toUpperCase()
    if (normalized.startsWith('CREATE TRIGGER')) {
      triggerDepth += 1
    }
    current += `${line}\n`
    if (triggerDepth > 0 && normalized === 'END;') {
      triggerDepth -= 1
      statements.push(current.trim())
      current = ''
    } else if (triggerDepth === 0 && normalized.endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current.trim())
  }
  return statements
}
