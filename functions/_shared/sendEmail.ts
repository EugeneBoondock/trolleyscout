import { spendAiBudget } from './aiBudget'
import type { TrolleyScoutEnv } from './env'

/**
 * Transactional mail, sent by Cloudflare from the trolleyscout.co.za zone.
 *
 * This replaces the Brevo integration: the Workers Paid plan already includes
 * 3,000 emails a month, the binding needs no API key, and the domain is
 * already onboarded — so there is no reason to keep a third party in the path
 * for a verification code.
 *
 * Metered like every other included allowance. Running out must never look
 * like a bug to the shopper, so callers get a clear false and say "try again
 * shortly" rather than an error nobody can act on.
 */

export const SENDER_ADDRESS = 'noreply@trolleyscout.co.za'
export const SENDER_NAME = 'Trolley Scout'

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string
}

export type EmailResult = 'sent' | 'not-configured' | 'budget-spent' | 'failed'

/**
 * Mail leaves through the email Worker, not from here.
 *
 * Pages Functions cannot hold a `send_email` binding at all — wrangler
 * rejects the configuration outright — so the send happens in the Worker that
 * already has one, reached over the service binding Pages already has.
 */
export async function sendEmail(
  env: TrolleyScoutEnv,
  message: OutgoingEmail,
  options: { now?: Date } = {},
): Promise<EmailResult> {
  const service = env.ORGANIZATION_EMAIL
  if (!service) return 'not-configured'
  if (!isPlausibleAddress(message.to)) return 'failed'

  const now = options.now ?? new Date()
  if (!(await spendAiBudget(env, 'emailsSent', 1, now))) return 'budget-spent'

  try {
    const response = await service.fetch(
      'https://organization-email.internal/send',
      {
        body: JSON.stringify({
          // Both parts every time: some clients only render text, and a
          // text-less HTML mail scores worse with spam filters.
          html: message.html ?? escapeToHtml(message.text),
          sender: 'account',
          subject: message.subject,
          text: message.text,
          to: message.to,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    )
    return response.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

/** The one-time code mail, shared by sign-up verification and re-verification. */
export function verificationEmail(code: string, minutes: number): OutgoingEmail {
  const text =
    `Your Trolley Scout verification code is ${code}.\n\n` +
    `It expires in ${minutes} minutes. If you did not ask for it, ignore ` +
    `this email — nothing has changed on your account.`
  return {
    html: codeHtml('Verify your email', code, minutes),
    subject: `${code} is your Trolley Scout code`,
    text,
    to: '',
  }
}

export function passwordResetEmail(code: string, minutes: number): OutgoingEmail {
  const text =
    `Use ${code} to reset your Trolley Scout password.\n\n` +
    `It expires in ${minutes} minutes. If you did not ask to reset your ` +
    `password, ignore this email — your password has not changed.`
  return {
    html: codeHtml('Reset your password', code, minutes),
    subject: `${code} is your Trolley Scout reset code`,
    text,
    to: '',
  }
}

/**
 * A plain, single-column mail.
 *
 * Deliberately not a designed template: many South African shoppers read mail
 * on cheap Android clients over metered data, and a code needs to be readable
 * before any images load.
 */
function codeHtml(heading: string, code: string, minutes: number): string {
  return [
    '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px">',
    `<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h1>`,
    '<p style="font-size:14px;line-height:1.5;margin:0 0 16px">',
    'Enter this code in the Trolley Scout app:',
    '</p>',
    '<p style="font-size:30px;font-weight:800;letter-spacing:5px;margin:0 0 16px">',
    escapeHtml(code),
    '</p>',
    `<p style="font-size:13px;color:#6b6b6b;line-height:1.5;margin:0">`,
    `It expires in ${minutes} minutes. If you did not ask for it, ignore this `,
    'email — nothing on your account has changed.',
    '</p>',
    '</div>',
  ].join('')
}

function escapeToHtml(text: string): string {
  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px">${escapeHtml(
    text,
  ).replace(/\n/g, '<br>')}</div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Enough to catch a typo before it becomes a bounce against our reputation. */
export function isPlausibleAddress(value: string): boolean {
  const address = value.trim()
  return (
    address.length >= 6 &&
    address.length <= 254 &&
    /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(address)
  )
}
