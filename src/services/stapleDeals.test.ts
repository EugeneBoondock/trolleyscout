import { describe, expect, test } from 'vitest'
import type { DiscoveredDeal } from '../types'
import { isStapleTitle, pickStapleDeals } from './stapleDeals'

function deal(overrides: Partial<DiscoveredDeal>): DiscoveredDeal {
  return {
    capturedAt: '2026-07-15T10:00:00.000Z',
    evidenceText: 'evidence',
    id: 'deal-1',
    priceText: 'R10.00',
    productUrl: 'https://example.com/p/1',
    retailerId: 'pick-n-pay',
    retailerName: 'Pick n Pay',
    sourceLabel: 'On promotion',
    sourceUrl: 'https://example.com',
    title: 'Item',
    ...overrides,
  }
}

describe('isStapleTitle', () => {
  test('matches staple foods as whole words', () => {
    expect(isStapleTitle('Tastic Rice 2kg')).toBe(true)
    expect(isStapleTitle('PnP UHT Full Cream Milk 6 x 1L')).toBe(true)
    expect(isStapleTitle('Koo Baked Beans In Tomato Sauce 400g')).toBe(true)
    expect(isStapleTitle('Sunflower Oil 2L')).toBe(true)
  })

  test('does not match lookalike words or non-staples', () => {
    expect(isStapleTitle('Half Price Gaming Mouse')).toBe(false)
    expect(isStapleTitle('Yardley Stayfast Pressed Powder')).toBe(false)
    expect(isStapleTitle('Teapot ornament')).toBe(false)
  })
})

describe('pickStapleDeals', () => {
  test('prefers rows with a visible saving and dedupes titles', () => {
    const deals = [
      deal({ id: 'a', title: 'White Sugar 2.5kg' }),
      deal({ id: 'b', previousPriceText: 'R39.99', title: 'Tastic Rice 2kg' }),
      deal({ id: 'c', previousPriceText: 'R104.99', title: 'Full Cream Milk 6 x 1L' }),
      deal({ id: 'd', title: 'Tastic Rice 2kg' }),
      deal({ id: 'e', title: 'Gaming Mouse' }),
    ]

    const picked = pickStapleDeals(deals, 3)

    expect(picked.map((row) => row.id)).toEqual(['b', 'c', 'a'])
  })

  test('returns empty when no staples are present', () => {
    expect(pickStapleDeals([deal({ title: 'HDMI Cable' })])).toEqual([])
  })
})
