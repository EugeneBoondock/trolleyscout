import type { BillingCycle, MemberPlanId } from '../types'

// Every plan is priced as a whole number in the shopper's own money — $5, not
// $4.99 and not $4.83. A converted price carries its exchange rate on its face
// and reads like an accident; a chosen price reads like a price.
//
// PayFast settles in rand, so the rand a card is actually debited is worked
// out from the live rate when checkout starts, and both numbers are shown
// before anyone pays. The local number is the price; the rand is what the bank
// statement will say.

export type PaidPlanId = Exclude<MemberPlanId, 'free'>

export interface LocalPlanPrice {
  annual: number
  monthly: number
}

// A currency earns its own list when we sell into it. Annual is ten months, so
// a year costs two months less than paying monthly, the same bargain in every
// currency.
const PRICE_LISTS: Record<string, Record<PaidPlanId, LocalPlanPrice>> = {
  EUR: {
    household: { annual: 100, monthly: 10 },
    organization: { annual: 990, monthly: 99 },
    scout: { annual: 50, monthly: 5 },
  },
  GBP: {
    household: { annual: 90, monthly: 9 },
    organization: { annual: 890, monthly: 89 },
    scout: { annual: 40, monthly: 4 },
  },
  USD: {
    household: { annual: 100, monthly: 10 },
    organization: { annual: 990, monthly: 99 },
    scout: { annual: 50, monthly: 5 },
  },
  ZAR: {
    household: { annual: 590, monthly: 59 },
    organization: { annual: 4990, monthly: 499 },
    scout: { annual: 290, monthly: 29 },
  },
}

// What PayFast settles in. Rand needs no rate and can never fail to convert,
// which makes it the safe last resort as well as the home price.
export const SETTLEMENT_CURRENCY = 'ZAR'

// Everywhere without its own list is quoted in dollars: widely understood, and
// one of the currencies our rate source actually covers. That matters for
// somewhere like Zimbabwe, whose official currency no rate feed carries but
// whose shops price in dollars anyway.
export const FALLBACK_CURRENCY = 'USD'

export function listPricedCurrencies(): string[] {
  return Object.keys(PRICE_LISTS).sort()
}

export function resolveBillingCurrency(currencyCode: string | undefined): string {
  const code = currencyCode?.trim().toUpperCase()
  return code && PRICE_LISTS[code] ? code : FALLBACK_CURRENCY
}

export function getLocalPlanPrice(
  planId: MemberPlanId,
  billingCycle: BillingCycle,
  currencyCode: string,
): number | undefined {
  return PRICE_LISTS[resolveBillingCurrency(currencyCode)][planId as PaidPlanId]?.[billingCycle]
}

/// Converts a local price to the rand cents PayFast will charge. `rateFromZar`
/// is how much of the local currency one rand buys, which is the shape our
/// rate feed already returns.
export function toSettlementCents(
  localAmount: number,
  currencyCode: string,
  rateFromZar: number | undefined,
): number | undefined {
  if (!Number.isFinite(localAmount) || localAmount <= 0) {
    return undefined
  }

  if (currencyCode === SETTLEMENT_CURRENCY) {
    return Math.round(localAmount * 100)
  }

  // Without a rate there is no honest rand figure, and guessing one would
  // debit a card an amount nobody agreed to. The caller falls back to the
  // rand price list instead, which needs no conversion at all.
  if (!rateFromZar || !Number.isFinite(rateFromZar) || rateFromZar <= 0) {
    return undefined
  }

  return Math.round((localAmount / rateFromZar) * 100)
}

export interface ResolvedPlanPrice {
  // Rand cents PayFast debits, which is also what the payment notification is
  // checked against.
  amountCents: number
  currencyCode: string
  // Whole units of `currencyCode` — the price the shopper was quoted.
  localAmount: number
}

/// Prices one plan for one shopper. Falls back to the rand list whenever a
/// local price cannot be settled, so a missing rate quietly costs us the
/// localised price rather than the sale.
export function resolvePlanPrice(
  planId: MemberPlanId,
  billingCycle: BillingCycle,
  pricing?: { currencyCode?: string; rateFromZar?: number },
): ResolvedPlanPrice | undefined {
  const currencyCode = resolveBillingCurrency(pricing?.currencyCode)
  const localAmount = getLocalPlanPrice(planId, billingCycle, currencyCode)

  if (localAmount !== undefined) {
    const amountCents = toSettlementCents(localAmount, currencyCode, pricing?.rateFromZar)

    if (amountCents !== undefined) {
      return { amountCents, currencyCode, localAmount }
    }
  }

  const randAmount = getLocalPlanPrice(planId, billingCycle, SETTLEMENT_CURRENCY)

  return randAmount === undefined
    ? undefined
    : {
        amountCents: Math.round(randAmount * 100),
        currencyCode: SETTLEMENT_CURRENCY,
        localAmount: randAmount,
      }
}
