// Resetting a forgotten password, by emailing a one-time code.
//
// This was deferred for a long time for one reason: there was no way to send
// an email. Cloudflare Email Sending removes that, and the plan already
// includes 3,000 messages a month.
//
// Two rules shape the whole endpoint:
//
//  1. It never reveals whether an address has an account. "Ask for a code" and
//     "confirm a code" answer the same way for a stranger as for a member,
//     because the honest answer is exactly the account-enumeration oracle an
//     attacker wants.
//  2. A code is stored only as a hash, tried a fixed number of times, and
//     consumed on use.

import type { TrolleyScoutEnv } from '../_shared/env'
import { emailLookup } from '../_shared/emailProtection'
import { hashPassword, validatePassword } from '../_shared/password'
import { json, methodNotAllowed } from '../_shared/respond'
import { passwordResetEmail, sendEmail } from '../_shared/sendEmail'

const headers = { 'cache-control': 'private, no-store' }

export const CODE_MINUTES = 15
const MAX_ATTEMPTS = 5
/** Requests allowed per address per hour, to keep the allowance for real use. */
const MAX_REQUESTS_PER_HOUR = 3

/** Deliberately vague: it must read the same whether or not you have an account. */
const NEUTRAL_REQUEST_REPLY = {
  message:
    'If that email has a Trolley Scout account, a reset code is on its way. ' +
    'It expires in 15 minutes.',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowed(request.method, 'POST')
  if (!env.DB) {
    return json(
      { message: 'Password reset is unavailable right now.' },
      { headers, status: 503 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    code?: string
    email?: string
    password?: string
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) {
    return json({ message: 'Enter your email.' }, { headers, status: 400 })
  }

  const lookup = await emailLookup(env, email)
  const now = new Date()

  if (body.action === 'request') {
    await issueResetCode(env, email, lookup, now)
    // Always the same answer, always the same shape.
    return json(NEUTRAL_REQUEST_REPLY, { headers })
  }

  if (body.action === 'confirm') {
    return confirmReset(env, {
      code: (body.code ?? '').trim(),
      lookup,
      now,
      password: body.password ?? '',
    })
  }

  return json({ message: 'Unknown action.' }, { headers, status: 400 })
}

async function issueResetCode(
  env: TrolleyScoutEnv,
  email: string,
  lookup: string,
  now: Date,
): Promise<void> {
  const account = await env.DB!.prepare(
    'SELECT id FROM member_accounts WHERE email_lookup = ? LIMIT 1',
  )
    .bind(lookup)
    .first<{ id: string }>()
  // No account: stop here, having done nothing and said nothing different.
  if (!account?.id) return

  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const recent = await env.DB!.prepare(
    'SELECT COUNT(*) AS total FROM member_password_resets WHERE email_lookup = ? AND created_at >= ?',
  )
    .bind(lookup, since)
    .first<{ total: number }>()
  if ((recent?.total ?? 0) >= MAX_REQUESTS_PER_HOUR) return

  const code = generateCode()
  const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60 * 1000)

  await env.DB!.batch([
    // Any code already outstanding stops working the moment a new one is asked
    // for, so a forwarded old email cannot be replayed.
    env.DB!.prepare(
      'UPDATE member_password_resets SET consumed_at = ? WHERE email_lookup = ? AND consumed_at IS NULL',
    ).bind(now.toISOString(), lookup),
    env.DB!.prepare(
      `INSERT INTO member_password_resets
        (id, account_id, email_lookup, code_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      account.id,
      lookup,
      await hashCode(code),
      expiresAt.toISOString(),
      now.toISOString(),
    ),
  ])

  const template = passwordResetEmail(code, CODE_MINUTES)
  await sendEmail(env, { ...template, to: email }, { now })
}

async function confirmReset(
  env: TrolleyScoutEnv,
  input: { code: string; lookup: string; now: Date; password: string },
): Promise<Response> {
  const problem = validatePassword(input.password)
  if (problem) return json({ message: problem }, { headers, status: 400 })

  const row = await env.DB!.prepare(
    `SELECT id, account_id, code_hash, attempts FROM member_password_resets
      WHERE email_lookup = ? AND consumed_at IS NULL AND expires_at >= ?
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(input.lookup, input.now.toISOString())
    .first<{
      account_id: string
      attempts: number
      code_hash: string
      id: string
    }>()

  if (!row || row.attempts >= MAX_ATTEMPTS) {
    return json(
      { message: 'That code is not valid. Ask for a new one.' },
      { headers, status: 400 },
    )
  }

  if (!timingSafeEqual(await hashCode(input.code), row.code_hash)) {
    await env.DB!.prepare(
      'UPDATE member_password_resets SET attempts = attempts + 1 WHERE id = ?',
    )
      .bind(row.id)
      .run()
    return json(
      { message: 'That code is not valid. Ask for a new one.' },
      { headers, status: 400 },
    )
  }

  const stamp = input.now.toISOString()
  await env.DB!.batch([
    env.DB!.prepare(
      'UPDATE member_accounts SET password_hash = ?, updated_at = ? WHERE id = ?',
    ).bind(await hashPassword(input.password), stamp, row.account_id),
    env.DB!.prepare(
      'UPDATE member_password_resets SET consumed_at = ? WHERE id = ?',
    ).bind(stamp, row.id),
    // Someone who has just proved control of the inbox has also verified it.
    env.DB!.prepare(
      'UPDATE member_accounts SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?',
    ).bind(stamp, row.account_id),
  ])

  return json({ message: 'Your password is updated. Log in with it now.' }, {
    headers,
  })
}

/** Six digits, from the crypto RNG rather than Math.random. */
export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1))
  return String(bytes[0] % 1_000_000).padStart(6, '0')
}

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`trolley-scout-reset:${code}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Compares in constant time, so a wrong code leaks nothing by how long it took. */
function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}
