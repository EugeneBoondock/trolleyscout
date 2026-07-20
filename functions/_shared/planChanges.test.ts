import { describe, expect, it } from 'vitest'
import {
  addMonths,
  classifyPlanChange,
  computePeriodEnd,
  monthlyEquivalentCents,
  resolveEffectiveAt,
} from './planChanges'

describe('classifyPlanChange', () => {
  it('treats a move to a dearer plan as an upgrade', () => {
    expect(
      classifyPlanChange({
        currentBillingCycle: 'monthly',
        currentPlanId: 'free',
        nextBillingCycle: 'monthly',
        nextPlanId: 'scout',
      }),
    ).toBe('upgrade')

    expect(
      classifyPlanChange({
        currentBillingCycle: 'monthly',
        currentPlanId: 'household',
        nextBillingCycle: 'monthly',
        nextPlanId: 'organization',
      }),
    ).toBe('upgrade')
  })

  it('treats a move to a cheaper plan as a downgrade', () => {
    expect(
      classifyPlanChange({
        currentBillingCycle: 'monthly',
        currentPlanId: 'household',
        nextBillingCycle: 'monthly',
        nextPlanId: 'scout',
      }),
    ).toBe('downgrade')

    expect(
      classifyPlanChange({
        currentBillingCycle: 'monthly',
        currentPlanId: 'organization',
        nextBillingCycle: 'monthly',
        nextPlanId: 'household',
      }),
    ).toBe('downgrade')
  })

  // Cancelling is the downgrade that matters most: it must never take the paid
  // period away from the member the moment they click it.
  it('treats cancelling to free as a downgrade', () => {
    expect(
      classifyPlanChange({
        currentBillingCycle: 'annual',
        currentPlanId: 'scout',
        nextBillingCycle: 'annual',
        nextPlanId: 'free',
      }),
    ).toBe('downgrade')
  })

  it('reports no change when the plan and cycle both match', () => {
    expect(
      classifyPlanChange({
        currentBillingCycle: 'annual',
        currentPlanId: 'scout',
        nextBillingCycle: 'annual',
        nextPlanId: 'scout',
      }),
    ).toBe('none')
  })

  // Annual costs less per month but takes a year's money up front, so it is the
  // paying-more direction and must not be made to wait.
  it('reads monthly to annual as an upgrade and the reverse as a downgrade', () => {
    expect(
      classifyPlanChange({
        currentBillingCycle: 'monthly',
        currentPlanId: 'scout',
        nextBillingCycle: 'annual',
        nextPlanId: 'scout',
      }),
    ).toBe('upgrade')

    expect(
      classifyPlanChange({
        currentBillingCycle: 'annual',
        currentPlanId: 'scout',
        nextBillingCycle: 'monthly',
        nextPlanId: 'scout',
      }),
    ).toBe('downgrade')
  })

  it('ranks plans by what they cost a member each month', () => {
    expect(monthlyEquivalentCents('free', 'monthly')).toBe(0)
    expect(monthlyEquivalentCents('scout', 'monthly')).toBe(2900)
    expect(monthlyEquivalentCents('scout', 'annual')).toBe(2417)
    expect(monthlyEquivalentCents('organization', 'annual')).toBe(41583)
  })
})

describe('computePeriodEnd', () => {
  it('adds one calendar month for monthly billing', () => {
    expect(computePeriodEnd('2026-07-15T09:30:00.000Z', 'monthly')).toBe('2026-08-15T09:30:00.000Z')
  })

  it('adds one calendar year for annual billing', () => {
    expect(computePeriodEnd('2026-07-15T09:30:00.000Z', 'annual')).toBe('2027-07-15T09:30:00.000Z')
  })

  // Paying on the 31st must not skid into the month after next.
  it('clamps a long day of month onto a short month', () => {
    expect(computePeriodEnd('2026-01-31T00:00:00.000Z', 'monthly')).toBe('2026-02-28T00:00:00.000Z')
    expect(computePeriodEnd('2028-01-31T00:00:00.000Z', 'monthly')).toBe('2028-02-29T00:00:00.000Z')
  })

  it('clamps a leap day onto the following common year', () => {
    expect(computePeriodEnd('2028-02-29T00:00:00.000Z', 'annual')).toBe('2029-02-28T00:00:00.000Z')
  })

  it('rejects an unparseable date rather than inventing a period', () => {
    expect(() => computePeriodEnd('not-a-date', 'monthly')).toThrow(TypeError)
  })

  it('steps months without mutating the date it was given', () => {
    const original = new Date('2026-07-15T00:00:00.000Z')
    addMonths(original, 3)

    expect(original.toISOString()).toBe('2026-07-15T00:00:00.000Z')
  })
})

describe('resolveEffectiveAt', () => {
  const now = new Date('2026-07-20T12:00:00.000Z')

  it('lands the change on the end of the period already paid for', () => {
    expect(
      resolveEffectiveAt({
        billingCycle: 'monthly',
        currentPeriodEnd: '2026-08-03T00:00:00.000Z',
        now,
      }),
    ).toBe('2026-08-03T00:00:00.000Z')
  })

  // An older subscription row predates the period-end column, and an ITN can
  // arrive without a usable date. Falling back to one cycle out keeps the
  // change moving instead of leaving it queued forever.
  it('falls back to one cycle from now when no period end is recorded', () => {
    expect(resolveEffectiveAt({ billingCycle: 'monthly', currentPeriodEnd: null, now })).toBe(
      '2026-08-20T12:00:00.000Z',
    )
    expect(resolveEffectiveAt({ billingCycle: 'annual', now })).toBe('2027-07-20T12:00:00.000Z')
  })

  it('falls back when the recorded period end has already passed', () => {
    expect(
      resolveEffectiveAt({
        billingCycle: 'monthly',
        currentPeriodEnd: '2026-06-01T00:00:00.000Z',
        now,
      }),
    ).toBe('2026-08-20T12:00:00.000Z')
  })
})
