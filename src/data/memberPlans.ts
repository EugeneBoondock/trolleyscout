import type { BillingCycle, MemberPlan, MemberPlanId } from '../types'

// Core shopping tools stay free. Paid plans buy bigger lists for power savers.
export const memberPlans: MemberPlan[] = [
  {
    badge: 'Included',
    description: 'Everything a household needs to stretch the month, free forever.',
    features: [
      'Price tools and live deals',
      '10 saved deals',
      'Basket planner with 15 items',
      'No card, no trial, no catch',
    ],
    id: 'free',
    isPaid: false,
    limits: {
      basketItems: 15,
      savedDeals: 10,
      savedSources: 10,
    },
    name: 'Free',
    prices: {
      annual: 0,
      monthly: 0,
    },
    statusText: 'Active now',
  },
  {
    badge: 'For power savers',
    description: 'For one serious saver tracking deals across many stores every week.',
    features: [
      'Everything in Free',
      '100 saved deals',
      'Basket planner with 150 items',
      'More room for weekly shopping plans',
    ],
    id: 'scout',
    isPaid: true,
    limits: {
      basketItems: 150,
      savedDeals: 100,
      savedSources: 100,
    },
    name: 'Scout',
    prices: {
      annual: 29000,
      monthly: 2900,
    },
    statusText: 'Checkout required',
  },
  {
    badge: 'For big families',
    description: 'Plan a large household’s spend with room for everyone’s lists.',
    features: [
      'Everything in Scout',
      '250 saved deals',
      'Basket planner with 400 items',
      'More room for large household lists',
    ],
    id: 'household',
    isPaid: true,
    limits: {
      basketItems: 400,
      savedDeals: 250,
      savedSources: 250,
    },
    name: 'Household',
    prices: {
      annual: 59000,
      monthly: 5900,
    },
    statusText: 'Checkout required',
  },
  {
    badge: 'For businesses',
    description:
      'For shops and brands: list your store, post your own specials, and reach shoppers near you.',
    features: [
      'Everything in Household, including Properties',
      'Your own shop profile on Near me',
      'Publish your specials straight to the deals board',
      '3 sponsored campaigns included every month',
    ],
    // The shop profile and self-published promos are still being built, so the
    // tier is announced at its real price but cannot be bought yet.
    comingSoon: true,
    id: 'organization',
    isPaid: true,
    limits: {
      basketItems: 1000,
      savedDeals: 1000,
      savedSources: 1000,
    },
    merchant: {
      includedAdsPerMonth: 3,
      livePromos: 25,
      shopProfiles: 1,
    },
    name: 'Organisation',
    prices: {
      annual: 499000,
      monthly: 49900,
    },
    statusText: 'Coming soon',
  },
]

// Merchant features are gated on the plan carrying an allowance rather than on
// an id comparison, so a future tier grants them by declaring one.
export function getPlanMerchantAllowance(planId: MemberPlanId) {
  return getMemberPlan(planId).merchant
}

export function getMemberPlan(planId: MemberPlanId) {
  return memberPlans.find((plan) => plan.id === planId) ?? memberPlans[0]
}

export function getPlanBillingOption(planId: MemberPlanId, billingCycle: BillingCycle) {
  const plan = getMemberPlan(planId)

  if (!plan.isPaid) {
    return undefined
  }

  return {
    amountCents: plan.prices[billingCycle],
    billingCycle,
    frequency: billingCycle === 'monthly' ? 3 : 6,
    itemName: `Trolley Scout ${plan.name} ${billingCycle}`,
    planId,
  }
}
