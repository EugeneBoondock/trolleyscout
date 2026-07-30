import { describe, expect, it } from 'vitest'
import type { StoredDealItem } from './dealItemStore'
import {
  buildGroceryPlan,
  parseGroceryPlanRequest,
} from './groceryPlanner'

function deal(
  id: string,
  title: string,
  retailerId: string,
  priceCents: number,
  overrides: Partial<StoredDealItem> = {},
): StoredDealItem {
  return {
    capturedAt: '2026-07-30T08:00:00.000Z',
    contentFingerprint: `fingerprint-${id}`,
    countryCode: 'ZA',
    createdAt: '2026-07-30T08:00:00.000Z',
    currencyCode: 'ZAR',
    evidenceText: 'Current public promotion',
    expiresAt: '2026-08-02T22:00:00.000Z',
    id,
    lastSeenAt: '2026-07-30T08:00:00.000Z',
    priceCents,
    productId: id,
    productUrl: `https://${retailerId}.example.test/${id}`,
    promotionId: `promo-${id}`,
    retailerId,
    scope: { type: 'online' },
    sourceKey: `${retailerId}::specials`,
    sourceKind: 'structured',
    sourceUrl: `https://${retailerId}.example.test/specials`,
    status: 'active',
    title,
    updatedAt: '2026-07-30T08:00:00.000Z',
    ...overrides,
  }
}

describe('parseGroceryPlanRequest', () => {
  it('recognizes natural grocery planning requests and shopper constraints', () => {
    expect(parseGroceryPlanRequest(
      'Create a grocery list for the cheapest vegan food for a family of 4 under R800',
    )).toMatchObject({
      budgetCents: 80_000,
      householdSize: 4,
      kind: 'vegan',
      maxStores: 3,
    })
  })

  it('allows more than three stores only when the shopper explicitly asks', () => {
    expect(parseGroceryPlanRequest('Build a grocery list using up to 5 stores'))
      .toMatchObject({ maxStores: 5 })
  })
})

describe('buildGroceryPlan', () => {
  it('prefers one store that covers the practical list', () => {
    expect(parseGroceryPlanRequest('Create a grocery list for vegetables'))
      .toMatchObject({
        budgetCents: undefined,
        kind: 'vegetables',
        maxStores: 3,
      })
    const plan = buildGroceryPlan(
      'Create a grocery list for vegetables',
      [
        deal('a-tomato', 'Fresh tomatoes 1kg', 'market-a', 2500),
        deal('a-potato', 'Potatoes 2kg', 'market-a', 4000),
        deal('a-carrot', 'Carrots 1kg', 'market-a', 2200),
        deal('a-onion', 'Onions 1kg', 'market-a', 1900),
        deal('b-tomato', 'Fresh tomatoes 1kg', 'market-b', 1500),
        deal('c-potato', 'Potatoes 2kg', 'market-c', 2000),
        deal('d-carrot', 'Carrots 1kg', 'market-d', 1200),
      ],
      'ZAR',
    )

    expect(plan.items.map((item) => item.id)).toEqual([
      'a-tomato',
      'a-potato',
      'a-carrot',
      'a-onion',
    ])
    expect(new Set(plan.items.map((item) => item.retailerId))).toEqual(
      new Set(['market-a']),
    )
    expect(plan.storeCount).toBe(1)
  })

  it('never uses more than three stores by default and reports missing groups', () => {
    const plan = buildGroceryPlan(
      'Make a grocery list for vegetables',
      [
        deal('tomato', 'Tomatoes 1kg', 'tomato-shop', 1200),
        deal('potato', 'Potatoes 2kg', 'potato-shop', 1800),
        deal('carrot', 'Carrots 1kg', 'carrot-shop', 1000),
        deal('onion', 'Onions 1kg', 'onion-shop', 900),
      ],
      'ZAR',
    )

    expect(plan.storeCount).toBeLessThanOrEqual(3)
    expect(plan.missingItems.length).toBeGreaterThan(0)
  })

  it('keeps vegan plans free of meat, dairy, and egg products', () => {
    const plan = buildGroceryPlan(
      'Create a grocery list for the cheapest vegan food',
      [
        deal('rice', 'Long grain rice 2kg', 'value-market', 4500),
        deal('beans', 'Red kidney beans 400g', 'value-market', 1800),
        deal('spinach', 'Fresh spinach bunch', 'value-market', 1600),
        deal('tofu', 'Firm tofu 300g', 'value-market', 3800),
        deal('milk', 'Full cream dairy milk 2L', 'value-market', 3200),
        deal('eggs', 'Large eggs 18 pack', 'value-market', 5500),
        deal('chicken', 'Chicken breast fillets 1kg', 'value-market', 9000),
      ],
      'ZAR',
    )

    expect(plan.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['rice', 'beans', 'spinach', 'tofu']),
    )
    expect(plan.items.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(['milk', 'eggs', 'chicken']),
    )
  })

  it('rejects unavailable, invalid-price, and duplicate variants', () => {
    const plan = buildGroceryPlan(
      'Create a grocery list for meat',
      [
        deal('chicken-live', 'Chicken breast 1kg', 'butcher', 8000),
        deal('chicken-duplicate', 'Chicken breast 1 kg', 'butcher', 8000),
        deal('beef-sold', 'Beef mince 1kg', 'butcher', 7000, { soldOut: true }),
        deal('pork-invalid', 'Pork chops 1kg', 'butcher', 0),
      ],
      'ZAR',
    )

    expect(plan.items.map((item) => item.id)).toEqual(['chicken-live'])
    expect(plan.missingItems).toEqual(expect.arrayContaining(['Beef or mince', 'Pork']))
  })
})
