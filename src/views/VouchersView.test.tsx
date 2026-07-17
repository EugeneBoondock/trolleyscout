import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Voucher } from '../services/vouchers/types'
import { VouchersView } from './VouchersView'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
})

describe('VouchersView', () => {
  const voucher: Voucher = {
    accountRequired: false,
    benefitText: 'Save R25 on groceries',
    capturedAt: '2026-07-16T10:00:00.000Z',
    claimed: false,
    code: 'SAVE25',
    createdAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Official retailer voucher.',
    expiresAt: '2026-07-31T21:59:59.999Z',
    externalId: 'winter-25',
    id: 'voucher-1',
    imageUrl: 'https://www.shoprite.co.za/voucher.jpg',
    lastSeenAt: '2026-07-16T10:00:00.000Z',
    publicReusable: true,
    redemptionMode: 'code',
    redemptionUrl: 'https://www.shoprite.co.za/shop',
    retailerId: 'shoprite',
    sourceUrl: 'https://www.shoprite.co.za/vouchers',
    status: 'active',
    title: 'Winter voucher',
    updatedAt: '2026-07-16T10:00:00.000Z',
    validTo: '2026-07-31',
    voucherKind: 'public_code',
  }

  it('shows code, benefit, validity, and saves inside the platform', () => {
    const onClaim = vi.fn()
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={onClaim}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[voucher]}
      />,
    )

    expect(screen.getByText('SAVE25')).toBeTruthy()
    expect(screen.getByText('Save R25 on groceries')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save voucher' }))
    expect(onClaim).toHaveBeenCalledWith('voucher-1')
  })

  it('opens authentication before an anonymous save', () => {
    const onRequireAuth = vi.fn()
    render(
      <VouchersView
        isAuthenticated={false}
        isLoading={false}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
        onRequireAuth={onRequireAuth}
        vouchers={[voucher]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save voucher' }))
    expect(onRequireAuth).toHaveBeenCalled()
  })

  it('filters vouchers and removes em dashes from every visible source field', () => {
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[{
          ...voucher,
          benefitText: 'Save R25\u2014today',
          code: 'SAVE\u201425',
          retailerId: 'shop\u2014rite',
          title: 'Winter voucher\u2014Gauteng',
          validTo: '2026\u201407\u201431',
        }]}
      />,
    )

    expect(document.body.textContent).not.toContain('\u2014')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } })
    expect(screen.getByRole('status').textContent).toContain('No vouchers match those filters.')
  })

  it('never displays a code that is not marked public and reusable', () => {
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[{
          ...voucher,
          code: 'PRIVATE25',
          publicReusable: false,
          voucherKind: 'loyalty_offer',
        }]}
      />,
    )

    expect(screen.queryByText('PRIVATE25')).toBeNull()
    expect(screen.queryByRole('button', { name: /copy voucher code/i })).toBeNull()
  })

  it('does not render unsafe image or redemption URLs', () => {
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[{
          ...voucher,
          imageUrl: 'javascript:alert(1)',
          redemptionUrl: 'javascript:alert(1)',
        }]}
      />,
    )

    expect(screen.queryByRole('link', { name: /redeem at retailer/i })).toBeNull()
    expect(document.querySelector('.voucher-image[src]')).toBeNull()
  })

  it('announces copy success and failure', async () => {
    const writeText = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Clipboard access denied'))
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[voucher]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy voucher code SAVE25' }))
    expect((await screen.findByRole('status')).textContent).toContain('Voucher code copied.')

    fireEvent.click(screen.getByRole('button', { name: /voucher code copied/i }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not copy this voucher code.',
    )
  })

  it('blocks repeated save actions while the first request is pending', async () => {
    let finishClaim: (() => void) | undefined
    const pendingClaim = new Promise<void>((resolve) => { finishClaim = resolve })
    const onClaim = vi.fn(() => pendingClaim)
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={onClaim}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[voucher]}
      />,
    )

    const saveButton = screen.getByRole('button', { name: 'Save voucher' }) as HTMLButtonElement
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)

    expect(onClaim).toHaveBeenCalledTimes(1)
    expect(saveButton.disabled).toBe(true)
    expect(saveButton.getAttribute('aria-busy')).toBe('true')

    finishClaim?.()
    await waitFor(() => expect(saveButton.disabled).toBe(false))
  })

  it('announces a failed save without exposing the raw error', async () => {
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={vi.fn().mockRejectedValue(new Error('secret backend detail'))}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[voucher]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save voucher' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not update this saved voucher.',
    )
    expect(document.body.textContent).not.toContain('secret backend detail')
  })

  it('lets long public codes wrap inside narrow voucher cards', () => {
    const longCode = 'SAVE' + '1234567890'.repeat(9)
    render(
      <VouchersView
        isAuthenticated
        isLoading={false}
        onClaim={vi.fn()}
        onRemove={vi.fn()}
        onRequireAuth={vi.fn()}
        vouchers={[{ ...voucher, code: longCode }]}
      />,
    )

    const code = screen.getByText(longCode) as HTMLElement
    expect(code.style.overflowWrap).toBe('anywhere')
    expect(code.style.minWidth).toBe('0px')
  })
})
