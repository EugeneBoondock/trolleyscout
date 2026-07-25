import { describe, expect, it } from 'vitest'
import {
  FLIPP_US_CHAINS,
  buildFlippFlyerItemsUrl,
  buildFlippFlyerListUrl,
  buildFlippItemUrl,
  decodeFlippCursor,
  encodeFlippCursor,
  isFlippFlyerListPayload,
  parseFlippFlyerItems,
  parseFlippFlyerList,
} from './flipp'

const CAPTURED_AT = '2026-07-25T10:00:00.000Z'

const walmart = FLIPP_US_CHAINS.find((entry) => entry.name === 'Walmart')!
const publix = FLIPP_US_CHAINS.find((entry) => entry.name === 'Publix')!

function context() {
  return { capturedAt: CAPTURED_AT, sourceUrl: 'https://flipp.com/en-us/weekly_ads' }
}

function itemsOptions(overrides: Partial<Parameters<typeof parseFlippFlyerItems>[2]> = {}) {
  return { chain: walmart, flyerId: '8043596', postalCode: '30301', ...overrides }
}

// Shaped exactly as Flipp answered when this was built.
function flyerItem(overrides: Record<string, unknown> = {}) {
  return {
    cutout_image_url: 'http://f.wishabi.net/page_items/427670023/1784353352/extra_large.jpg',
    discount: 36,
    id: 1028070420,
    name: 'Minnie Mouse Toddler Girls Graphic Tee and Bike Shorts Set',
    price: '7.0',
    valid_from: '2026-07-22T00:00:00-04:00',
    valid_to: '2026-07-28T23:59:59-04:00',
    ...overrides,
  }
}

describe('parseFlippFlyerList', () => {
  const payload = {
    flyers: [
      { id: 8043596, merchant: 'Walmart', valid_to: '2026-07-28T23:59:59-04:00' },
      { id: 8021961, merchant: 'Publix', valid_to: '2026-07-28T23:59:59-04:00' },
      { id: 8021962, merchant: 'Publix Liquors', valid_to: '2026-07-28T23:59:59-04:00' },
    ],
  }

  it('returns only the flyers belonging to the chain asked for', () => {
    expect(parseFlippFlyerList(payload, walmart, CAPTURED_AT)).toEqual(['8043596'])
  })

  it('does not let one chain swallow a differently named shop', () => {
    // "Publix Liquors" is a separate shop with a separate ad, so a substring
    // match would file its prices under the supermarket.
    expect(parseFlippFlyerList(payload, publix, CAPTURED_AT)).toEqual(['8021961'])
  })

  it('skips a flyer whose week has already ended', () => {
    const stale = {
      flyers: [{ id: 1, merchant: 'Walmart', valid_to: '2026-07-01T23:59:59-04:00' }],
    }
    expect(parseFlippFlyerList(stale, walmart, CAPTURED_AT)).toEqual([])
  })

  it('keeps a flyer that states no end date, since its items carry their own', () => {
    const undated = { flyers: [{ id: 42, merchant: 'Walmart' }] }
    expect(parseFlippFlyerList(undated, walmart, CAPTURED_AT)).toEqual(['42'])
  })

  it('rejects a payload that is not a flyer list', () => {
    expect(() => parseFlippFlyerList({}, walmart, CAPTURED_AT)).toThrow(TypeError)
    expect(isFlippFlyerListPayload({ items: [] })).toBe(false)
    expect(isFlippFlyerListPayload({ flyers: [] })).toBe(true)
  })
})

describe('parseFlippFlyerItems', () => {
  it('reads a flyer item into a priced deal', () => {
    const page = parseFlippFlyerItems({ items: [flyerItem()] }, context(), itemsOptions())

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      priceCents: 700,
      productId: '1028070420',
      promotionId: 'flipp-flyer-8043596',
      retailerId: 'walmart',
      savingText: '36% off',
      sourceKind: 'catalogue',
      title: 'Minnie Mouse Toddler Girls Graphic Tee and Bike Shorts Set',
    })
  })

  it('reads "7.0" as seven dollars, not seventy', () => {
    // The shared rand parser reads a dot with one trailing digit as a
    // thousands separator, which would have made this $70.00.
    const page = parseFlippFlyerItems({ items: [flyerItem({ price: '7.0' })] }, context(), itemsOptions())
    expect(page.candidates[0].priceCents).toBe(700)
  })

  it.each([
    ['2.85', 285],
    ['219.99', 21_999],
    ['9.0', 900],
    ['1.79', 179],
  ])('reads %s as %i cents', (price, cents) => {
    const page = parseFlippFlyerItems({ items: [flyerItem({ price })] }, context(), itemsOptions())
    expect(page.candidates[0].priceCents).toBe(cents)
  })

  it('never claims a previous price, because the flyer only rounds the percentage', () => {
    const page = parseFlippFlyerItems({ items: [flyerItem()] }, context(), itemsOptions())
    expect(page.candidates[0].previousPriceCents).toBeUndefined()
  })

  it('drops an item priced as a multi-buy rather than halving it', () => {
    const page = parseFlippFlyerItems(
      { items: [flyerItem({ price: '2/$5' })] },
      context(),
      itemsOptions(),
    )
    expect(page.candidates).toEqual([])
  })

  it.each([['0'], [''], ['-3']])('drops an item priced %s', (price) => {
    const page = parseFlippFlyerItems({ items: [flyerItem({ price })] }, context(), itemsOptions())
    expect(page.candidates).toEqual([])
  })

  it('drops an item whose week has not started yet', () => {
    // Weekly ads are published ahead of the week they run.
    const page = parseFlippFlyerItems(
      {
        items: [flyerItem({
          valid_from: '2026-07-29T00:00:00-04:00',
          valid_to: '2026-08-04T23:59:59-04:00',
        })],
      },
      context(),
      itemsOptions(),
    )
    expect(page.candidates).toEqual([])
  })

  it('drops an item whose week has ended', () => {
    const page = parseFlippFlyerItems(
      {
        items: [flyerItem({
          valid_from: '2026-07-01T00:00:00-04:00',
          valid_to: '2026-07-07T23:59:59-04:00',
        })],
      },
      context(),
      itemsOptions(),
    )
    expect(page.candidates).toEqual([])
  })

  it('drops an unnamed item, since a price with no product is not a deal', () => {
    const page = parseFlippFlyerItems(
      { items: [flyerItem({ name: null })] },
      context(),
      itemsOptions(),
    )
    expect(page.candidates).toEqual([])
  })

  it('omits the saving when the flyer states no discount', () => {
    const page = parseFlippFlyerItems(
      { items: [flyerItem({ discount: null })] },
      context(),
      itemsOptions(),
    )
    expect(page.candidates[0].savingText).toBeUndefined()
  })

  it('ignores a discount that is not a real percentage', () => {
    for (const discount of [0, 100, 140, 'half']) {
      const page = parseFlippFlyerItems(
        { items: [flyerItem({ discount })] },
        context(),
        itemsOptions(),
      )
      expect(page.candidates[0].savingText).toBeUndefined()
    }
  })

  it('serves the image over https so it is not blocked as mixed content', () => {
    const page = parseFlippFlyerItems({ items: [flyerItem()] }, context(), itemsOptions())
    expect(page.candidates[0].imageUrl).toMatch(/^https:\/\/f\.wishabi\.net\//)
  })

  it('scopes the deal to the metro whose ad it is', () => {
    const page = parseFlippFlyerItems({ items: [flyerItem()] }, context(), itemsOptions())
    expect(page.candidates[0].scope).toEqual({ regionIds: ['30301'], type: 'province' })
  })

  it('keeps one row per item when a flyer repeats it', () => {
    const page = parseFlippFlyerItems(
      { items: [flyerItem(), flyerItem()] },
      context(),
      itemsOptions(),
    )
    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a payload that is not a flyer', () => {
    expect(() => parseFlippFlyerItems({}, context(), itemsOptions())).toThrow(TypeError)
  })
})

describe('flipp urls', () => {
  it('builds the item link Flipp itself resolves', () => {
    expect(buildFlippItemUrl('1028070313', 'Walmart', '30301')).toBe(
      'https://flipp.com/en-us/item/1028070313-walmart-flyer?postal_code=30301',
    )
  })

  it('slugs a chain whose name is not one word', () => {
    expect(buildFlippItemUrl('1', "Sam's Club", '10001')).toBe(
      'https://flipp.com/en-us/item/1-sam-s-club-flyer?postal_code=10001',
    )
  })

  it('asks each endpoint in US English for the given postal code', () => {
    expect(buildFlippFlyerListUrl('30301')).toContain('postal_code=30301')
    expect(buildFlippFlyerListUrl('30301')).toContain('locale=en-us')
    expect(buildFlippFlyerItemsUrl('8043596', '30301')).toBe(
      'https://backflipp.wishabi.com/flipp/flyers/8043596?locale=en-us&postal_code=30301',
    )
  })
})

describe('flipp cursor', () => {
  it('survives a round trip', () => {
    const plan = { flyerIds: ['1', '2'], flyerIndex: 1, postalIndex: 2 }
    expect(decodeFlippCursor(encodeFlippCursor(plan))).toEqual(plan)
  })

  it.each([['not json'], ['{}'], ['[]'], ['{"flyerIds":"x"}']])(
    'returns nothing for %s so the source restarts cleanly',
    (token) => {
      expect(decodeFlippCursor(token)).toBeUndefined()
    },
  )
})

describe('FLIPP_US_CHAINS', () => {
  it('gives every chain at least one metro to look in', () => {
    for (const entry of FLIPP_US_CHAINS) {
      expect(entry.postalCodes.length).toBeGreaterThan(0)
      expect(entry.merchantNames.length).toBeGreaterThan(0)
    }
  })

  it('does not register the same shop twice', () => {
    const ids = FLIPP_US_CHAINS.map((entry) => entry.retailerId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
