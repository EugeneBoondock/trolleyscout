import type { TrolleyScoutEnv } from './env'

const kapsoBase = 'https://api.kapso.ai/meta/whatsapp/v24.0'

export async function sendVerificationEmail(env: TrolleyScoutEnv, to: string, code: string) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) throw new Error('Email verification is not configured.')
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'Trolley Scout' },
      to: [{ email: to }],
      subject: 'Your Trolley Scout verification code',
      textContent: `Your Trolley Scout verification code is ${code}. It expires in 10 minutes.`,
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
