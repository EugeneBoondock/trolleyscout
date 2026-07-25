// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { logInMember, signUpMember } from './memberStore'

// 0002 creates member_accounts and 0008 adds its credentials; both touch
// nothing else, so they run as written.
const MIGRATIONS = [
  '../../migrations/0002_membership.sql',
  '../../migrations/0006_payfast_billing.sql',
  '../../migrations/0008_auth_roles.sql',
  '../../migrations/0024_support_and_billing_cleanup.sql',
  '../../migrations/0025_scheduled_plan_changes.sql',
]

// The remaining columns arrive in 0020, 0026 and 0031, each of which also
// alters tables belonging to store and property caches this file never
// touches. They are declared here exactly as those migrations declare them —
// including the NOT NULL DEFAULT 'ZA' that is the whole reason this behaviour
// needed fixing.
const COUNTRY_COLUMNS = [
  'ALTER TABLE member_accounts ADD COLUMN properties_access INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE member_accounts ADD COLUMN email_lookup TEXT',
  "ALTER TABLE member_accounts ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA'",
  "ALTER TABLE member_accounts ADD COLUMN country_name TEXT NOT NULL DEFAULT 'South Africa'",
  "ALTER TABLE member_accounts ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'ZAR'",
  'ALTER TABLE member_accounts ADD COLUMN country_confirmed_at TEXT',
]

const netherlands = {
  code: 'NL',
  currencyCode: 'EUR',
  flag: '',
  name: 'Netherlands',
}

const southAfrica = {
  code: 'ZA',
  currencyCode: 'ZAR',
  flag: '',
  name: 'South Africa',
}

describe('member country confirmation', () => {
  let miniflare: Miniflare
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: ':memory:' },
      modules: true,
      script: 'export default { fetch: () => new Response("ok") }',
    })
    const db = await miniflare.getD1Database('DB')
    env = {
      DB: db,
      EMAIL_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    } as unknown as TrolleyScoutEnv & { DB: D1Database }

    for (const path of MIGRATIONS) {
      const migration = (
        await readFile(new NodeUrl(path, import.meta.url), 'utf8')
      ).replace(/^--.*$/gm, '')

      for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
        await db.prepare(statement).run()
      }
    }

    for (const statement of COUNTRY_COLUMNS) {
      await db.prepare(statement).run()
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  // Stored emails are ciphertext, so the one account each test creates is read
  // back directly rather than looked up by address.
  async function readCountry() {
    return (await env.DB.prepare(
      `SELECT country_code, currency_code, country_confirmed_at FROM member_accounts`,
    ).first<{ country_code: string; country_confirmed_at: string | null; currency_code: string }>())
  }

  it('settles the country of an account that was only ever defaulted', async () => {
    await signUpMember(env, {
      country: southAfrica,
      displayName: 'Ronald',
      email: 'ronald@example.test',
      password: 'Sufficiently-Long-Pass1',
    })

    // The state migration 0026 left behind: a country that is only the column
    // default, indistinguishable from a chosen one until now.
    await env.DB.prepare('UPDATE member_accounts SET country_confirmed_at = NULL').run()

    await logInMember(env, {
      country: netherlands,
      email: 'ronald@example.test',
      password: 'Sufficiently-Long-Pass1',
    })

    const row = await readCountry()
    expect(row).toMatchObject({ country_code: 'NL', currency_code: 'EUR' })
    expect(row?.country_confirmed_at).toBeTruthy()
  })

  // Once settled it stays settled: re-detecting on every sign-in moved
  // travellers and anyone on a VPN to the wrong catalogue and currency.
  it('leaves a settled country alone when the member signs in from elsewhere', async () => {
    await signUpMember(env, {
      country: netherlands,
      displayName: 'Ronald',
      email: 'ronald@example.test',
      password: 'Sufficiently-Long-Pass1',
    })

    await logInMember(env, {
      country: southAfrica,
      email: 'ronald@example.test',
      password: 'Sufficiently-Long-Pass1',
    })

    expect(await readCountry()).toMatchObject({
      country_code: 'NL',
      currency_code: 'EUR',
    })
  })

  it('settles a new account where it was opened', async () => {
    await signUpMember(env, {
      country: netherlands,
      displayName: 'Ronald',
      email: 'ronald@example.test',
      password: 'Sufficiently-Long-Pass1',
    })

    const row = await readCountry()
    expect(row).toMatchObject({ country_code: 'NL', currency_code: 'EUR' })
    expect(row?.country_confirmed_at).toBeTruthy()
  })
})
