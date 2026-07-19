import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  getSubscriptionPlans: vi.fn(),
  isBillingReady: vi.fn(),
  startSubscriptionCheckout: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
  getSubscriptionPlans: mocks.getSubscriptionPlans,
  isBillingReady: mocks.isBillingReady,
  startSubscriptionCheckout: mocks.startSubscriptionCheckout,
}))

import { onRequest } from './subscription'

describe('/api/subscription', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getMemberSession.mockResolvedValue({
      account: { id: 'account-1', planId: 'free' },
      isAuthenticated: true,
    })
    mocks.isBillingReady.mockReturnValue(true)
    mocks.startSubscriptionCheckout.mockResolvedValue({
      billingCycle: 'monthly',
      billingReady: true,
      message: 'Redirecting to PayFast.',
      planId: 'scout',
      provider: 'payfast',
      redirectFields: { signature: 'signed' },
      redirectUrl: 'https://www.payfast.co.za/eng/process',
      status: 'checkout_required',
    })
  })

  it('passes the native redirect preference to checkout creation', async () => {
    const request = new Request('https://trolleyscout.co.za/api/subscription', {
      body: JSON.stringify({
        billingCycle: 'monthly',
        checkoutMode: 'redirect',
        planId: 'scout',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const env = { DB: {} }

    const response = await onRequest({ env, request } as never)

    expect(response.status).toBe(200)
    expect(mocks.startSubscriptionCheckout).toHaveBeenCalledTimes(1)
    expect(mocks.startSubscriptionCheckout.mock.calls[0]?.[5]).toBe(true)
  })
})
