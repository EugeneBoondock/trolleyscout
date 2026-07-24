// The org portal's own gate: does the signed-in account have an organisation,
// and if not, where is their application? An approved application is the only
// thing that produces an organisation, so this answer alone decides whether the
// portal opens.

import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import {
  getOrganizationForAccount,
  listMemberOrganizationApplications,
  toPortalOrganization,
  type OrganizationApplicationStatus,
} from '../_shared/organizationStore'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const session = await getMemberSession(env, request)
  const account = session.account

  if (!account) {
    return json(
      {
        applicationStatus: null,
        hasOrganization: false,
        message: 'Sign in to open your organisation portal.',
        organization: null,
      },
      { headers: privateHeaders, status: 401 },
    )
  }

  const organization = await getOrganizationForAccount(env, account.id)

  if (organization) {
    return json(
      {
        applicationStatus: 'approved' satisfies OrganizationApplicationStatus,
        hasOrganization: true,
        organization: toPortalOrganization(organization),
      },
      { headers: privateHeaders },
    )
  }

  const applications = await listMemberOrganizationApplications(env, account.id)
  const applicationStatus = applications[0]?.status ?? null

  return json(
    {
      applicationStatus,
      hasOrganization: false,
      message: noOrganizationMessage(applicationStatus),
      organization: null,
    },
    { headers: privateHeaders },
  )
}

function noOrganizationMessage(status: OrganizationApplicationStatus | null): string {
  if (status === 'pending') {
    return 'Your organisation application is with our team. We will let you know as soon as it is reviewed.'
  }

  if (status === 'rejected') {
    return 'Your organisation application was not approved. You can apply again with updated details.'
  }

  if (status === 'approved') {
    return 'Your application was approved but the organisation is not active. Contact support.'
  }

  return 'No organisation is linked to this account yet. Apply to start one.'
}
