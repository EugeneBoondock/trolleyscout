import { describe, expect, it } from 'vitest'
import {
  buildTmpnpSectionsUrl,
  buildTmpnpSpecialsUrl,
  parseTmpnpSectionDeals,
  parseTmpnpSpecialDeals,
} from './tmpnpDeals'

// 2026-07-24, matching the browser reconnaissance date.
const NOW = Date.parse('2026-07-24T00:00:00Z')

describe('buildTmpnpSectionsUrl', () => {
  it('points at the custom commerce API, not the bot-walled storefront', () => {
    expect(buildTmpnpSectionsUrl()).toBe('https://api.tmpnponline.co.zw/api/v1/products/sections')
  })
})

describe('TM Pick n Pay specials endpoint', () => {
  it('builds a bounded page URL', () => {
    expect(buildTmpnpSpecialsUrl(3)).toBe(
      'https://api.tmpnponline.co.zw/api/v1/products/search-product-on-sale?page=3',
    )
    expect(buildTmpnpSpecialsUrl(-20)).toContain('page=1')
  })

  it('uses the same current and former prices shown by the official specials page', () => {
    const payload = {
      current_page: 1,
      last_page: 22,
      data: [
        {
          id: 689,
          name: 'Arenel Butter Cookies 500g',
          price: '1.20',
          sale_price: 1.4,
          on_sale: 1,
          slug: 'arenel-butter-cookies-500g',
          image: '2022/03/arenel.png',
          start_sale_date: '2026-07-20',
          end_sale_date: '2026-08-02',
        },
      ],
    }

    expect(parseTmpnpSpecialDeals(payload, NOW)).toEqual([
      {
        currencyCode: 'USD',
        imageUrl: 'https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/2022/03/arenel.png',
        previousPriceCents: 140,
        priceCents: 120,
        productUrl: 'https://tmpnponline.co.zw/products/arenel-butter-cookies-500g',
        title: 'Arenel Butter Cookies 500g',
        validFrom: '2026-07-20',
        validTo: '2026-08-02',
      },
    ])
  })

  it('rejects inverted, upcoming, expired, and malformed specials', () => {
    const payload = {
      data: [
        { name: 'Inverted', price: '2.00', sale_price: 1.5 },
        {
          name: 'Upcoming',
          price: '1.00',
          sale_price: 2,
          start_sale_date: '2026-08-01',
        },
        {
          name: 'Expired',
          price: '1.00',
          sale_price: 2,
          end_sale_date: '2026-07-01',
        },
        null,
      ],
    }

    expect(parseTmpnpSpecialDeals(payload, NOW)).toEqual([])
    expect(parseTmpnpSpecialDeals({ data: 'invalid' }, NOW)).toEqual([])
  })
})

describe('parseTmpnpSectionDeals', () => {
  it('emits a deal only for a real, in-date discount in USD', () => {
    const payload = {
      biggest_discounts: [
        {
          id: 1231,
          name: 'Huletts Brown Sugar 2kg',
          price: '2.85',
          sale_price: 2.5,
          slug: 'huletts-brown-sugar-2kg',
          image: '2022/02/Huletts-Brown-Sugar-2kg.png',
          start_sale_date: '2026-07-20',
          end_sale_date: '2026-08-02',
        },
      ],
    }

    expect(parseTmpnpSectionDeals(payload, NOW)).toEqual([
      {
        currencyCode: 'USD',
        imageUrl:
          'https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/2022/02/Huletts-Brown-Sugar-2kg.png',
        previousPriceCents: 285,
        priceCents: 250,
        productUrl: 'https://tmpnponline.co.zw/products/huletts-brown-sugar-2kg',
        title: 'Huletts Brown Sugar 2kg',
        validFrom: '2026-07-20',
        validTo: '2026-08-02',
      },
    ])
  })

  it('rejects the sale_price:0 "no special" sentinel', () => {
    const payload = {
      biggest_discounts: [
        { name: 'SCOTCH EGG EACH', price: '1.00', sale_price: 0, slug: 'scotch-egg-each' },
      ],
    }
    expect(parseTmpnpSectionDeals(payload, NOW)).toEqual([])
  })

  it('rejects a data-entry slip where sale_price is above the regular price', () => {
    // Seen live: on_sale=1 but sale_price (2.90) > price (2.85).
    const payload = {
      trending: [
        { name: 'Huletts Brown Sugar 2kg', price: '2.85', sale_price: 2.9, on_sale: 1, slug: 'h' },
      ],
    }
    expect(parseTmpnpSectionDeals(payload, NOW)).toEqual([])
  })

  it('rejects a special whose window has already closed', () => {
    const payload = {
      biggest_discounts: [
        {
          name: 'Expired Special',
          price: '10.00',
          sale_price: 7.5,
          slug: 'expired',
          end_sale_date: '2026-07-01',
        },
      ],
    }
    expect(parseTmpnpSectionDeals(payload, NOW)).toEqual([])
  })

  it('keeps an undated discount (no window is a permanent price cut)', () => {
    const payload = {
      new_arrivals: [{ name: 'No Dates', price: '10.00', sale_price: 7.5, slug: 'no-dates' }],
    }
    const deals = parseTmpnpSectionDeals(payload, NOW)
    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({ priceCents: 750, previousPriceCents: 1000, validTo: undefined })
  })

  it('deduplicates a product that appears in several curated sections', () => {
    const item = { name: 'Rice 2kg', price: '5.00', sale_price: 3.99, slug: 'rice-2kg' }
    const payload = { top_sellers: [item], trending: [item], biggest_discounts: [item] }
    expect(parseTmpnpSectionDeals(payload, NOW)).toHaveLength(1)
  })

  it('passes an already-absolute image URL through unchanged', () => {
    const payload = {
      biggest_discounts: [
        {
          name: 'Absolute Image',
          price: '5.00',
          sale_price: 3.0,
          slug: 'abs',
          image: 'https://example.com/x.png',
        },
      ],
    }
    expect(parseTmpnpSectionDeals(payload, NOW)[0]?.imageUrl).toBe('https://example.com/x.png')
  })

  it('ignores non-array sections and malformed rows', () => {
    const payload = {
      meta: { count: 3 },
      top_sellers: [null, 'nope', { name: '', price: '1.00', sale_price: 0.5 }],
    }
    expect(parseTmpnpSectionDeals(payload, NOW)).toEqual([])
  })

  it('returns nothing for a non-object payload', () => {
    expect(parseTmpnpSectionDeals(null, NOW)).toEqual([])
    expect(parseTmpnpSectionDeals('[]', NOW)).toEqual([])
  })

  it('honours the deal limit', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `Item ${i}`,
      price: '10.00',
      sale_price: 5.0,
      slug: `item-${i}`,
    }))
    expect(parseTmpnpSectionDeals({ biggest_discounts: many }, NOW, 5)).toHaveLength(5)
  })
})
