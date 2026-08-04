import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./services/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/apiClient')>()
  return {
    ...actual,
    submitBusinessApplication: vi.fn(),
  }
})

import { SubscriptionPanel } from './App'
import type { ResourceState, SubscriptionResource } from './services/apiClient'
import type { CountryContext, MemberAccount } from './types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Organisation subscription application', () => {
  it('opens the business details form before checkout', () => {
    const onCheckout = vi.fn().mockResolvedValue(undefined)

    render(
      <SubscriptionPanel
        account={account}
        country={country}
        onCancelScheduledChange={vi.fn()}
        onCheckout={onCheckout}
        subscriptionState={subscription}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply for Organisation access' }))

    expect(screen.getByRole('heading', { name: 'Tell us about your business' })).toBeTruthy()
    expect(screen.getByLabelText('Registered business name')).toBeTruthy()
    expect((screen.getByLabelText('Contact email') as HTMLInputElement).value).toBe(
      'owner@example.co.za',
    )
    expect(onCheckout).not.toHaveBeenCalled()
  })
})

describe('current subscription controls', () => {
  it('shows cancellation directly on the current paid plan', () => {
    const onCheckout = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <SubscriptionPanel
        account={paidAccount}
        country={country}
        onCancelScheduledChange={vi.fn()}
        onCheckout={onCheckout}
        subscriptionState={paidSubscription}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }))

    expect(onCheckout).toHaveBeenCalledWith('free', 'monthly')
  })
})

const account: MemberAccount = {
  countryCode: 'ZA',
  countryName: 'South Africa',
  createdAt: '2026-07-26T00:00:00.000Z',
  currencyCode: 'ZAR',
  displayName: 'Thandi Nkosi',
  email: 'owner@example.co.za',
  id: 'member-1',
  initials: 'TN',
  planId: 'free',
  planName: 'Free',
  planStatus: 'active',
  propertiesAccess: false,
  status: 'active' as const,
  role: 'member',
  updatedAt: '2026-07-26T00:00:00.000Z',
}

const country: CountryContext = {
  code: 'ZA',
  currencyCode: 'ZAR',
  flag: '🇿🇦',
  locale: 'en-ZA',
  name: 'South Africa',
}

const paidAccount: MemberAccount = {
  ...account,
  billingCycle: 'monthly',
  planId: 'scout',
  planName: 'Scout',
}

const paidSubscription: ResourceState<SubscriptionResource> = {
  data: {
    account: paidAccount,
    billingReady: true,
    businessApplications: [],
    plans: [
      {
        badge: 'Paid',
        description: 'More room for one shopper.',
        features: ['Larger saved lists'],
        id: 'scout',
        isPaid: true,
        limits: {
          basketItems: 100,
          savedDeals: 100,
          savedSources: 20,
          visibleCatalogues: 20,
          visibleDeals: 1000,
        },
        name: 'Scout',
        prices: { annual: 29000, monthly: 2900 },
        statusText: 'Available',
      },
    ],
  },
  message: 'Subscription loaded.',
  meta: {
    generatedAt: '2026-07-26T00:00:00.000Z',
    source: 'cloudflare-pages',
  },
  status: 'ready',
}

const subscription: ResourceState<SubscriptionResource> = {
  data: {
    account,
    billingReady: true,
    businessApplications: [],
    plans: [{
      badge: 'For businesses',
      description: 'Business publishing tools.',
      features: ['Business workspace'],
      id: 'organization',
      isPaid: true,
      limits: {
        basketItems: 1000,
        savedDeals: 1000,
        savedSources: 1000,
        visibleCatalogues: 5_000,
        visibleDeals: 1_000_000,
      },
      name: 'Organisation',
      prices: { annual: 499000, monthly: 49900 },
      statusText: 'Application required',
    }],
  },
  message: 'Subscription loaded.',
  meta: {
    generatedAt: '2026-07-26T00:00:00.000Z',
    source: 'cloudflare-pages',
  },
  status: 'ready',
}
