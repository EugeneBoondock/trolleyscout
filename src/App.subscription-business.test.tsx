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

afterEach(cleanup)

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
      limits: { basketItems: 1000, savedDeals: 1000, savedSources: 1000 },
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
