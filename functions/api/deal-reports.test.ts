import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  submitDealReport: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({ getMemberSession: mocks.getMemberSession }))
vi.mock('../_shared/dealReportStore', () => ({ submitDealReport: mocks.submitDealReport }))

import { onRequest } from './deal-reports'

describe('/api/deal-reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
  })

  it('requires a signed-in shopper', async () => {
    const response = await invoke(request())
    expect(response.status).toBe(401)
    expect(mocks.submitDealReport).not.toHaveBeenCalled()
  })

  it('uses the member market and source details', async () => {
    mocks.getMemberSession.mockResolvedValue({
      account: { countryCode: 'BW', id: 'member-1' },
      isAuthenticated: true,
    })
    mocks.submitDealReport.mockResolvedValue({ report: { id: 'report-1' } })

    const response = await invoke(request())

    expect(response.status).toBe(200)
    expect(mocks.submitDealReport).toHaveBeenCalledWith(expect.anything(), 'member-1', 'BW', {
      dealId: 'deal-1',
      note: undefined,
      productUrl: 'https://shop.example/product/1',
      reason: 'price_wrong',
      retailerId: 'shop',
      retailerName: 'Shop',
      sourceUrl: 'https://shop.example/specials',
      title: 'Rice 2 kg',
    })
  })

  it('rejects a foreign mutation origin', async () => {
    const input = request('https://other.example')
    const response = await invoke(input)
    expect(response.status).toBe(403)
  })
})

function request(origin = 'https://trolleyscout.co.za') {
  return new Request('https://trolleyscout.co.za/api/deal-reports', {
    body: JSON.stringify({
      dealId: 'deal-1',
      productUrl: 'https://shop.example/product/1',
      reason: 'price_wrong',
      retailerId: 'shop',
      retailerName: 'Shop',
      sourceUrl: 'https://shop.example/specials',
      title: 'Rice 2 kg',
    }),
    headers: { 'content-type': 'application/json', origin },
    method: 'POST',
  })
}

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
