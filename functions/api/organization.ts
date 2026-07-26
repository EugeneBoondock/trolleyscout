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
    return 'Your application is waiting for admin review. Your Organisation subscription must stay active before workspace access can be approved.'
  }

  if (status === 'rejected') {
    return 'Your application was not approved. Review the admin note and update it in the Trolley Scout consumer app.'
  }

  if (status === 'approved') {
    return 'Your approval is saved. Reactivate the Organisation subscription in the Trolley Scout consumer app to restore access.'
  }

  return 'Subscribe and apply from the Organisation plan in the Trolley Scout consumer app. Business access opens after admin approval.'
}
