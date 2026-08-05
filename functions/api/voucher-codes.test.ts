import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  listVoucherCodes: vi.fn(),
  submitVoucherCode: vi.fn(),
  voteVoucherCode: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/voucherCodeStore', () => ({
  listVoucherCodes: mocks.listVoucherCodes,
  submitVoucherCode: mocks.submitVoucherCode,
  voteVoucherCode: mocks.voteVoucherCode,
}))

import { onRequest } from './voucher-codes'

describe('/api/voucher-codes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.listVoucherCodes.mockResolvedValue([])
  })

  it('lists only codes for the detected market', async () => {
    const response = await invoke(new Request('https://trolleyscout.co.za/api/voucher-codes'))

    expect(response.status).toBe(200)
    expect(mocks.listVoucherCodes).toHaveBeenCalledWith(expect.anything(), {
      accountId: undefined,
      countryCode: 'ZA',
      retailerId: undefined,
    })
  })

  it('uses the signed-in member market instead of the request location', async () => {
    mocks.getMemberSession.mockResolvedValue({
      account: { countryCode: 'ZW', id: 'member-1' },
      isAuthenticated: true,
    })

    await invoke(new Request('https://trolleyscout.co.za/api/voucher-codes'))

    expect(mocks.listVoucherCodes).toHaveBeenCalledWith(expect.anything(), {
      accountId: 'member-1',
      countryCode: 'ZW',
      retailerId: undefined,
    })
  })

  it('stamps a member submission with the member market', async () => {
    mocks.getMemberSession.mockResolvedValue({
      account: { countryCode: 'BW', id: 'member-1' },
      isAuthenticated: true,
    })
    mocks.submitVoucherCode.mockResolvedValue({ voucherCode: { id: 'code-1' } })

    const response = await invoke(new Request('https://trolleyscout.co.za/api/voucher-codes', {
      body: JSON.stringify({
        benefitText: 'R50 off',
        code: 'SAVE50',
        retailerId: 'choppies',
      }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://trolleyscout.co.za',
      },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(mocks.submitVoucherCode).toHaveBeenCalledWith(expect.anything(), {
      benefitText: 'R50 off',
      code: 'SAVE50',
      countryCode: 'BW',
      minimumSpendText: undefined,
      retailerId: 'choppies',
      termsText: undefined,
      validTo: undefined,
    }, 'member-1')
  })

  it('requires authentication before accepting crowd signals', async () => {
    const response = await invoke(new Request('https://trolleyscout.co.za/api/voucher-codes', {
      body: JSON.stringify({ action: 'vote', voucherCodeId: 'code-1', worked: true }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://trolleyscout.co.za',
      },
      method: 'POST',
    }))

    expect(response.status).toBe(401)
    expect(mocks.voteVoucherCode).not.toHaveBeenCalled()
  })

  it('scopes a crowd signal to the member market', async () => {
    mocks.getMemberSession.mockResolvedValue({
      account: { countryCode: 'MZ', id: 'member-1' },
      isAuthenticated: true,
    })
    mocks.voteVoucherCode.mockResolvedValue({ voucherCode: { id: 'code-1' } })

    const response = await invoke(new Request('https://trolleyscout.co.za/api/voucher-codes', {
      body: JSON.stringify({ action: 'vote', voucherCodeId: 'code-1', worked: true }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://trolleyscout.co.za',
      },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(mocks.voteVoucherCode).toHaveBeenCalledWith(
      expect.anything(),
      'code-1',
      'member-1',
      true,
      'MZ',
    )
  })
})

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
