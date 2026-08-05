import { describe, expect, it } from 'vitest'
import { normalizeCode } from './voucherCodeStore'
import {
  parseAdmitadCoupons,
  parseAwinPromotions,
} from './affiliateVoucherFeeds'

describe('normalizeCode', () => {
  it('accepts a code however the shopper typed it', () => {
    expect(normalizeCode('  save20 ')).toBe('SAVE20')
    expect(normalizeCode('BLACK-FRIDAY')).toBe('BLACK-FRIDAY')
    expect(normalizeCode('we l come')).toBe('WELCOME')
  })

  it('refuses what is plainly not a code', () => {
    // A sentence pasted into the box, a code too short to be real, and the
    // long opaque strings that are personal single-use links.
    expect(normalizeCode('use this at checkout for 20% off')).toBeUndefined()
    expect(normalizeCode('AB')).toBeUndefined()
    expect(normalizeCode('a'.repeat(40))).toBeUndefined()
    expect(normalizeCode('')).toBeUndefined()
  })
})

describe('Awin promotions feed', () => {
  it('keeps promotions that carry a code and names the network', () => {
    const drafts = parseAwinPromotions({
      data: [
        {
          advertiser: { name: 'Superbalist' },
          description: '20% off your first order',
          endDate: '2026-09-30T23:59:59Z',
          regions: { list: [{ countryCode: 'ZA', name: 'South Africa' }] },
          terms: 'New customers only.',
          urlTracking: 'https://www.awin1.com/cread.php?id=1',
          voucher: { code: 'FIRST20' },
        },
        // A promotion with no code is a sale link, not something to paste.
        {
          advertiser: { name: 'Superbalist' },
          description: 'Mid-season sale',
          voucher: {},
        },
      ],
    })

    expect(drafts).toEqual([
      {
        benefitText: '20% off your first order',
        code: 'FIRST20',
        countryCode: 'ZA',
        retailerId: 'superbalist',
        source: 'affiliate:awin',
        sourceUrl: 'https://www.awin1.com/cread.php?id=1',
        termsText: 'New customers only.',
        validTo: '2026-09-30T23:59:59Z',
      },
    ])
  })

  it('survives a payload in an unexpected shape', () => {
    expect(parseAwinPromotions(undefined)).toEqual([])
    expect(parseAwinPromotions({ data: 'nonsense' })).toEqual([])
  })
})

describe('Admitad coupons feed', () => {
  it('keeps only coupons with a promo code', () => {
    const drafts = parseAdmitadCoupons({
      results: [
        {
          campaign: { name: 'Takealot' },
          date_end: '2026-08-31',
          description: 'Selected electronics.',
          goto_link: 'https://ad.admitad.com/g/abc/',
          name: 'R100 off electronics',
          promocode: 'TECH100',
          regions: [{ country_code: 'ZA' }],
        },
        { campaign: { name: 'Takealot' }, name: 'Sale', promocode: '' },
      ],
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      code: 'TECH100',
      retailerId: 'takealot',
      source: 'affiliate:admitad',
    })
  })

  it('turns a retailer name into the id the rest of the app uses', () => {
    const [draft] = parseAdmitadCoupons({
      results: [
        {
          campaign: { name: 'Pick n Pay' },
          name: 'R50 off',
          promocode: 'PNP50',
          regions: [{ country_code: 'ZA' }],
        },
      ],
    })

    expect(draft.retailerId).toBe('pick-n-pay')
  })
})
