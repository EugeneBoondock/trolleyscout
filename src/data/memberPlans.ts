import type { BillingCycle, MemberPlan, MemberPlanId } from '../types'
import { getLocalPlanPrice, resolvePlanPrice } from './planPricing'

// Rand cents, read from the same price lists every other currency comes from,
// so the South African price cannot drift away from the one we bill.
function randPrices(planId: MemberPlanId) {
  return {
    annual: (getLocalPlanPrice(planId, 'annual', 'ZAR') ?? 0) * 100,
    monthly: (getLocalPlanPrice(planId, 'monthly', 'ZAR') ?? 0) * 100,
  }
}

// Household shopping visibility is unlimited. Organisation and Developers
// deliberately keep the same unlimited shopping view, with developer API
// traffic controlled separately by the documented request quotas below.
const UNLIMITED_VISIBILITY = Number.MAX_SAFE_INTEGER

// Core shopping tools stay free. Paid plans buy bigger lists for power savers.
export const memberPlans: MemberPlan[] = [
  {
    badge: 'Included',
    description: 'Everything a household needs to stretch the month, free forever.',
    features: [
      'Price tools and live deals',
      'Full-page catalogue reader with product details',
      'No third-party ad banners',
      'Browse up to 2,000 deals and 50 catalogues',
      '10 saved deals',
      'Basket planner with 15 items',
      '20 watched items with deal alerts',
      'No card, no trial, no catch',
    ],
    id: 'free',
    isPaid: false,
    limits: {
      basketItems: 15,
      dealWatches: 20,
      savedDeals: 10,
      savedSources: 10,
      visibleCatalogues: 50,
      visibleDeals: 2_000,
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
      'Browse up to 7,000 deals and 150 catalogues',
      '100 saved deals',
      '100 saved official sources',
      'Basket planner with 150 items',
      '100 watched items with deal alerts',
      'Ask Mr Scout about products by voice',
    ],
    id: 'scout',
    isPaid: true,
    limits: {
      basketItems: 150,
      dealWatches: 100,
      savedDeals: 100,
      savedSources: 100,
      visibleCatalogues: 150,
      visibleDeals: 7_000,
    },
    name: 'Scout',
    prices: randPrices('scout'),
    statusText: 'Checkout required',
  },
  {
    badge: 'For big families',
    description: 'Plan a large household’s spend and search homes across official property portals.',
    features: [
      'Everything in Scout',
      'Unlimited deals and catalogues',
      'Properties Scout for homes to buy or rent',
      '250 saved deals',
      '250 saved official sources',
      'Basket planner with 400 items',
      '250 watched items with deal alerts',
    ],
    id: 'household',
    isPaid: true,
    limits: {
      basketItems: 400,
      dealWatches: 250,
      savedDeals: 250,
      savedSources: 250,
      visibleCatalogues: UNLIMITED_VISIBILITY,
      visibleDeals: UNLIMITED_VISIBILITY,
    },
    name: 'Household',
    prices: randPrices('household'),
    statusText: 'Checkout required',
  },
  {
    badge: 'For businesses',
    description:
      'For shops and brands: list your store, post your own specials, and reach shoppers near you.',
    features: [
      'Everything in Household, including Properties Scout',
      'Unlimited shopping deals and catalogues',
      'Your own shop profile on Near me',
      'Publish your specials straight to the deals board',
      '3 sponsored campaigns included every month',
    ],
    id: 'organization',
    isPaid: true,
    limits: {
      basketItems: 1000,
      dealWatches: 1000,
      savedDeals: 1000,
      savedSources: 1000,
      visibleCatalogues: UNLIMITED_VISIBILITY,
      visibleDeals: UNLIMITED_VISIBILITY,
    },
    merchant: {
      includedAdsPerMonth: 3,
      livePromos: 25,
      shopProfiles: 1,
    },
    name: 'Organisation',
    prices: randPrices('organization'),
    statusText: 'Application required',
  },
  {
    badge: 'For developers',
    description:
      'Build with Trolley Scout shopping data and manage your business campaigns programmatically.',
    developer: {
      callsPerMinute: 120,
      callsPerMonth: 25_000,
    },
    features: [
      'Everything in Organisation',
      'OAuth access to the Trolley Scout MCP server',
      'API keys for the developer REST API',
      '25,000 authenticated calls every month',
      'Create and manage campaigns for your approved business',
    ],
    id: 'developers',
    isPaid: true,
    limits: {
      basketItems: 1000,
      dealWatches: 1000,
      savedDeals: 1000,
      savedSources: 1000,
      visibleCatalogues: UNLIMITED_VISIBILITY,
      visibleDeals: UNLIMITED_VISIBILITY,
    },
    merchant: {
      includedAdsPerMonth: 3,
      livePromos: 25,
      shopProfiles: 1,
    },
    name: 'Developers',
    prices: randPrices('developers'),
    statusText: 'Application required',
  },
]

// Merchant features are gated on the plan carrying an allowance rather than on
// an id comparison, so a future tier grants them by declaring one.
export function getPlanMerchantAllowance(planId: MemberPlanId) {
  return getMemberPlan(planId).merchant
}

export function getDeveloperAllowance(planId: MemberPlanId) {
  return getMemberPlan(planId).developer
}

export function getMemberPlan(planId: MemberPlanId) {
  return memberPlans.find((plan) => plan.id === planId) ?? memberPlans[0]
}

export function limitVisibleDealsForPlan<T>(
  items: readonly T[],
  planId: MemberPlanId,
): T[] {
  return items.slice(0, getMemberPlan(planId).limits.visibleDeals)
}

export function limitVisibleCataloguesForPlan<T>(
  items: readonly T[],
  planId: MemberPlanId,
): T[] {
  return items.slice(0, getMemberPlan(planId).limits.visibleCatalogues)
}

/// Prices a checkout. `amountCents` is always the rand PayFast debits, because
/// that is what the payment notification is checked against; `localAmount` is
/// the whole-number price in the shopper's own currency that we quoted them.
export function getPlanBillingOption(
  planId: MemberPlanId,
  billingCycle: BillingCycle,
  pricing?: { countryCode?: string; currencyCode?: string; rateFromZar?: number },
) {
  const plan = getMemberPlan(planId)

  if (!plan.isPaid) {
    return undefined
  }

  const price = resolvePlanPrice(planId, billingCycle, pricing)

  if (!price) {
    return undefined
  }

  return {
    amountCents: price.amountCents,
    billingCycle,
    currencyCode: price.currencyCode,
    frequency: billingCycle === 'monthly' ? 3 : 6,
    itemName: `Trolley Scout ${plan.name} ${billingCycle}`,
    localAmount: price.localAmount,
    planId,
  }
}

/// The plan table as one shopper sees it: quoted in their currency, with the
/// rand that will actually leave their account alongside it.
export function getLocalisedMemberPlans(pricing?: {
  countryCode?: string
  currencyCode?: string
  rateFromZar?: number
}): MemberPlan[] {
  return memberPlans.map((plan) => {
    if (!plan.isPaid) {
      return plan
    }

    const annual = resolvePlanPrice(plan.id, 'annual', pricing)
    const monthly = resolvePlanPrice(plan.id, 'monthly', pricing)

    if (!annual || !monthly) {
      return plan
    }

    return {
      ...plan,
      localPrices: {
        annual: annual.localAmount,
        currencyCode: monthly.currencyCode,
        monthly: monthly.localAmount,
      },
      prices: {
        annual: annual.amountCents,
        monthly: monthly.amountCents,
      },
    }
  })
}
