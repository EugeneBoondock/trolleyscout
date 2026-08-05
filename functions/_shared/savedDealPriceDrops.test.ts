import { describe, expect, it } from 'vitest'

import type { TrolleyScoutEnv } from './env'
import { listSavedDealPriceDrops, parsePriceCents } from './savedDealPriceDrops'

function envWithRows(rows: unknown[]): TrolleyScoutEnv {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: rows }),
        }),
      }),
    },
  } as unknown as TrolleyScoutEnv
}

describe('parsePriceCents', () => {
  it('reads the local formats shoppers actually see', () => {
    expect(parsePriceCents('R 123,45')).toBe(12345)
    expect(parsePriceCents('R123.45')).toBe(12345)
    expect(parsePriceCents('R1 299.00')).toBe(129900)
    expect(parsePriceCents('USD 12.50')).toBe(1250)
    expect(parsePriceCents('R89')).toBe(8900)
    expect(parsePriceCents('Save big!')).toBeNull()
    expect(parsePriceCents(null)).toBeNull()
  })
})

describe('listSavedDealPriceDrops', () => {
  it('keeps only drops worth interrupting for, biggest first', async () => {
    const drops = await listSavedDealPriceDrops(envWithRows([
      // R100 -> R80: 20% drop, kept.
      { current_price_cents: 8000, id: 'big', price_text: 'R100.00', retailer_name: 'shoprite', title: 'Big drop' },
      // R100 -> R99: 1%, below both thresholds, ignored.
      { current_price_cents: 9900, id: 'tiny', price_text: 'R100.00', retailer_name: 'shoprite', title: 'Tiny drop' },
      // R500 -> R494: R6 beats the flat threshold even at ~1%.
      { current_price_cents: 49400, id: 'flat', price_text: 'R500.00', retailer_name: 'checkers', title: 'Flat drop' },
      // Price went UP: never a drop.
      { current_price_cents: 12000, id: 'rise', price_text: 'R100.00', retailer_name: 'pnp', title: 'Rise' },
      // Saved price unparseable: skipped, not crashed.
      { current_price_cents: 5000, id: 'weird', price_text: 'two for one', retailer_name: 'pnp', title: 'Weird' },
    ]), 'member-1')

    expect(drops.map((drop) => drop.id)).toEqual(['big', 'flat'])
    expect(drops[0]).toMatchObject({
      currentPriceCents: 8000,
      savedPriceCents: 10000,
      title: 'Big drop',
    })
  })

  it('returns nothing without a database', async () => {
    expect(await listSavedDealPriceDrops(
      {} as TrolleyScoutEnv,
      'member-1',
    )).toEqual([])
  })
})
