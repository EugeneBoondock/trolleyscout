import type { TrolleyScoutEnv } from './env'
import type { OrganizationApplication, Organization } from './organizationStore'

const BUSINESS_PORTAL_URL = 'https://org.trolleyscout.co.za/?approved=1'

export interface OrganizationAccessEmailResult {
  sent: boolean
  issue?: string
}

export async function sendOrganizationAccessEmail(
  env: TrolleyScoutEnv,
  application: OrganizationApplication,
  organization: Organization,
): Promise<OrganizationAccessEmailResult> {
  if (!env.ORGANIZATION_EMAIL) {
    return {
      sent: false,
      issue: 'Approval was saved, but the access email service is unavailable.',
    }
  }

  const contactName = application.contactName.trim() || 'Business owner'
  const businessName = organization.name.trim() || application.organisationName.trim()
  const text = [
    `Hello ${contactName},`,
    '',
    `${businessName} has been approved for Trolley Scout for Business.`,
    'Open the secure business workspace, sign in with your Trolley Scout account, and set up your shop:',
    BUSINESS_PORTAL_URL,
    '',
    'Access stays open while your Organisation subscription is active.',
    '',
    'Trolley Scout for Business',
  ].join('\n')

  try {
    const response = await env.ORGANIZATION_EMAIL.fetch(
      'https://organization-email.internal/send',
      {
        body: JSON.stringify({
          html: organizationAccessHtml(contactName, businessName),
          subject: 'Your Trolley Scout business workspace is ready',
          text,
          to: application.contactEmail,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    )
    if (!response.ok) throw new Error(`Email service returned ${response.status}.`)
    return { sent: true }
  } catch {
    return {
      sent: false,
      issue: 'Approval was saved, but the access email could not be sent. Try sending it again.',
    }
  }
}

function organizationAccessHtml(contactName: string, businessName: string): string {
  const safeContactName = escapeHtml(contactName)
  const safeBusinessName = escapeHtml(businessName)

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7f2;color:#142218;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #d9e2d6;border-radius:18px;padding:32px">
        <p style="margin:0 0 12px;color:#38761d;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Trolley Scout for Business</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.2">Your workspace is ready</h1>
        <p style="margin:0 0 14px;line-height:1.6">Hello ${safeContactName},</p>
        <p style="margin:0 0 24px;line-height:1.6">${safeBusinessName} has been approved. Sign in with your Trolley Scout account to set up your shop, locations, deals, specials and Window Shopping posts.</p>
        <a href="${BUSINESS_PORTAL_URL}" style="display:inline-block;border-radius:12px;background:#38761d;color:#ffffff;padding:14px 20px;text-decoration:none;font-weight:700">Open business workspace</a>
        <p style="margin:24px 0 0;color:#526158;font-size:13px;line-height:1.6">Access stays open while your Organisation subscription is active.</p>
      </div>
    </div>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('’', '&#8217;')
}
