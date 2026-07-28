import type { TrolleyScoutEnv } from '../_shared/env'
import {
  isPublicationEvent,
  type OrganizationPublicationDestination,
  recordOrganizationPublicationEvent,
} from '../_shared/organizationPublicationStore'
import {
  bodyText,
  hasTrustedMutationOrigin,
  readJsonObjectBody,
} from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'

const eventHeaders = {
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: eventHeaders, status: 204 })
  }
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST, OPTIONS')
  }
  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { accepted: false, issues: ['Request origin is not allowed.'] },
      { headers: eventHeaders, status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request, 2_048)
  } catch (error) {
    return json(
      {
        accepted: false,
        issues: [
          error instanceof RangeError
            ? 'Request body is too large.'
            : 'Request body must be valid JSON.',
        ],
      },
      { headers: eventHeaders, status: error instanceof RangeError ? 413 : 400 },
    )
  }

  const publicationId = bodyText(body.publicationId).trim()
  const event = bodyText(body.event).trim()
  const destination = bodyText(body.destination).trim() as OrganizationPublicationDestination
  if (
    !publicationId ||
    publicationId.length > 200 ||
    !/^[A-Za-z0-9_-]+$/.test(publicationId) ||
    !isPublicationEvent(event) ||
    !['marketplace', 'window', 'stories'].includes(destination)
  ) {
    return json(
      { accepted: false, issues: ['Provide a valid publication event.'] },
      { headers: eventHeaders, status: 422 },
    )
  }

  const accepted = await recordOrganizationPublicationEvent(env, publicationId, destination, event)
  return json(
    { accepted },
    { headers: eventHeaders, status: accepted ? 202 : 404 },
  )
}
