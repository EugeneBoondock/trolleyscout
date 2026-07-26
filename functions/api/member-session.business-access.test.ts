import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  logInMember: vi.fn(),
  signUpMember: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  clearMemberCookie: vi.fn(),
  deleteMemberSession: vi.fn(),
  getMemberSession: mocks.getMemberSession,
  logInMember: mocks.logInMember,
  setMemberCookie: vi.fn(() => 'member_session=test'),
  signUpMember: mocks.signUpMember,
}))

import { onRequest } from './member-session'

describe('/api/member-session business access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.signUpMember.mockResolvedValue({
      account: { id: 'member-1', role: 'member' },
      token: 'session-token',
    })
  })

  it('refuses account creation on the business domain', async () => {
    const response = await invoke(new Request(
      'https://org.trolleyscout.co.za/api/member-session',
      {
        body: JSON.stringify({
          displayName: 'Thandi Nkosi',
          email: 'owner@example.co.za',
          intent: 'signup',
          password: 'safe-password',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      data: {
        issues: [expect.stringContaining('Subscribe and apply')],
        session: { isAuthenticated: false },
      },
    })
    expect(mocks.signUpMember).not.toHaveBeenCalled()
  })

  it('keeps sign-in available on the business domain', async () => {
    mocks.logInMember.mockResolvedValue({
      account: { id: 'member-1', role: 'member' },
      token: 'session-token',
    })

    const response = await invoke(new Request(
      'https://org.trolleyscout.co.za/api/member-session',
      {
        body: JSON.stringify({
          email: 'owner@example.co.za',
          intent: 'login',
          password: 'safe-password',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ))

    expect(response.status).toBe(200)
    expect(mocks.logInMember).toHaveBeenCalledOnce()
  })
})

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
