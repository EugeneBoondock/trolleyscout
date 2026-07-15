import type { MemberPlan, MemberPlanId } from '../types'

// Plan philosophy: everything a household needs to eat and claim what is
// theirs stays free, with honest capacity. Paid plans buy bigger lists for
// power savers — and fund keeping the essentials free for everyone else.
export const memberPlans: MemberPlan[] = [
  {
    badge: 'Included',
    description: 'Everything a household needs to stretch the month, free forever.',
    features: [
      'Money help, tools, and live deals',
      '10 saved deals and 10 saved sources',
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
    statusText: 'Active now',
  },
  {
    badge: 'For power savers',
    description: 'For one serious saver tracking deals across many stores every week.',
    features: [
      'Everything in Free',
      '100 saved deals and 100 saved sources',
      'Basket planner with 150 items',
      'Funds free money help for others',
    ],
    id: 'scout',
    isPaid: true,
    limits: {
      basketItems: 150,
      savedDeals: 100,
      savedSources: 100,
    },
    name: 'Scout',
    statusText: 'Checkout required',
  },
  {
    badge: 'For big families',
    description: 'Plan a large household’s spend with room for everyone’s lists.',
    features: [
      'Everything in Scout',
      '250 saved deals and 250 saved sources',
      'Basket planner with 400 items',
      'Funds free money help for others',
    ],
    id: 'household',
    isPaid: true,
    limits: {
      basketItems: 400,
      savedDeals: 250,
      savedSources: 250,
    },
    name: 'Household',
    statusText: 'Checkout required',
  },
]

export function getMemberPlan(planId: MemberPlanId) {
  return memberPlans.find((plan) => plan.id === planId) ?? memberPlans[0]
}
