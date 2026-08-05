// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { listVoucherCodes, submitVoucherCode, voteVoucherCode } from './voucherCodeStore'

const migrationUrls = [
  '../../migrations/0015_vouchers.sql',
  '../../migrations/0047_voucher_codes.sql',
  '../../migrations/0048_voucher_markets_and_moderation.sql',
].map((path) => new NodeUrl(path, import.meta.url))

describe('voucher code store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'voucher-code-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }

    for (const migrationUrl of migrationUrls) {
      const migration = (await readFile(migrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('keeps submissions in their market and needs another shopper to confirm them', async () => {
    const submitted = await submitVoucherCode(env, {
      benefitText: 'R50 off groceries',
      code: 'SAVE50',
      countryCode: 'BW',
      retailerId: 'choppies',
    }, 'member-1')

    expect(submitted.voucherCode?.moderationStatus).toBe('unconfirmed')
    expect(await listVoucherCodes(env, { countryCode: 'ZA' })).toEqual([])
    expect(await listVoucherCodes(env, { countryCode: 'BW' })).toHaveLength(1)

    const submitterVote = await voteVoucherCode(
      env,
      submitted.voucherCode!.id,
      'member-1',
      true,
      'BW',
    )
    expect(submitterVote.voucherCode?.moderationStatus).toBe('unconfirmed')

    const confirmingVote = await voteVoucherCode(
      env,
      submitted.voucherCode!.id,
      'member-2',
      true,
      'BW',
    )
    expect(confirmingVote.voucherCode?.moderationStatus).toBe('approved')
  })

  it('rejects a vote from a different market', async () => {
    const submitted = await submitVoucherCode(env, {
      benefitText: '10% off groceries',
      code: 'SAVE10',
      countryCode: 'ZA',
      retailerId: 'shoprite',
    }, 'member-1')

    const result = await voteVoucherCode(
      env,
      submitted.voucherCode!.id,
      'member-2',
      true,
      'ZW',
    )

    expect(result).toEqual({ issues: ['That code is gone.'] })
  })

  it('hides an undated code after 30 days without a successful report', async () => {
    const submitted = await submitVoucherCode(env, {
      benefitText: '10% off groceries',
      code: 'OLD10',
      countryCode: 'ZA',
      retailerId: 'shoprite',
    }, 'member-1')
    await db.prepare(
      "UPDATE voucher_codes SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?",
    ).bind(submitted.voucherCode!.id).run()

    expect(await listVoucherCodes(env, { countryCode: 'ZA' })).toEqual([])
  })
})

function splitMigrationStatements(sql: string) {
  const statements: string[] = []
  let current = ''
  let triggerDepth = 0

  for (const line of sql.split(/\r?\n/)) {
    const normalized = line.trim().toUpperCase()
    if (normalized.startsWith('CREATE TRIGGER')) triggerDepth += 1
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

  if (current.trim()) statements.push(current.trim())
  return statements
}
