import { describe, expect, it } from 'vitest'
import { getMemberPlan, getPlanBillingOption, getPlanMerchantAllowance, memberPlans } from './memberPlans'

describe('memberPlans', () => {
  it('publishes the approved monthly and annual prices', () => {
    expect(getMemberPlan('scout').prices).toEqual({ annual: 29000, monthly: 2900 })
    expect(getMemberPlan('household').prices).toEqual({ annual: 59000, monthly: 5900 })
    expect(getMemberPlan('organization').prices).toEqual({ annual: 499000, monthly: 49900 })
  })

  // The annual price is advertised as "save 2 months" on the billing toggle, so
  // a plan whose annual price drifts off ten months would make that copy a lie.
  it('prices every paid plan at ten months for an annual subscription', () => {
    for (const plan of memberPlans.filter((candidate) => candidate.isPaid)) {
      expect(plan.prices.annual).toBe(plan.prices.monthly * 10)
    }
  })

  it('maps billing cycles to PayFast frequencies and trusted amounts', () => {
    expect(getPlanBillingOption('scout', 'monthly')).toMatchObject({
      amountCents: 2900,
      frequency: 3,
      itemName: 'Trolley Scout Scout monthly',
    })
    expect(getPlanBillingOption('household', 'annual')).toMatchObject({
      amountCents: 59000,
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

  // The merchant tools it advertises are still being built, so nobody may be
  // charged for it yet. Every other plan must stay purchasable.
  it('keeps the business tier announced but not purchasable', () => {
    expect(getMemberPlan('organization').comingSoon).toBe(true)

    for (const plan of memberPlans.filter((candidate) => candidate.id !== 'organization')) {
      expect(plan.comingSoon).toBeUndefined()
    }
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
})
