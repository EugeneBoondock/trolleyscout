import type { TrolleyScoutEnv } from './env'
import { sendEmail, verificationEmail } from './sendEmail'

/// Matches the OTP lifetime the identity endpoint writes.
const OTP_MINUTES = 10

const kapsoBase = 'https://api.kapso.ai/meta/whatsapp/v24.0'

/**
 * Sends the verification code.
 *
 * Cloudflare first: the plan already includes 3,000 transactional emails a
 * month from an onboarded trolleyscout.co.za, so a third-party key is one
 * more thing to rotate for no benefit. Brevo stays only as a fallback for a
 * deployment that has not got the binding yet.
 */
export async function sendVerificationEmail(env: TrolleyScoutEnv, to: string, code: string) {
  const template = verificationEmail(code, OTP_MINUTES)
  const result = await sendEmail(env, { ...template, to })
  if (result === 'sent') return
  if (result === 'budget-spent') {
    throw new Error(
      'This month\'s verification emails are used up. Try again shortly.',
    )
  }
  if (result === 'failed') throw new Error('Email verification could not be sent.')

  // No binding configured: fall back to Brevo if this deployment still has it.
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) throw new Error('Email verification is not configured.')
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'Trolley Scout' },
      to: [{ email: to }],
      subject: template.subject,
      textContent: template.text,
    }),
  })
  if (!response.ok) throw new Error('Email verification could not be sent.')
}

export async function sendVerificationWhatsApp(env: TrolleyScoutEnv, to: string, code: string) {
  if (!env.KAPSO_API_KEY || !env.KAPSO_PHONE_NUMBER_ID || !env.KAPSO_OTP_TEMPLATE_NAME) throw new Error('WhatsApp verification is not configured.')
  const response = await fetch(`${env.KAPSO_META_API_BASE_URL || kapsoBase}/${encodeURIComponent(env.KAPSO_PHONE_NUMBER_ID)}/messages`, {
    method: 'POST',
    headers: { 'X-API-Key': env.KAPSO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: to.replace(/^\+/, ''), type: 'template',
      template: { name: env.KAPSO_OTP_TEMPLATE_NAME, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }] },
    }),
  })
  if (!response.ok) throw new Error('WhatsApp verification could not be sent.')
}
