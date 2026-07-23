import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claimVoucher: vi.fn(),
  countActiveVouchers: vi.fn(),
  getMemberSession: vi.fn(),
  listActiveVouchers: vi.fn(),
  unclaimVoucher: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/voucherStore', () => ({
  claimVoucher: mocks.claimVoucher,
  countActiveVouchers: mocks.countActiveVouchers,
  listActiveVouchers: mocks.listActiveVouchers,
  unclaimVoucher: mocks.unclaimVoucher,
}))

import { onRequest } from './vouchers'

describe('/api/vouchers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.countActiveVouchers.mockResolvedValue(12)
    mocks.listActiveVouchers.mockResolvedValue([{ id: 'voucher-1', claimed: false }])
  })

  it('lists active vouchers for anonymous visitors', async () => {
    const response = await invoke(new Request('https://trolleyscout.co.za/api/vouchers'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { vouchers: [{ id: 'voucher-1', claimed: false }] },
    })
    expect(mocks.listActiveVouchers).toHaveBeenCalledWith(expect.anything(), {
      accountId: undefined,
      limit: 100,
      offset: 0,
      retailerId: undefined,
    })
  })

  it('returns only the active count for dashboard summaries', async () => {
    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/vouchers?summary=1',
    ))

    expect(await response.json()).toMatchObject({
      data: { summary: { activeVoucherCount: 12 }, vouchers: [] },
    })
    expect(mocks.listActiveVouchers).not.toHaveBeenCalled()
  })

  it('does not expose internal code hashes in the public voucher envelope', async () => {
    mocks.listActiveVouchers.mockResolvedValue([{
      code: 'SAVE25',
      codeHash: 'a'.repeat(64),
      id: 'voucher-1',
      publicReusable: true,
    }])

    const response = await invoke(new Request('https://trolleyscout.co.za/api/vouchers'))
    const envelope = await response.json() as { data: { vouchers: Record<string, unknown>[] } }

    expect(envelope.data.vouchers[0]).toMatchObject({ code: 'SAVE25', id: 'voucher-1' })
    expect(envelope.data.vouchers[0]).not.toHaveProperty('codeHash')
  })

  it('uses the member account when listing and claiming vouchers', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { id: 'member-1' }, isAuthenticated: true })
    mocks.claimVoucher.mockResolvedValue({ claimed: true, voucherId: 'voucher-1' })

    const response = await invoke(new Request('https://trolleyscout.co.za/api/vouchers', {
      body: JSON.stringify({ voucherId: 'voucher-1' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(mocks.claimVoucher).toHaveBeenCalledWith(expect.anything(), 'member-1', 'voucher-1')
  })

  it('rejects a cross-origin voucher mutation', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { id: 'member-1' }, isAuthenticated: true })

    const response = await invoke(new Request('https://trolleyscout.co.za/api/vouchers', {
      body: JSON.stringify({ voucherId: 'voucher-1' }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      method: 'POST',
    }))

    expect(response.status).toBe(403)
    expect(mocks.claimVoucher).not.toHaveBeenCalled()
  })

  it('rejects malformed retailer filters instead of returning an unfiltered list', async () => {
    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/vouchers?retailerId=../admin',
    ))

    expect(response.status).toBe(400)
    expect(mocks.listActiveVouchers).not.toHaveBeenCalled()
  })

  it('rejects an oversized claim body before JSON parsing', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { id: 'member-1' }, isAuthenticated: true })
    const response = await invoke(new Request('https://trolleyscout.co.za/api/vouchers', {
      body: JSON.stringify({ voucherId: 'x'.repeat(12_000) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(413)
    expect(mocks.claimVoucher).not.toHaveBeenCalled()
  })

  it('returns 401 when an anonymous visitor tries to claim', async () => {
    const response = await invoke(new Request('https://trolleyscout.co.za/api/vouchers', {
      body: JSON.stringify({ voucherId: 'voucher-1' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(401)
    expect(mocks.claimVoucher).not.toHaveBeenCalled()
  })

  it('removes a saved voucher for its member', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { id: 'member-1' }, isAuthenticated: true })
    mocks.unclaimVoucher.mockResolvedValue(true)
    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/vouchers?voucherId=voucher-1',
      { method: 'DELETE' },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { removed: true, voucherId: 'voucher-1' },
    })
  })

  it('rejects an oversized voucher ID before removing a claim', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { id: 'member-1' }, isAuthenticated: true })
    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/vouchers?voucherId=' + 'x'.repeat(201),
      { method: 'DELETE' },
    ))

    expect(response.status).toBe(400)
    expect(mocks.unclaimVoucher).not.toHaveBeenCalled()
  })
})

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
