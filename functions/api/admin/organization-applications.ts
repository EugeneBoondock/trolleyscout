// Organisation onboarding, admin side: read the review queue and decide an
// application. Approving here is what creates the organisation row that opens
// the org portal, so the gate matches every other admin route — the role is
// read from the account row server-side and a non-admin gets 403 without ever
// seeing another member's application.

import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import {
  hasTrustedMutationOrigin,
  optionalBodyText,
  readJsonObjectBody,
} from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'
import {
  listOrganizationApplicationsForReview,
  reviewOrganizationApplication,
} from '../../_shared/organizationStore'
import { sendOrganizationAccessEmail } from '../../_shared/organizationEmail'

const privateHeaders = {
  'cache-control': 'private, no-store',
}
const MAX_APPLICATION_ID_LENGTH = 200

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PATCH') {
    return methodNotAllowed(request.method, 'GET, POST, PATCH')
  }

  const session = await getMemberSession(env, request)

  // The role is read from the account row server-side — never from the client.
  if (session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  const statusFilter = new URL(request.url).searchParams.get('status') ?? undefined

  if (request.method === 'GET') {
    return json(
      { applications: await listOrganizationApplicationsForReview(env, statusFilter) },
      { headers: privateHeaders },
    )
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { message: 'Request origin is not allowed.' },
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

  const applicationId = optionalBodyText(body.applicationId)?.trim() ?? ''
  const decision = body.decision

  if (
    !applicationId ||
    applicationId.length > MAX_APPLICATION_ID_LENGTH ||
    (decision !== 'approved' && decision !== 'rejected')
  ) {
    return json(
      { issues: ['Provide an applicationId and an approved or rejected decision.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  const result = await reviewOrganizationApplication(
    env,
    session.account.id,
    applicationId,
    decision,
    optionalBodyText(body.note),
  )

  const applications = await listOrganizationApplicationsForReview(env, statusFilter)

  if (result.issues?.length) {
    return json(
      { applications, changed: false, issues: result.issues },
      { headers: privateHeaders, status: 422 },
    )
  }

  const emailResult =
    decision === 'approved' && result.application && result.organization
      ? await sendOrganizationAccessEmail(env, result.application, result.organization)
      : undefined

  return json(
    {
      application: result.application,
      applications,
      changed: result.changed,
      emailIssue: emailResult?.issue,
      emailSent: emailResult?.sent ?? false,
      organization: result.organization,
    },
    { headers: privateHeaders },
  )
}
