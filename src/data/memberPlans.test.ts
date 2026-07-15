import { describe, expect, it } from 'vitest'
import { getMemberPlan, getPlanBillingOption } from './memberPlans'

describe('memberPlans', () => {
  it('publishes the approved monthly and annual prices', () => {
    expect(getMemberPlan('scout').prices).toEqual({ annual: 29000, monthly: 2900 })
    expect(getMemberPlan('household').prices).toEqual({ annual: 59000, monthly: 5900 })
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
  })

  it('does not create a paid billing option for the free plan', () => {
    expect(getPlanBillingOption('free', 'monthly')).toBeUndefined()
  })
})
