import { describe, expect, it } from 'vitest'
import { memberPlans } from './memberPlans'
import {
  FALLBACK_CURRENCY,
  getLocalPlanPrice,
  listOverriddenCountries,
  listPricedCurrencies,
  resolveBillingCurrency,
  resolvePlanPrice,
  SETTLEMENT_CURRENCY,
  toSettlementCents,
} from './planPricing'

// Roughly one rand in dollars. The real rate comes from the live feed; this is
// only a stand-in with the right shape and order of magnitude.
const USD_PER_ZAR = 0.055

describe('plan price lists', () => {
  it('prices every paid plan as a whole number in every currency it sells', () => {
    const paidPlans = memberPlans.filter((plan) => plan.isPaid)

    for (const currencyCode of listPricedCurrencies()) {
      for (const plan of paidPlans) {
        for (const billingCycle of ['annual', 'monthly'] as const) {
          const price = getLocalPlanPrice(plan.id, billingCycle, currencyCode)

          expect(price, `${currencyCode} ${plan.id} ${billingCycle}`).toBeDefined()
          expect(Number.isInteger(price)).toBe(true)
          expect(price).toBeGreaterThan(0)
        }
      }
    }
  })

  it('charges ten months for a year, so annual is the cheaper way to pay', () => {
    for (const currencyCode of listPricedCurrencies()) {
      for (const plan of memberPlans.filter((entry) => entry.isPaid)) {
        const monthly = getLocalPlanPrice(plan.id, 'monthly', currencyCode)!
        const annual = getLocalPlanPrice(plan.id, 'annual', currencyCode)!

        expect(annual).toBeLessThan(monthly * 12)
      }
    }
  })

  it('keeps the free plan out of the paid price lists', () => {
    expect(getLocalPlanPrice('free', 'monthly', 'USD')).toBeUndefined()
    expect(resolvePlanPrice('free', 'monthly', { currencyCode: 'USD' })).toBeUndefined()
  })
})

describe('resolveBillingCurrency', () => {
  it('uses a currency we have chosen prices for', () => {
    expect(resolveBillingCurrency('ZAR')).toBe('ZAR')
    expect(resolveBillingCurrency('usd')).toBe('USD')
    expect(resolveBillingCurrency('EUR')).toBe('EUR')
  })

  it('quotes dollars where we have set no local price', () => {
    // Zimbabwe's official currency is carried by no rate feed we can use, and
    // its shops price in dollars regardless.
    expect(resolveBillingCurrency('ZWG')).toBe(FALLBACK_CURRENCY)
    expect(resolveBillingCurrency('NGN')).toBe(FALLBACK_CURRENCY)
    expect(resolveBillingCurrency(undefined)).toBe(FALLBACK_CURRENCY)
    expect(resolveBillingCurrency('')).toBe(FALLBACK_CURRENCY)
  })
})

describe('toSettlementCents', () => {
  it('needs no conversion for the currency PayFast settles in', () => {
    expect(toSettlementCents(50, SETTLEMENT_CURRENCY, undefined)).toBe(5000)
  })

  it('converts a local price into the rand a card is debited', () => {
    // $5 at roughly R18 to the dollar is about R91.
    expect(toSettlementCents(5, 'USD', USD_PER_ZAR)).toBe(9091)
  })

  it('refuses to invent a rand figure when no rate is known', () => {
    expect(toSettlementCents(5, 'USD', undefined)).toBeUndefined()
    expect(toSettlementCents(5, 'USD', 0)).toBeUndefined()
    expect(toSettlementCents(5, 'USD', Number.NaN)).toBeUndefined()
  })
})

describe('resolvePlanPrice', () => {
  it('quotes a South African shopper in rand, with no rate involved', () => {
    expect(resolvePlanPrice('scout', 'monthly', { currencyCode: 'ZAR' })).toEqual({
      amountCents: 5000,
      currencyCode: 'ZAR',
      localAmount: 50,
    })
  })

  it('quotes an American shopper five dollars and settles it in rand', () => {
    const price = resolvePlanPrice('scout', 'monthly', {
      currencyCode: 'USD',
      rateFromZar: USD_PER_ZAR,
    })

    expect(price).toMatchObject({ currencyCode: 'USD', localAmount: 5 })
    // The rand actually charged is the dollar price at the live rate, not the
    // South African price of the same plan.
    expect(price!.amountCents).toBe(9091)
    expect(price!.amountCents).not.toBe(5000)
  })

  it('prices the bigger plans above the entry plan in every currency', () => {
    for (const currencyCode of listPricedCurrencies()) {
      const scout = getLocalPlanPrice('scout', 'monthly', currencyCode)!
      const household = getLocalPlanPrice('household', 'monthly', currencyCode)!
      const organization = getLocalPlanPrice('organization', 'monthly', currencyCode)!
      const developers = getLocalPlanPrice('developers', 'monthly', currencyCode)!

      expect(household).toBeGreaterThan(scout)
      expect(organization).toBeGreaterThan(household)
      expect(developers).toBeGreaterThan(organization)
    }
  })

  it('falls back to the rand price rather than losing the sale when a rate is missing', () => {
    expect(resolvePlanPrice('scout', 'monthly', { currencyCode: 'USD' })).toEqual({
      amountCents: 5000,
      currencyCode: 'ZAR',
      localAmount: 50,
    })
  })

  // Zimbabwe's shops price in dollars, but a Zimbabwean does not earn like an
  // American. Charging them the American price would shut out exactly the
  // shoppers this is meant to help.
  it('prices Zimbabwe below the United States, in the dollars it can be billed', () => {
    const zw = resolvePlanPrice('scout', 'monthly', {
      countryCode: 'ZW',
      currencyCode: 'ZWG',
      rateFromZar: USD_PER_ZAR,
    })
    const us = resolvePlanPrice('scout', 'monthly', {
      countryCode: 'US',
      currencyCode: 'USD',
      rateFromZar: USD_PER_ZAR,
    })

    expect(zw).toMatchObject({ currencyCode: 'USD', localAmount: 2 })
    expect(us).toMatchObject({ currencyCode: 'USD', localAmount: 5 })
    expect(zw!.amountCents).toBeLessThan(us!.amountCents)

    for (const planId of ['scout', 'household', 'organization', 'developers'] as const) {
      expect(
        getLocalPlanPrice(planId, 'monthly', 'USD', 'ZW')!,
        planId,
      ).toBeLessThan(getLocalPlanPrice(planId, 'monthly', 'USD')!)
    }
  })

  it('keeps every overridden country on a currency it can be billed in', () => {
    for (const countryCode of listOverriddenCountries()) {
      const currencyCode = resolveBillingCurrency(undefined, countryCode)

      expect(listPricedCurrencies(), countryCode).toContain(currencyCode)

      for (const planId of ['scout', 'household', 'organization', 'developers'] as const) {
        const price = getLocalPlanPrice(planId, 'monthly', currencyCode, countryCode)

        expect(Number.isInteger(price), `${countryCode} ${planId}`).toBe(true)
        expect(price).toBeGreaterThan(0)
      }
    }
  })

  it('quotes dollars for a country with no price list of its own', () => {
    const price = resolvePlanPrice('household', 'monthly', {
      currencyCode: 'ZWG',
      rateFromZar: USD_PER_ZAR,
    })

    expect(price).toMatchObject({ currencyCode: 'USD', localAmount: 10 })
  })
})
