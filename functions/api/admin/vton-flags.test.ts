import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
}))
vi.mock('../../_shared/memberStore', () => ({ getMemberSession: mocks.getMemberSession }))

import { onRequest } from './vton-flags'

interface FakeDbState {
  global?: { enabled: number }
  overrides: Array<{ account_id: string; enabled: number; updated_at: string }>
}

function makeDb(state: FakeDbState) {
  return {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        first: async () => (sql.includes('feature_flags') ? (state.global ?? null) : null),
        all: async () => ({ results: state.overrides }),
        run: async () => {
          if (sql.includes('member_feature_overrides')) {
            const [accountId, , enabled, updatedAt] = values as [string, string, number, string]
            state.overrides = [
              { account_id: accountId, enabled, updated_at: updatedAt },
              ...state.overrides.filter((row) => row.account_id !== accountId),
            ]
          } else {
            const [, enabled] = values as [string, number]
            state.global = { enabled }
          }
          return {}
        },
      }),
    }),
  }
}

function invoke(db: unknown, init?: RequestInit) {
  const request = new Request('https://trolleyscout.co.za/api/admin/vton-flags', init)
  return onRequest({ env: { DB: db }, request } as never)
}

function patch(db: unknown, body: Record<string, unknown>) {
  return invoke(db, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: 'https://trolleyscout.co.za' },
    method: 'PATCH',
  })
}

describe('/api/admin/vton-flags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ account: { role: 'admin' } })
  })

  it('stays admin-only', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: { role: 'member' } })
    const response = await invoke(makeDb({ overrides: [] }))
    expect(response.status).toBe(403)
  })

  it('reports the fitting room enabled before any flag row exists', async () => {
    const response = await invoke(makeDb({ overrides: [] }))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      data: { globalEnabled: boolean; overrides: unknown[] }
    }
    expect(payload.data.globalEnabled).toBe(true)
    expect(payload.data.overrides).toEqual([])
  })

  it('flips the global switch off', async () => {
    const db = makeDb({ overrides: [] })
    const response = await patch(db, { enabled: false })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: { globalEnabled: boolean } }
    expect(payload.data.globalEnabled).toBe(false)
  })

  it('stores a per-member override and lists it back', async () => {
    const db = makeDb({ overrides: [] })
    const response = await patch(db, { accountId: 'member-9', enabled: false })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      data: { overrides: Array<{ accountId: string; enabled: boolean }> }
    }
    expect(payload.data.overrides).toHaveLength(1)
    expect(payload.data.overrides[0].accountId).toBe('member-9')
    expect(payload.data.overrides[0].enabled).toBe(false)
  })

  it('refuses a PATCH without an enabled boolean', async () => {
    const response = await patch(makeDb({ overrides: [] }), { accountId: 'member-9' })
    expect(response.status).toBe(400)
  })
})
