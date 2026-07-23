// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { getMemberSession } from './memberStore'

describe('admin country testing override', () => {
  it('applies a valid request override to an admin session without changing the stored account', async () => {
    const storedRow = accountRow('admin')
    const env = mockEnv(storedRow)
    const request = new Request('https://trolleyscout.co.za/api/country', {
      headers: {
        cookie: 'ts_member_session=session-token',
        'x-trolley-scout-test-country': 'ZW',
      },
    })

    const session = await getMemberSession(env, request)

    expect(session.account).toMatchObject({
      countryCode: 'ZW',
      countryName: 'Zimbabwe',
      currencyCode: 'ZWG',
      role: 'admin',
    })
    expect(storedRow.country_code).toBe('ZA')
  })

  it('ignores a country override from a non-admin session', async () => {
    const session = await getMemberSession(
      mockEnv(accountRow('member')),
      new Request('https://trolleyscout.co.za/api/country', {
        headers: {
          cookie: 'ts_member_session=session-token',
          'x-trolley-scout-test-country': 'ZW',
        },
      }),
    )

    expect(session.account).toMatchObject({
      countryCode: 'ZA',
      countryName: 'South Africa',
      currencyCode: 'ZAR',
      role: 'member',
    })
  })

  it('restores an admin country override from the secure web cookie', async () => {
    const session = await getMemberSession(
      mockEnv(accountRow('admin')),
      new Request('https://trolleyscout.co.za/api/country', {
        headers: {
          cookie: 'ts_member_session=session-token; ts_admin_country=ZW',
        },
      }),
    )

    expect(session.account).toMatchObject({
      countryCode: 'ZW',
      countryName: 'Zimbabwe',
      currencyCode: 'ZWG',
    })
  })
})

function accountRow(role: 'admin' | 'member') {
  return {
    billing_cycle: null,
    country_code: 'ZA',
    country_name: 'South Africa',
    created_at: '2026-07-01T00:00:00.000Z',
    currency_code: 'ZAR',
    current_period_end: null,
    display_name: 'Test Admin',
    email: 'test-admin@example.com',
    email_lookup: null,
    id: 'account-1',
    pending_billing_cycle: null,
    pending_effective_at: null,
    pending_plan_id: null,
    plan_id: 'free',
    plan_status: 'active',
    properties_access: 1,
    role,
    updated_at: '2026-07-01T00:00:00.000Z',
  }
}

function mockEnv(row: ReturnType<typeof accountRow>): TrolleyScoutEnv {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => row,
        }),
      }),
    } as unknown as D1Database,
  }
}
