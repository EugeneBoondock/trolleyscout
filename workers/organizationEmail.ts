interface OrganizationEmailEnv {
  EMAIL: SendEmail
}

interface OrganizationEmailRequest {
  html: string
  subject: string
  text: string
  to: string
  /// Which of the two senders to use. Business invitations come from
  /// access@; account mail (verification codes, password resets) comes from
  /// noreply@, so a shopper never sees a business address on a login email.
  sender?: 'business' | 'account'
}

const SENDERS = {
  account: { email: 'noreply@trolleyscout.co.za', name: 'Trolley Scout' },
  business: {
    email: 'access@trolleyscout.co.za',
    name: 'Trolley Scout for Business',
  },
} as const

const PRIVATE_ORIGIN = 'https://organization-email.internal'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const worker = {
  async fetch(request: Request, env: OrganizationEmailEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.origin !== PRIVATE_ORIGIN || url.pathname !== '/send') {
      return Response.json({ message: 'Not found.' }, { status: 404 })
    }

    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return Response.json({ message: 'JSON is required.' }, { status: 415 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ message: 'Request body must be valid JSON.' }, { status: 400 })
    }

    const email = parseEmailRequest(body)
    if (!email) {
      return Response.json({ message: 'Email details are invalid.' }, { status: 422 })
    }

    try {
      const result = await env.EMAIL.send({
        from: SENDERS[email.sender ?? 'business'],
        html: email.html,
        subject: email.subject,
        text: email.text,
        to: email.to,
      })
      return Response.json({ messageId: result.messageId }, { status: 202 })
    } catch {
      return Response.json({ message: 'Email delivery failed.' }, { status: 502 })
    }
  },
}

function parseEmailRequest(value: unknown): OrganizationEmailRequest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const body = value as Record<string, unknown>
  const to = textField(body.to)
  const subject = textField(body.subject)
  const text = textField(body.text)
  const html = textField(body.html)

  if (
    !to ||
    to.length > 320 ||
    !EMAIL_PATTERN.test(to) ||
    !subject ||
    subject.length > 200 ||
    !text ||
    text.length > 100_000 ||
    !html ||
    html.length > 500_000
  ) {
    return undefined
  }

  // Anything other than the two known senders falls back to the business
  // one, so a malformed value cannot pick an address that is not allowed.
  const sender = body.sender === 'account' ? 'account' : 'business'
  return { html, sender, subject, text, to }
}

function textField(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

export default worker
