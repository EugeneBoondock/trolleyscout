import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  listDealReports: vi.fn(),
  moderateDealReport: vi.fn(),
}))
vi.mock('../../_shared/memberStore', () => ({ getMemberSession: mocks.getMemberSession }))
vi.mock('../../_shared/dealReportStore', () => ({
  listDealReports: mocks.listDealReports,
  moderateDealReport: mocks.moderateDealReport,
}))

import { onRequest } from './deal-reports'

describe('/api/admin/deal-reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ account: { role: 'member' } })
    mocks.listDealReports.mockResolvedValue([])
  })

  it('keeps the moderation queue admin-only', async () => {
    const response = await invoke(new Request('https://trolleyscout.co.za/api/admin/deal-reports'))
    expect(response.status).toBe(403)
  })

  it('lists pending reports for an admin', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { role: 'admin' } })
    const response = await invoke(new Request('https://trolleyscout.co.za/api/admin/deal-reports'))
    expect(response.status).toBe(200)
    expect(mocks.listDealReports).toHaveBeenCalledWith(expect.anything(), 'pending')
  })

  it('reviews a report and returns the remaining queue', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { role: 'admin' } })
    mocks.moderateDealReport.mockResolvedValue({ changed: true })
    const response = await invoke(new Request('https://trolleyscout.co.za/api/admin/deal-reports', {
      body: JSON.stringify({ id: 'report-1', status: 'confirmed' }),
      headers: { 'content-type': 'application/json', origin: 'https://trolleyscout.co.za' },
      method: 'PATCH',
    }))
    expect(response.status).toBe(200)
    expect(mocks.moderateDealReport).toHaveBeenCalledWith(expect.anything(), 'report-1', 'confirmed')
  })
})

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
