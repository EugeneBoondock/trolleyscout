import type { BillingCycle, MemberPlanId } from '../../src/types'
import { getMemberPlan } from '../../src/data/memberPlans'

// Whether a plan move costs the member more or less than what they are on now.
// This decides *when* it happens: paying more takes effect immediately, paying
// less waits for the period they already paid for to run out.
export type PlanChangeKind = 'none' | 'upgrade' | 'downgrade'

export interface PlanChangeInput {
  currentBillingCycle: BillingCycle
  currentPlanId: MemberPlanId
  nextBillingCycle: BillingCycle
  nextPlanId: MemberPlanId
}

// Plans are ranked by what they cost per month rather than by a hand-kept list,
// so a new tier slots in at the right place purely from its price.
export function monthlyEquivalentCents(planId: MemberPlanId, billingCycle: BillingCycle): number {
  const plan = getMemberPlan(planId)

  return billingCycle === 'annual' ? Math.round(plan.prices.annual / 12) : plan.prices.monthly
}

export function classifyPlanChange(input: PlanChangeInput): PlanChangeKind {
  if (input.currentPlanId === input.nextPlanId) {
    if (input.currentBillingCycle === input.nextBillingCycle) {
      return 'none'
    }

    // Same plan, different cycle. Annual is cheaper per month but takes a year's
    // money up front, so it is an upgrade in the sense that matters here: the
    // member is paying now and should get what they paid for now. Going back to
    // monthly must wait, or they forfeit the months already bought.
    return input.nextBillingCycle === 'annual' ? 'upgrade' : 'downgrade'
  }

  const current = monthlyEquivalentCents(input.currentPlanId, input.currentBillingCycle)
  const next = monthlyEquivalentCents(input.nextPlanId, input.nextBillingCycle)

  if (next === current) {
    return 'none'
  }

  return next > current ? 'upgrade' : 'downgrade'
}

// Calendar months, not 30-day blocks: a member who paid on the 31st should roll
// on the last day of a short month rather than skidding into the next one.
export function addMonths(date: Date, months: number): Date {
  const dayOfMonth = date.getUTCDate()
  const result = new Date(date.getTime())

  // Move to the 1st before shifting the month so a long day-of-month cannot
  // overflow into the following month, then clamp back to the real last day.
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)

  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate()

  result.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth))

  return result
}

export function computePeriodEnd(paidAt: Date | string, billingCycle: BillingCycle): string {
  const start = typeof paidAt === 'string' ? new Date(paidAt) : paidAt

  if (Number.isNaN(start.getTime())) {
    throw new TypeError('paidAt must be a valid date.')
  }

  return addMonths(start, billingCycle === 'annual' ? 12 : 1).toISOString()
}

// When a queued downgrade should land. The end of the paid period is the honest
// answer; a subscription with no recorded period end (an older row, or one
// whose ITN never carried a date) falls back to one cycle from now so the
// change still happens rather than hanging forever.
export function resolveEffectiveAt(input: {
  billingCycle: BillingCycle
  currentPeriodEnd?: string | null
  now: Date
}): string {
  const periodEnd = input.currentPeriodEnd?.trim()

  if (periodEnd) {
    const parsed = new Date(periodEnd)

    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > input.now.getTime()) {
      return parsed.toISOString()
    }
  }

  return computePeriodEnd(input.now, input.billingCycle)
}
