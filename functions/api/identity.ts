import { getMemberSession } from '../_shared/memberStore'
import { emailLookup, identityOtpHash, normalizePhone, phoneLookup, protectPhone, revealEmail } from '../_shared/emailProtection'
import { sendVerificationEmail, sendVerificationWhatsApp } from '../_shared/identityDelivery'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const headers = { 'cache-control': 'private, no-store' }
const otpLifetimeMs = 10 * 60_000
const maxAttempts = 5

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowed(request.method, 'POST')
  const session = await getMemberSession(env, request)
  if (!session.account) return json({ message: 'Sign in first.' }, { headers, status: 401 })
  const body = (await request.json().catch(() => ({}))) as { action?: string; channel?: 'email' | 'whatsapp'; code?: string; phone?: string }
  const channel = body.channel
  if (channel !== 'email' && channel !== 'whatsapp') return json({ message: 'Choose email or WhatsApp.' }, { headers, status: 400 })
  if (!env.DB) return json({ message: 'Account storage is unavailable.' }, { headers, status: 503 })
  const row = await env.DB.prepare('SELECT email, phone_lookup FROM member_accounts WHERE id = ?').bind(session.account.id).first<{ email: string; phone_lookup: string | null }>()
  if (!row) return json({ message: 'Account storage is unavailable.' }, { headers, status: 503 })
  let destination = ''
  try {
    destination = channel === 'email' ? await revealEmail(env, row.email) : normalizePhone(body.phone ?? '')
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : 'Enter a valid WhatsApp number.' }, { headers, status: 422 })
  }
  const lookup = channel === 'email' ? await emailLookup(env, destination) : await phoneLookup(env, destination)

  if (channel === 'whatsapp') {
    const existing = await env.DB.prepare('SELECT id FROM member_accounts WHERE phone_lookup = ? AND id != ?').bind(lookup, session.account.id).first()
    if (existing) return json({ message: 'That WhatsApp number is already linked to another account.' }, { headers, status: 422 })
  }

  if (body.action === 'request') {
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    const recent = await env.DB.prepare('SELECT COUNT(*) AS total FROM member_identity_otps WHERE account_id = ? AND channel = ? AND created_at >= ?').bind(session.account.id, channel, since).first<{ total: number }>()
    if ((recent?.total ?? 0) >= 3) return json({ message: 'Please wait a few minutes before requesting another code.' }, { headers, status: 429 })
    const code = createOtp()
    const hash = await identityOtpHash(env, lookup, code)
    const now = new Date().toISOString()
    await env.DB.batch([
      env.DB.prepare('UPDATE member_identity_otps SET consumed_at = ? WHERE account_id = ? AND channel = ? AND destination_lookup = ? AND consumed_at IS NULL').bind(now, session.account.id, channel, lookup),
      env.DB.prepare('INSERT INTO member_identity_otps (id, account_id, channel, destination_lookup, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), session.account.id, channel, lookup, hash, new Date(Date.now() + otpLifetimeMs).toISOString(), now),
    ])
    try {
      if (channel === 'email') await sendVerificationEmail(env, destination, code)
      else await sendVerificationWhatsApp(env, destination, code)
    } catch {
      return json({ message: 'Verification delivery is not configured yet. Please contact support.' }, { headers, status: 503 })
    }
    return json({ sent: true, channel }, { headers })
  }
  if (body.action === 'verify') {
    const code = body.code?.trim() ?? ''
    if (!/^\d{6}$/.test(code)) return json({ message: 'Enter the six digit code.' }, { headers, status: 422 })
    const otp = await env.DB.prepare('SELECT id, code_hash, attempts FROM member_identity_otps WHERE account_id = ? AND channel = ? AND destination_lookup = ? AND consumed_at IS NULL AND expires_at >= ? ORDER BY created_at DESC LIMIT 1').bind(session.account.id, channel, lookup, new Date().toISOString()).first<{ id: string; code_hash: string; attempts: number }>()
    if (!otp) return json({ message: 'That code has expired. Request a new one.' }, { headers, status: 422 })
    const matched = await identityOtpHash(env, lookup, code) === otp.code_hash
    const now = new Date().toISOString()
    if (!matched) {
      const attempts = (otp.attempts ?? 0) + 1
      await env.DB.prepare('UPDATE member_identity_otps SET attempts = ?, consumed_at = ? WHERE id = ?').bind(attempts, attempts >= maxAttempts ? now : null, otp.id).run()
      return json({ message: attempts >= maxAttempts ? 'Too many attempts. Request a new code.' : 'That code is not correct.' }, { headers, status: 422 })
    }
    const statements = [env.DB.prepare('UPDATE member_identity_otps SET consumed_at = ? WHERE id = ?').bind(now, otp.id)]
    if (channel === 'email') statements.push(env.DB.prepare('UPDATE member_accounts SET email_verified_at = ?, updated_at = ? WHERE id = ?').bind(now, now, session.account.id))
    else statements.push(env.DB.prepare('UPDATE member_accounts SET phone = ?, phone_lookup = ?, phone_verified_at = ?, updated_at = ? WHERE id = ?').bind(await protectPhone(env, destination), lookup, now, now, session.account.id))
    await env.DB.batch(statements)
    return json({ verified: true, channel }, { headers })
  }
  return json({ message: 'Unsupported identity action.' }, { headers, status: 400 })
}

function createOtp() {
  const bytes = crypto.getRandomValues(new Uint32Array(1))
  return String(100000 + (bytes[0] % 900000))
}
