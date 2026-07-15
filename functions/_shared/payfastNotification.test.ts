import { describe, expect, it, vi } from 'vitest'
import { createPayFastSignature } from './payfast'
import type { PayFastBillingRepository } from './payfastNotification'
import { processPayFastNotification } from './payfastNotification'

function createNotification() {
  const fields = new URLSearchParams()
  fields.append('m_payment_id', 'billing-test')
  fields.append('pf_payment_id', 'pf-test')
  fields.append('payment_status', 'COMPLETE')
  fields.append('amount_gross', '29.00')
  fields.append('merchant_id', '10000100')
  fields.append('token', 'subscription-test')
  fields.append('signature', createPayFastSignature(fields, 'secret phrase'))
  return fields
}

function createRepository(options: { duplicate?: boolean } = {}) {
  const completeSubscription = vi.fn().mockResolvedValue(undefined)
  const markAttempt = vi.fn().mockResolvedValue(undefined)
  const repository: PayFastBillingRepository = {
    claimEvent: vi.fn().mockResolvedValue(!options.duplicate),
    completeSubscription,
    findAttempt: vi.fn().mockResolvedValue({
      accountId: 'member-test',
      amountCents: 2900,
      billingCycle: 'monthly',
      id: 'billing-test',
      planId: 'scout',
    }),
    markAttempt,
  }

  return { completeSubscription, markAttempt, repository }
}

describe('processPayFastNotification', () => {
  it('activates a stored subscription only after PayFast confirms the ITN', async () => {
    const { completeSubscription, repository } = createRepository()
    const fetcher = vi.fn().mockResolvedValue(new Response('VALID', { status: 200 }))

    await expect(
      processPayFastNotification({
        fetcher,
        fields: createNotification(),
        merchantId: '10000100',
        mode: 'live',
        passphrase: 'secret phrase',
        repository,
      }),
    ).resolves.toEqual({ duplicate: false, received: true, updated: true })
    expect(completeSubscription).toHaveBeenCalledWith({
      accountId: 'member-test',
      attemptId: 'billing-test',
      billingCycle: 'monthly',
      paymentId: 'pf-test',
      planId: 'scout',
      token: 'subscription-test',
    })
  })

  it('does not activate when PayFast rejects server validation', async () => {
    const { completeSubscription, repository } = createRepository()
    const fetcher = vi.fn().mockResolvedValue(new Response('INVALID', { status: 200 }))

    await expect(
      processPayFastNotification({
        fetcher,
        fields: createNotification(),
        merchantId: '10000100',
        mode: 'live',
        passphrase: 'secret phrase',
        repository,
      }),
    ).resolves.toEqual({ issue: 'PayFast did not validate the notification.', received: false })
    expect(completeSubscription).not.toHaveBeenCalled()
  })

  it('treats a claimed payment event as an idempotent duplicate', async () => {
    const { completeSubscription, repository } = createRepository({ duplicate: true })
    const fetcher = vi.fn().mockResolvedValue(new Response('VALID', { status: 200 }))

    await expect(
      processPayFastNotification({
        fetcher,
        fields: createNotification(),
        merchantId: '10000100',
        mode: 'live',
        passphrase: 'secret phrase',
        repository,
      }),
    ).resolves.toEqual({ duplicate: true, received: true, updated: false })
    expect(completeSubscription).not.toHaveBeenCalled()
  })
})
