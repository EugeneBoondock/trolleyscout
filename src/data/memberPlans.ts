import type { MemberPlan, MemberPlanId } from '../types'

export const memberPlans: MemberPlan[] = [
  {
    badge: 'Included',
    description: 'Use the source directory and scanner with no paid billing.',
    features: ['Official source directory', 'Offer scanner', 'Verified offer board'],
    id: 'free',
    isPaid: false,
    name: 'Free',
    statusText: 'Active now',
  },
  {
    badge: 'Paid plan',
    description: 'For one shopper managing saved retailer sources and offer checks.',
    features: ['Saved source list', 'Saved deal list', 'Member dashboard', 'Profile and plan state'],
    id: 'scout',
    isPaid: true,
    name: 'Scout',
    statusText: 'Checkout required',
  },
  {
    badge: 'Paid plan',
    description: 'For a household plan once billing is connected.',
    features: ['Saved source list', 'Saved deal list', 'Plan state in profile', 'Ready for Stripe checkout'],
    id: 'household',
    isPaid: true,
    name: 'Household',
    statusText: 'Checkout required',
  },
]

export function getMemberPlan(planId: MemberPlanId) {
  return memberPlans.find((plan) => plan.id === planId) ?? memberPlans[0]
}
