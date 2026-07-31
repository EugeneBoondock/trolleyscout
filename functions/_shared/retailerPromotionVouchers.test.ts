import { describe, expect, it } from 'vitest'
import {
  STAPLE_SWEEP_TERMS,
  parsePromotionVouchers,
  termsForRun,
} from './retailerPromotionVouchers'
import { normalizeVoucher } from './voucherStore'

const CAPTURED_AT = '2026-07-31T08:00:00.000Z'

describe('every parsed voucher clears the store gate', () => {
  // The first production sweep failed with "code is required for a reusable
  // public voucher": the parser's candidates had never been run through the
  // store's own validation before they met it live. Now they are.
  it('accepts a Pick n Pay loyalty offer end to end', async () => {
    const vouchers = parsePromotionVouchers('pick-n-pay', {
      products: [{
        name: 'PnP Full Cream Fresh Milk 2L',
        url: '/pnp-full-cream-fresh-milk-2l/p/000000000000357781_EA',
        potentialPromotions: [{
          code: 'SCRIPT20260625001408-3000679727',
          endDate: '2099-10-06T21:59:59+0000',
          promotionDisplayType: 'SMART_SHOPPER',
          promotionTextMessage: 'Combo For R49.99',
          startDate: '2026-06-24T22:00:00+0000',
        }],
      }],
    }, CAPTURED_AT)

    expect(vouchers).toHaveLength(1)
    await expect(normalizeVoucher(vouchers[0], 'pick-n-pay', 0)).resolves
      .toMatchObject({ publicReusable: false, redemptionMode: 'loyalty' })
  })

  it('accepts a Shoprite Group markdown end to end', async () => {
    const vouchers = parsePromotionVouchers('shoprite', {
      products: [{
        id: 'abc123',
        name: 'Darling Fresh Full Cream Milk Bottle 2L',
        oldPrice: 4299,
        price: 37.99,
        priceFactor: 100,
      }],
    }, CAPTURED_AT)

    expect(vouchers).toHaveLength(1)
    await expect(normalizeVoucher(vouchers[0], 'shoprite', 0)).resolves
      .toMatchObject({ accountRequired: true, publicReusable: false })
  })
})

describe('staying inside the Worker subrequest budget', () => {
  it('sweeps a slice of the basket per run, not the whole thing', () => {
    // One term is one subrequest, and a free-plan invocation gets fifty for
    // every lane it runs. Twenty terms across three retailers would be sixty.
    expect(termsForRun(STAPLE_SWEEP_TERMS, 0)).toHaveLength(6)
    expect(STAPLE_SWEEP_TERMS.length).toBeGreaterThan(6)
  })

  it('moves to the next slice on the next run', () => {
    expect(termsForRun(STAPLE_SWEEP_TERMS, 1))
      .not.toEqual(termsForRun(STAPLE_SWEEP_TERMS, 0))
  })

  it('covers the whole basket as the rotation comes round', () => {
    const covered = new Set<string>()
    for (let run = 0; run < 24; run += 1) {
      for (const term of termsForRun(STAPLE_SWEEP_TERMS, run)) covered.add(term)
    }
    expect([...covered].sort()).toEqual([...STAPLE_SWEEP_TERMS].sort())
  })

  it('wraps to a full slice rather than a short one at the end', () => {
    expect(termsForRun(['a', 'b', 'c', 'd', 'e'], 1, 3)).toEqual(['d', 'e', 'a'])
  })

  it('takes everything when the basket already fits', () => {
    expect(termsForRun(['a', 'b'], 7)).toEqual(['a', 'b'])
  })
})

describe('Pick n Pay Smart Shopper promotions', () => {
  const payload = {
    products: [
      {
        name: 'PnP Full Cream Fresh Milk 2L',
        url: '/pnp-full-cream-fresh-milk-2l/p/000000000000357781_EA',
        images: [{ url: '/media/milk.jpg' }],
        potentialPromotions: [{
          code: 'SCRIPT20260625001408-3000679727',
          endDate: '2026-10-06T21:59:59+0000',
          promotionDisplayType: 'SMART_SHOPPER',
          promotionTextMessage: 'Combo For R49.99',
          startDate: '2026-06-24T22:00:00+0000',
        }],
      },
      {
        name: 'PnP UHT Full Cream Milk 6 x 1L',
        url: '/pnp-uht-milk/p/2',
        potentialPromotions: [{
          code: 'SCRIPT20260729112341-3000700156',
          endDate: '2026-08-02T21:59:59+0000',
          promotionDisplayType: 'SAVE',
          promotionTextMessage: '2 For R190.00',
          startDate: '2026-07-29T22:00:00+0000',
        }],
      },
    ],
  }

  it('turns a loyalty promotion into a voucher the shopper can redeem', () => {
    const [smartShopper] = parsePromotionVouchers('pick-n-pay', payload, CAPTURED_AT)

    expect(smartShopper).toMatchObject({
      accountRequired: true,
      benefitText: 'Combo For R49.99',
      redemptionMode: 'loyalty',
      retailerId: 'pick-n-pay',
      title: 'PnP Full Cream Fresh Milk 2L',
      validTo: '2026-10-06T21:59:59.000Z',
      voucherKind: 'loyalty_offer',
    })
    expect(smartShopper.redemptionUrl).toBe(
      'https://www.pnp.co.za/pnp-full-cream-fresh-milk-2l/p/000000000000357781_EA',
    )
    expect(smartShopper.termsText).toContain('Scan your Smart Shopper card')
  })

  it('marks a till-level promotion as automatic, needing no card', () => {
    const vouchers = parsePromotionVouchers('pick-n-pay', payload, CAPTURED_AT)
    const multibuy = vouchers.find((voucher) => voucher.benefitText === '2 For R190.00')

    expect(multibuy).toMatchObject({ accountRequired: false, redemptionMode: 'automatic' })
    expect(multibuy?.termsText).toContain('applied automatically')
  })

  it('drops a promotion that has already ended', () => {
    const expired = parsePromotionVouchers('pick-n-pay', {
      products: [{
        name: 'Old offer',
        url: '/old/p/9',
        potentialPromotions: [{
          code: 'OLD-1',
          endDate: '2026-07-01T21:59:59+0000',
          promotionTextMessage: 'R10.00',
        }],
      }],
    }, CAPTURED_AT)

    expect(expired).toEqual([])
  })
})

describe('Shoprite Group Xtra Savings promotions', () => {
  it('reads a markdown through priceFactor rather than comparing raw fields', () => {
    // oldPrice is an integer in cents while price is already a decimal.
    // Comparing them raw reported "Was R3799.00, now R37.99" and flagged every
    // product in the catalogue as a promotion.
    const [voucher] = parsePromotionVouchers('shoprite', {
      products: [{
        id: 'abc123',
        name: 'Darling Fresh Full Cream Milk Bottle 2L',
        oldPrice: 4299,
        price: 37.99,
        priceFactor: 100,
      }],
    }, CAPTURED_AT)

    expect(voucher.benefitText).toBe('Was R42.99, now R37.99 — save R5.00')
    expect(voucher.redemptionUrl).toBe('https://www.shoprite.co.za/product/abc123')
  })

  it('does not call an unchanged price a promotion', () => {
    expect(parsePromotionVouchers('shoprite', {
      products: [{
        id: 'abc123',
        name: 'Crystal Valley Full Cream Milk 2L',
        oldPrice: 3699,
        price: 36.99,
        priceFactor: 100,
      }],
    }, CAPTURED_AT)).toEqual([])
  })

  it('trusts the retailer promotion flag on its own', () => {
    const [voucher] = parsePromotionVouchers('checkers', {
      products: [{
        id: 'xyz',
        isOnPromotion: true,
        name: 'SASKO More Slices White Bread 700g',
        price: 18.98,
      }],
    }, CAPTURED_AT)

    expect(voucher).toMatchObject({
      accountRequired: true,
      benefitText: 'On promotion at R18.98',
      redemptionMode: 'loyalty',
      retailerId: 'checkers',
    })
    expect(voucher.termsText).toContain('Scan your Xtra Savings card')
  })
})
