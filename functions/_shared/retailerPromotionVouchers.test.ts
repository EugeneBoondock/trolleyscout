import { describe, expect, it } from 'vitest'
import { parsePromotionVouchers } from './retailerPromotionVouchers'

const CAPTURED_AT = '2026-07-31T08:00:00.000Z'

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
