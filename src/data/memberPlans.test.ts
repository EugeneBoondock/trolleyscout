import { describe, expect, it } from 'vitest'
import {
  getDeveloperAllowance,
  getLocalisedMemberPlans,
  getMemberPlan,
  getPlanBillingOption,
  getPlanMerchantAllowance,
  limitVisibleCataloguesForPlan,
  limitVisibleDealsForPlan,
  memberPlans,
} from './memberPlans'

describe('memberPlans', () => {
  it('publishes the approved monthly and annual prices', () => {
    expect(getMemberPlan('scout').prices).toEqual({ annual: 50000, monthly: 5000 })
    expect(getMemberPlan('household').prices).toEqual({ annual: 80000, monthly: 8000 })
    expect(getMemberPlan('organization').prices).toEqual({ annual: 499000, monthly: 49900 })
    expect(getMemberPlan('developers').prices).toEqual({ annual: 999000, monthly: 99900 })
  })

  // The annual price is advertised as "save 2 months" on the billing toggle, so
  // a plan whose annual price drifts off ten months would make that copy a lie.
  it('prices every paid plan at ten months for an annual subscription', () => {
    for (const plan of memberPlans.filter((candidate) => candidate.isPaid)) {
      expect(plan.prices.annual).toBe(plan.prices.monthly * 10)
    }
  })

  it('publishes the approved consumer and developer visibility policy', () => {
    expect(
      memberPlans.map((plan) => ({
        catalogues: plan.limits.visibleCatalogues,
        deals: plan.limits.visibleDeals,
        id: plan.id,
      })),
    ).toEqual([
      { catalogues: 50, deals: 2_000, id: 'free' },
      { catalogues: 150, deals: 7_000, id: 'scout' },
      {
        catalogues: Number.MAX_SAFE_INTEGER,
        deals: Number.MAX_SAFE_INTEGER,
        id: 'household',
      },
      {
        catalogues: Number.MAX_SAFE_INTEGER,
        deals: Number.MAX_SAFE_INTEGER,
        id: 'organization',
      },
      {
        catalogues: Number.MAX_SAFE_INTEGER,
        deals: Number.MAX_SAFE_INTEGER,
        id: 'developers',
      },
    ])
  })

  it.each([
    ['free', 2_000, 50],
    ['scout', 7_000, 150],
    ['household', 8_000, 200],
    ['organization', 8_000, 200],
    ['developers', 8_000, 200],
  ] as const)('applies %s limits to direct saved and cached views', (planId, deals, catalogues) => {
    expect(limitVisibleDealsForPlan(Array.from({ length: 8_000 }), planId)).toHaveLength(deals)
    expect(limitVisibleCataloguesForPlan(Array.from({ length: 200 }), planId))
      .toHaveLength(catalogues)
  })

  it('maps billing cycles to PayFast frequencies and trusted amounts', () => {
    expect(getPlanBillingOption('scout', 'monthly')).toMatchObject({
      amountCents: 5000,
      frequency: 3,
      itemName: 'Trolley Scout Scout monthly',
    })
    expect(getPlanBillingOption('household', 'annual')).toMatchObject({
      amountCents: 80000,
      frequency: 6,
      itemName: 'Trolley Scout Household annual',
    })
    expect(getPlanBillingOption('organization', 'monthly')).toMatchObject({
      amountCents: 49900,
      frequency: 3,
      itemName: 'Trolley Scout Organisation monthly',
    })
  })

  it('does not create a paid billing option for the free plan', () => {
    expect(getPlanBillingOption('free', 'monthly')).toBeUndefined()
  })

  // Roughly R16.69 to the dollar, the live rate on the day this was written.
  const USD_PER_ZAR = 0.05993

  it('charges an American the rand their five dollars comes to', () => {
    expect(
      getPlanBillingOption('scout', 'monthly', {
        currencyCode: 'USD',
        rateFromZar: USD_PER_ZAR,
      }),
    ).toMatchObject({
      // R83.43, which is what their statement will say.
      amountCents: 8343,
      currencyCode: 'USD',
      localAmount: 5,
    })
  })

  it('quotes the plan table in the shopper’s money and settles it in rand', () => {
    const plans = getLocalisedMemberPlans({ currencyCode: 'USD', rateFromZar: USD_PER_ZAR })
    const scout = plans.find((plan) => plan.id === 'scout')!

    expect(scout.localPrices).toEqual({ annual: 50, currencyCode: 'USD', monthly: 5 })
    expect(scout.prices).toEqual({ annual: 83431, monthly: 8343 })
    // The free plan has no price to localise, so it is passed through untouched.
    expect(plans.find((plan) => plan.id === 'free')?.localPrices).toBeUndefined()
  })

  it('leaves a South African shopper on the rand price, with no rate involved', () => {
    const plans = getLocalisedMemberPlans({ currencyCode: 'ZAR', rateFromZar: 1 })
    const scout = plans.find((plan) => plan.id === 'scout')!

    expect(scout.localPrices).toEqual({ annual: 500, currencyCode: 'ZAR', monthly: 50 })
    expect(scout.prices).toEqual({ annual: 50000, monthly: 5000 })
  })

  it('makes the business tier available for an approved application flow', () => {
    const plan = getMemberPlan('organization')
    expect(plan.comingSoon).toBeUndefined()
    expect(plan.statusText).toBe('Application required')
  })

  it('grants merchant capacity only to the business plan', () => {
    expect(getPlanMerchantAllowance('organization')).toEqual({
      includedAdsPerMonth: 3,
      livePromos: 25,
      shopProfiles: 1,
    })
    expect(getPlanMerchantAllowance('household')).toBeUndefined()
    expect(getPlanMerchantAllowance('scout')).toBeUndefined()
    expect(getPlanMerchantAllowance('free')).toBeUndefined()
  })

  it('grants developer and organization capacity to Developers', () => {
    expect(getDeveloperAllowance('developers')).toEqual({
      callsPerMinute: 120,
      callsPerMonth: 25_000,
    })
    expect(getPlanMerchantAllowance('developers')).toEqual({
      includedAdsPerMonth: 3,
      livePromos: 25,
      shopProfiles: 1,
    })
  })
})
