import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  getNotificationPreferences: vi.fn(),
  readDealAlertSummary: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/notificationStore', () => ({
  getNotificationPreferences: mocks.getNotificationPreferences,
}))

vi.mock('../_shared/dealAlertStore', () => ({
  readDealAlertSummary: mocks.readDealAlertSummary,
}))

import { onRequest } from './deal-alerts'

describe('/api/deal-alerts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getMemberSession.mockResolvedValue({ account: account() })
    mocks.getNotificationPreferences.mockResolvedValue({ newDeals: true })
    mocks.readDealAlertSummary.mockResolvedValue({
      countCapped: false,
      latestCursor: 14,
      totalNewDealCount: 0,
    })
  })

  it('requires an authenticated member', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: undefined })

    const response = await invoke('https://trolleyscout.co.za/api/deal-alerts')
    const envelope = await response.json() as { data: { issues: string[] } }

    expect(response.status).toBe(401)
    expect(envelope.data.issues[0]).toMatch(/sign in/i)
    expect(mocks.getNotificationPreferences).not.toHaveBeenCalled()
    expect(mocks.readDealAlertSummary).not.toHaveBeenCalled()
  })

  it('requires the member to opt into new-deal alerts', async () => {
    mocks.getNotificationPreferences.mockResolvedValue({ newDeals: false })

    const response = await invoke('https://trolleyscout.co.za/api/deal-alerts?after=2')
    const envelope = await response.json() as {
      data: { enabled: boolean; issues: string[] }
    }

    expect(response.status).toBe(403)
    expect(envelope.data.enabled).toBe(false)
    expect(envelope.data.issues[0]).toMatch(/turn on/i)
    expect(mocks.readDealAlertSummary).not.toHaveBeenCalled()
  })

  it('establishes a zero-count baseline when after is omitted', async () => {
    const response = await invoke('https://trolleyscout.co.za/api/deal-alerts')
    const envelope = await response.json() as {
      data: {
        countCapped: boolean
        enabled: boolean
        latestCursor: number
        totalNewDealCount: number
      }
    }

    expect(response.status).toBe(200)
    expect(mocks.readDealAlertSummary).toHaveBeenCalledWith({ DB: {} }, undefined)
    expect(envelope.data).toEqual({
      countCapped: false,
      enabled: true,
      latestCursor: 14,
      totalNewDealCount: 0,
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('returns the total new deals after a device cursor', async () => {
    mocks.readDealAlertSummary.mockResolvedValue({
      countCapped: false,
      latestCursor: 18,
      totalNewDealCount: 27,
    })

    const response = await invoke('https://trolleyscout.co.za/api/deal-alerts?after=14')
    const envelope = await response.json() as {
      data: { latestCursor: number; totalNewDealCount: number }
    }

    expect(response.status).toBe(200)
    expect(mocks.readDealAlertSummary).toHaveBeenCalledWith({ DB: {} }, 14)
    expect(envelope.data.latestCursor).toBe(18)
    expect(envelope.data.totalNewDealCount).toBe(27)
  })

  it.each(['-1', '1.5', 'abc', '9007199254740992', '12345678901234567'])(
    'rejects an unsafe after cursor: %s',
    async (after) => {
      const response = await invoke(
        `https://trolleyscout.co.za/api/deal-alerts?after=${after}`,
      )

      expect(response.status).toBe(400)
      expect(mocks.readDealAlertSummary).not.toHaveBeenCalled()
    },
  )

  it('allows GET only', async () => {
    const response = await invoke(
      'https://trolleyscout.co.za/api/deal-alerts',
      'POST',
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  })
})

function account() {
  return {
    createdAt: '2026-07-19T10:00:00.000Z',
    displayName: 'Deal Shopper',
    email: 'shopper@example.test',
    id: 'account-1',
    initials: 'DS',
    planId: 'free',
    planName: 'Free',
    planStatus: 'active',
    propertiesAccess: false,
    role: 'member',
    updatedAt: '2026-07-19T10:00:00.000Z',
  }
}

function invoke(url: string, method = 'GET') {
  return onRequest({
    env: { DB: {} },
    request: new Request(url, { method }),
  } as never)
}
