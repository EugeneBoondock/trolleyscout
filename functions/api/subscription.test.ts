import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cancelPendingPlanChange: vi.fn(),
  getMemberSession: vi.fn(),
  getSubscriptionPlans: vi.fn(),
  isBillingReady: vi.fn(),
  listMemberOrganizationApplications: vi.fn(),
  startSubscriptionCheckout: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  cancelPendingPlanChange: mocks.cancelPendingPlanChange,
  getMemberSession: mocks.getMemberSession,
  getSubscriptionPlans: mocks.getSubscriptionPlans,
  isBillingReady: mocks.isBillingReady,
  startSubscriptionCheckout: mocks.startSubscriptionCheckout,
}))

vi.mock('../_shared/organizationStore', () => ({
  listMemberOrganizationApplications: mocks.listMemberOrganizationApplications,
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
    mocks.getSubscriptionPlans.mockResolvedValue([])
    mocks.listMemberOrganizationApplications.mockResolvedValue([
      { id: 'org-app-1', organisationName: 'Fresh Market', status: 'pending' },
    ])
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
    mocks.cancelPendingPlanChange.mockResolvedValue({
      account: { id: 'account-1', planId: 'scout' },
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

  it('returns the signed-in member’s business application with subscription plans', async () => {
    const response = await onRequest({
      env: { DB: {} },
      request: new Request('https://trolleyscout.co.za/api/subscription'),
    } as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        businessApplications: [
          { id: 'org-app-1', organisationName: 'Fresh Market', status: 'pending' },
        ],
      },
    })
    expect(mocks.listMemberOrganizationApplications).toHaveBeenCalledWith(
      expect.anything(),
      'account-1',
    )
  })

  it('does not start Organisation checkout before a business application exists', async () => {
    mocks.listMemberOrganizationApplications.mockResolvedValue([])

    const response = await onRequest({
      env: { DB: {} },
      request: new Request('https://trolleyscout.co.za/api/subscription', {
        body: JSON.stringify({
          billingCycle: 'monthly',
          checkoutMode: 'redirect',
          planId: 'organization',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    } as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      data: {
        checkout: {
          message: expect.stringContaining('business application'),
          planId: 'organization',
        },
      },
    })
    expect(mocks.startSubscriptionCheckout).not.toHaveBeenCalled()
  })

  it('returns the account after a reversible scheduled change is removed', async () => {
    const response = await onRequest({
      env: { DB: {} },
      request: new Request('https://trolleyscout.co.za/api/subscription', {
        method: 'DELETE',
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { account: { id: 'account-1', planId: 'scout' } },
    })
  })
})
