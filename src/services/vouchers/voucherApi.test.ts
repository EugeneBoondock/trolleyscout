import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimVoucher, loadVouchers, removeVoucherClaim } from './voucherApi'

afterEach(() => vi.unstubAllGlobals())

const voucherPayload = {
  accountRequired: false,
  benefitText: 'Save R25 on groceries',
  capturedAt: '2026-07-16T10:00:00.000Z',
  claimed: false,
  code: 'SAVE25',
  codeHash: 'server-only-hash',
  createdAt: '2026-07-16T10:00:00.000Z',
  evidenceText: 'Official retailer voucher.',
  expiresAt: '2026-07-31T21:59:59.999Z',
  externalId: 'winter-25',
  id: 'voucher-1',
  imageUrl: 'https://www.shoprite.co.za/voucher.jpg',
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
}

describe('voucher API client', () => {
  it('loads the voucher envelope and forwards filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      data: { vouchers: [voucherPayload] },
      meta: { generatedAt: '2026-07-16T10:00:00.000Z', source: 'cloudflare-pages' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const vouchers = await loadVouchers({ retailerId: 'shoprite' })

    expect(vouchers).toEqual([expect.objectContaining({
      id: 'voucher-1',
      title: 'Winter voucher',
    })])
    expect(vouchers[0]).not.toHaveProperty('codeHash')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vouchers?retailerId=shoprite',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('claims and removes vouchers through the member session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { claimed: true, voucherId: 'voucher-1' } }))
      .mockResolvedValueOnce(Response.json({ data: { removed: true, voucherId: 'voucher-1' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(claimVoucher('voucher-1')).resolves.toBe(true)
    await expect(removeVoucherClaim('voucher-1')).resolves.toBe(true)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' })
  })

  it('surfaces an API issue instead of treating a failed claim as saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { issues: ['Sign in before saving a voucher.'] },
    }), { status: 401 })))

    await expect(claimVoucher('voucher-1')).rejects.toThrow('Sign in before saving a voucher.')
  })

  it('reports the HTTP status when a failed response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>Bad gateway</h1>', {
      headers: { 'content-type': 'text/html' },
      status: 502,
    })))

    await expect(loadVouchers()).rejects.toThrow('Voucher API returned 502.')
  })

  it('rejects a successful response with a malformed voucher envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: {} })))

    await expect(loadVouchers()).rejects.toThrow('Voucher API returned malformed data.')
  })

  it('rejects voucher responses that exceed the public response cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      data: { vouchers: Array.from({ length: 201 }, () => voucherPayload) },
    })))

    await expect(loadVouchers()).rejects.toThrow('Voucher API returned malformed data.')
  })

  it('rejects unsafe URLs and private codes in voucher data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      data: {
        vouchers: [{
          ...voucherPayload,
          code: 'PRIVATE25',
          publicReusable: false,
          redemptionUrl: 'javascript:alert(1)',
        }],
      },
    })))

    await expect(loadVouchers()).rejects.toThrow('Voucher API returned malformed data.')
  })

  it('rejects malformed successful mutation results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      data: { claimed: 'yes', voucherId: 'voucher-1' },
    })))

    await expect(claimVoucher('voucher-1')).rejects.toThrow(
      'Voucher API returned malformed data.',
    )
  })
})
