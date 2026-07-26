import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import {
  listOrganizationPublicationsForReview,
  reviewOrganizationPublication,
  type OrganizationPublicationDecision,
  type OrganizationPublicationStatus,
} from '../../_shared/organizationPublicationStore'
import {
  hasTrustedMutationOrigin,
  optionalBodyText,
  readJsonObjectBody,
} from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PATCH') {
    return methodNotAllowed(request.method, 'GET, POST, PATCH')
  }
  const session = await getMemberSession(env, request)
  if (session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }
  const status = (
    new URL(request.url).searchParams.get('status') ?? 'submitted'
  ) as OrganizationPublicationStatus
  if (request.method === 'GET') {
    return json(
      { publications: await listOrganizationPublicationsForReview(env, status) },
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

  const publicationId = optionalBodyText(body.publicationId)?.trim() ?? ''
  const decision = optionalBodyText(body.decision) as OrganizationPublicationDecision | undefined
  if (
    !publicationId ||
    publicationId.length > 200 ||
    (decision !== 'approved' && decision !== 'changes_requested' && decision !== 'rejected')
  ) {
    return json(
      { issues: ['Provide a publicationId and an available review decision.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  const result = await reviewOrganizationPublication(
    env,
    session.account.id,
    publicationId,
    decision,
    optionalBodyText(body.note),
  )
  const publications = await listOrganizationPublicationsForReview(env, status)
  if (result.issues?.length) {
    return json(
      { changed: false, issues: result.issues, publications },
      { headers: privateHeaders, status: 422 },
    )
  }
  return json(
    { changed: result.changed, publication: result.publication, publications },
    { headers: privateHeaders },
  )
}
