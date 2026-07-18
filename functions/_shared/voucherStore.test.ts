// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VoucherCandidate } from '../../src/services/vouchers/types'
import type { TrolleyScoutEnv } from './env'
import {
  claimVoucher,
  expireVouchers,
  listActiveVouchers,
  readVoucherSourceCursor,
  upsertVouchers,
  writeVoucherSourceCursor,
} from './voucherStore'

const membershipMigrationUrl = new NodeUrl('../../migrations/0002_membership.sql', import.meta.url)
const voucherMigrationUrl = new NodeUrl('../../migrations/0015_vouchers.sql', import.meta.url)

describe('voucher store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'voucher-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }

    for (const migrationUrl of [membershipMigrationUrl, voucherMigrationUrl]) {
      const migration = (await readFile(migrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }

    await db.prepare(
      `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status, created_at, updated_at)
        VALUES ('member-1', 'member@example.co.za', 'Member', 'free', 'active', ?, ?)`,
    ).bind('2026-07-16T09:00:00.000Z', '2026-07-16T09:00:00.000Z').run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('stores multiple voucher IDs for the same product as separate rows', async () => {
    const one = voucher({ externalId: 'ONE' })
    const two = voucher({ externalId: 'TWO', benefitText: 'Save R20' })

    await upsertVouchers(env, {
      candidates: [one, two],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    const rows = await listActiveVouchers(env, { now: '2026-07-16T11:00:00.000Z' })
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.externalId)).toEqual(['ONE', 'TWO'])
  })

  it('records written counts inside the atomic D1 batch', async () => {
    const guardedDb = new Proxy(db, {
      get(target, property) {
        if (property === 'prepare') {
          return (sql: string) => {
            if (sql.startsWith('UPDATE voucher_source_runs SET written_count')) {
              throw new Error('post-batch audit mutation is not atomic')
            }
            return target.prepare(sql)
          }
        }
        const value = target[property as keyof D1Database]
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const result = await upsertVouchers({ DB: guardedDb }, {
      candidates: [voucher()],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    await expect(db.prepare(
      'SELECT written_count FROM voucher_source_runs WHERE id = ?',
    ).bind(result.runId).first<{ written_count: number }>()).resolves.toEqual({ written_count: 1 })
  })

  it('stores and hashes only visibly public reusable codes', async () => {
    const publicVoucher = voucher({
      code: 'SAVE25',
      externalId: 'PUBLIC',
      publicReusable: true,
      redemptionMode: 'code',
      voucherKind: 'public_code',
    })
    const accountVoucher = voucher({
      code: 'SECRET123',
      externalId: 'PRIVATE',
      publicReusable: false,
    })

    await upsertVouchers(env, {
      candidates: [publicVoucher, accountVoucher],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    const rows = await db.prepare(
      'SELECT external_voucher_id, public_code, code_hash FROM vouchers ORDER BY external_voucher_id',
    ).all<{ code_hash: string | null; external_voucher_id: string; public_code: string | null }>()

    expect(rows.results).toEqual([
      { code_hash: null, external_voucher_id: 'PRIVATE', public_code: null },
      {
        code_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        external_voucher_id: 'PUBLIC',
        public_code: 'SAVE25',
      },
    ])
  })

  it('gives an undated voucher a short freshness window', async () => {
    await upsertVouchers(env, {
      candidates: [voucher()],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    const row = await db.prepare('SELECT expires_at FROM vouchers LIMIT 1')
      .first<{ expires_at: string }>()

    expect(row?.expires_at).toBe('2026-07-16T22:00:00.000Z')
  })

  it('does not list a voucher before its official validity window starts', async () => {
    await upsertVouchers(env, {
      candidates: [voucher({ validFrom: '2026-07-18', validTo: '2026-07-20' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    await expect(listActiveVouchers(env, { now: '2026-07-17T12:00:00.000Z' }))
      .resolves.toEqual([])
    await expect(listActiveVouchers(env, { now: '2026-07-18T12:00:00.000Z' }))
      .resolves.toHaveLength(1)
  })

  it('rejects impossible date-only validity values', async () => {
    await expect(upsertVouchers(env, {
      candidates: [voucher({
        capturedAt: '2026-01-01T10:00:00.000Z',
        validFrom: '2026-02-31',
        validTo: '2026-03-05',
      })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })).rejects.toThrow(/validFrom.*valid date/)
  })

  it('rejects a validity window whose start is after its end', async () => {
    await expect(upsertVouchers(env, {
      candidates: [voucher({
        capturedAt: '2026-01-01T10:00:00.000Z',
        validFrom: '2026-03-06',
        validTo: '2026-03-05',
      })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })).rejects.toThrow(/validFrom.*validTo/)
  })

  it('requires reusable public vouchers to carry a visible code', async () => {
    await expect(upsertVouchers(env, {
      candidates: [voucher({
        code: undefined,
        publicReusable: true,
        redemptionMode: 'code',
        voucherKind: 'public_code',
      })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })).rejects.toThrow(/code/)
  })

  it('rejects non-HTTPS voucher URLs before storage', async () => {
    await expect(upsertVouchers(env, {
      candidates: [voucher({ sourceUrl: 'http://www.amazon.co.za/coupons' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })).rejects.toThrow(/HTTPS/)
  })

  it('rejects private-network voucher assets before storage', async () => {
    await expect(upsertVouchers(env, {
      candidates: [voucher({ imageUrl: 'https://127.0.0.1/voucher.jpg' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })).rejects.toThrow(/public/)
  })

  it('rejects off-site URLs for a known retailer before storage', async () => {
    await expect(upsertVouchers(env, {
      candidates: [voucher({ redemptionUrl: 'https://evil.example/redeem' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })).rejects.toThrow(/official retailer/)
  })

  it('claims a voucher idempotently for a signed-in member', async () => {
    const result = await upsertVouchers(env, {
      // Far-future validity: claimVoucher checks expiry against the real clock,
      // so a fixed near-date here would make this test expire with the calendar.
      candidates: [voucher({ validTo: '2099-12-31' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })
    const voucherId = result.rowIds[0]

    await expect(claimVoucher(env, undefined, voucherId)).resolves.toEqual({
      claimed: false,
      issue: 'Sign in before saving a voucher.',
    })
    await expect(claimVoucher(env, 'member-1', voucherId)).resolves.toMatchObject({ claimed: true })
    await expect(claimVoucher(env, 'member-1', voucherId)).resolves.toMatchObject({ claimed: true })

    const rows = await listActiveVouchers(env, {
      accountId: 'member-1',
      now: '2026-07-16T11:00:00.000Z',
    })
    expect(rows[0].claimed).toBe(true)
    const count = await db.prepare('SELECT COUNT(*) AS total FROM member_voucher_claims')
      .first<{ total: number }>()
    expect(count?.total).toBe(1)
  })

  it('does not claim a voucher before its validity window starts', async () => {
    const result = await upsertVouchers(env, {
      candidates: [voucher({ validFrom: '2099-07-18', validTo: '2099-07-20' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    await expect(claimVoucher(env, 'member-1', result.rowIds[0])).resolves.toEqual({
      claimed: false,
      issue: 'Voucher is no longer active.',
    })
  })

  it('does not overwrite newer voucher evidence with a stale capture', async () => {
    await upsertVouchers(env, {
      candidates: [voucher({ benefitText: 'Save R40', capturedAt: '2026-07-16T12:00:00.000Z' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })
    await upsertVouchers(env, {
      candidates: [voucher({ benefitText: 'Save R10', capturedAt: '2026-07-16T10:00:00.000Z' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    const row = await db.prepare('SELECT benefit_text, captured_at FROM vouchers LIMIT 1')
      .first<{ benefit_text: string; captured_at: string }>()
    expect(row).toEqual({
      benefit_text: 'Save R40',
      captured_at: '2026-07-16T12:00:00.000Z',
    })
  })

  it('expires ended vouchers and omits them from active reads', async () => {
    await upsertVouchers(env, {
      candidates: [voucher({ validTo: '2026-07-16' })],
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
    })

    await expect(expireVouchers(env, '2026-07-17T00:00:00.000Z')).resolves.toBe(1)
    await expect(listActiveVouchers(env, { now: '2026-07-17T00:00:00.000Z' })).resolves.toEqual([])
  })

  it('round-trips voucher source cursor variants without mixing sources', async () => {
    await writeVoucherSourceCursor(env, 'amazon-za::vouchers', {
      kind: 'token',
      token: '{"offset":100}',
    })
    await writeVoucherSourceCursor(env, 'example-market::vouchers', { kind: 'page', page: 4 })

    await expect(readVoucherSourceCursor(env, 'amazon-za::vouchers')).resolves.toEqual({
      kind: 'token',
      token: '{"offset":100}',
    })
    await expect(readVoucherSourceCursor(env, 'example-market::vouchers')).resolves.toEqual({
      kind: 'page',
      page: 4,
    })
    await expect(readVoucherSourceCursor(env, 'missing::vouchers')).resolves.toBeUndefined()
  })
})

function voucher(overrides: Partial<VoucherCandidate> = {}): VoucherCandidate {
  return {
    accountRequired: true,
    benefitText: 'You pay R112.50 with voucher',
    capturedAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Official Amazon voucher evidence.',
    externalId: 'A13E9H0R6NENRV',
    imageUrl: 'https://m.media-amazon.com/images/I/71hub.jpg',
    productId: 'B0H3LWJJBR',
    productTitle: 'USB C Hub',
    publicReusable: false,
    redemptionMode: 'clip',
    redemptionUrl: 'https://www.amazon.co.za/item/dp/B0H3LWJJBR',
    retailerId: 'amazon-za',
    sourceUrl: 'https://www.amazon.co.za/coupons',
    title: 'USB C Hub',
    voucherKind: 'product_coupon',
    ...overrides,
  }
}

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
