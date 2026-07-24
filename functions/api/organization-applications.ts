// Organisation onboarding, member side: apply to trade on Trolley Scout, and
// see how your own applications are going. The admin queue lives at
// /api/admin/organization-applications; approval is what opens the org portal.
//
// The account is always the signed-in session's own — an account id, a status
// or an organisation id in the body is ignored.

import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import {
  bodyText,
  hasTrustedMutationOrigin,
  optionalBodyText,
  readJsonObjectBody,
} from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'
import {
  listMemberOrganizationApplications,
  submitOrganizationApplication,
} from '../_shared/organizationStore'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowed(request.method, 'GET, POST')
  }

  const session = await getMemberSession(env, request)
  const account = session.account

  if (!account) {
    return json(
      { applications: [], issues: ['Sign in to apply for an organisation account.'] },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (request.method === 'GET') {
    return json(
      { applications: await listMemberOrganizationApplications(env, account.id) },
      { headers: privateHeaders },
    )
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { issues: ['Request origin is not allowed.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  let body: Record<string, unknown>

  try {
    body = await readJsonObjectBody(request)
  } catch (error) {
    const tooLarge = error instanceof RangeError
    return json(
      { issues: [tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.'] },
      { headers: privateHeaders, status: tooLarge ? 413 : 400 },
    )
  }

  const result = await submitOrganizationApplication(env, account.id, {
    category: optionalBodyText(body.category),
    city: optionalBodyText(body.city),
    contactEmail: bodyText(body.contactEmail),
    contactName: bodyText(body.contactName),
    contactPhone: optionalBodyText(body.contactPhone),
    description: bodyText(body.description),
    organisationName: bodyText(body.organisationName),
    province: optionalBodyText(body.province),
    registrationNumber: optionalBodyText(body.registrationNumber),
    tradingName: optionalBodyText(body.tradingName),
    websiteUrl: optionalBodyText(body.websiteUrl),
  })

  if (!result.application) {
    return json(
      { issues: result.issues ?? ['Your application could not be submitted.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  return json(
    {
      application: result.application,
      applications: await listMemberOrganizationApplications(env, account.id),
    },
    { headers: privateHeaders },
  )
}
