import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import App from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    addEventListener: vi.fn(),
    matches: false,
    media: '',
    removeEventListener: vi.fn(),
  })))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = typeof input === 'string' ? input : input.toString()
    if (path.startsWith('/api/vouchers')) {
      return new Response(JSON.stringify({
        data: {
          vouchers: [{
            accountRequired: false,
            benefitText: 'Save R25 on groceries',
            capturedAt: '2026-07-16T10:00:00.000Z',
            claimed: false,
            code: 'SAVE25',
            createdAt: '2026-07-16T10:00:00.000Z',
            evidenceText: 'Official voucher page.',
            expiresAt: '2026-07-31T21:59:59.999Z',
            externalId: 'winter-25',
            id: 'voucher-1',
            lastSeenAt: '2026-07-16T10:00:00.000Z',
            publicReusable: true,
            redemptionMode: 'code',
            redemptionUrl: 'https://www.shoprite.co.za/vouchers/winter-25',
            retailerId: 'shoprite',
            sourceUrl: 'https://www.shoprite.co.za/vouchers',
            status: 'active',
            title: 'Winter voucher',
            updatedAt: '2026-07-16T10:00:00.000Z',
            validTo: '2026-07-31',
            voucherKind: 'public_code',
          }],
        },
      }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: 'Unavailable in test.' }), { status: 503 })
  }))
})

it('opens the public voucher board from the main navigation', async () => {
  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: 'Vouchers' }))

  expect(await screen.findByRole('heading', { name: 'Current retailer vouchers' })).toBeTruthy()
  expect(await screen.findByText('SAVE25')).toBeTruthy()
})
