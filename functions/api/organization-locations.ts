import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import {
  createOrganizationLocation,
  listOrganizationLocations,
  updateOrganizationLocation,
  type OrganizationLocationInput,
} from '../_shared/organizationPublicationStore'
import { getOrganizationForAccount } from '../_shared/organizationStore'
import {
  bodyText,
  hasTrustedMutationOrigin,
  optionalBodyText,
  readJsonObjectBody,
} from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PATCH') {
    return methodNotAllowed(request.method, 'GET, POST, PATCH')
  }
  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json(
      { issues: ['Sign in to manage business locations.'], locations: [] },
      { headers: privateHeaders, status: 401 },
    )
  }
  if (!(await getOrganizationForAccount(env, account.id))) {
    return json(
      { issues: ['An active organization is required.'], locations: [] },
      { headers: privateHeaders, status: 403 },
    )
  }
  if (request.method === 'GET') {
    return json(
      { locations: await listOrganizationLocations(env, account.id) },
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

  const input = locationInput(body)
  const result = request.method === 'POST'
    ? await createOrganizationLocation(env, account.id, input)
    : await updateOrganizationLocation(
      env,
      account.id,
      optionalBodyText(body.locationId)?.trim() ?? '',
      input,
    )
  const locations = await listOrganizationLocations(env, account.id)

  if (!result.location || result.issues?.length) {
    return json(
      {
        issues: result.issues ?? ['The location could not be changed.'],
        locations,
      },
      { headers: privateHeaders, status: 422 },
    )
  }
  return json(
    { location: result.location, locations },
    { headers: privateHeaders },
  )
}

function locationInput(body: Record<string, unknown>): OrganizationLocationInput {
  return {
    addressLine: bodyText(body.addressLine),
    city: bodyText(body.city),
    countryCode: bodyText(body.countryCode),
    latitude: optionalNumber(body.latitude),
    longitude: optionalNumber(body.longitude),
    name: bodyText(body.name),
    province: optionalBodyText(body.province),
    status: body.status === 'closed' ? 'closed' : 'active',
    websiteUrl: optionalBodyText(body.websiteUrl),
  }
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
