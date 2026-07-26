import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import {
  createOrganizationPublication,
  listOrganizationPublications,
  setOrganizationPublicationAction,
  submitOrganizationPublication,
  updateOrganizationPublication,
  type OrganizationPublicationInput,
  type OrganizationPublicationStatus,
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
const supportedMethods = new Set(['GET', 'POST', 'PATCH', 'DELETE'])

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (!supportedMethods.has(request.method)) {
    return methodNotAllowed(request.method, 'GET, POST, PATCH, DELETE')
  }

  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json(
      { issues: ['Sign in to manage business content.'], publications: [] },
      { headers: privateHeaders, status: 401 },
    )
  }

  const organization = await getOrganizationForAccount(env, account.id)
  if (!organization) {
    return json(
      { issues: ['An active organization is required.'], publications: [] },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status') ?? undefined
    return json(
      {
        publications: await listOrganizationPublications(
          env,
          account.id,
          status as OrganizationPublicationStatus | undefined,
        ),
      },
      { headers: privateHeaders },
    )
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { issues: ['Request origin is not allowed.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  const bodyResult = await readBody(request)
  if ('response' in bodyResult) return bodyResult.response
  const body = bodyResult.body

  if (request.method === 'POST') {
    const result = await createOrganizationPublication(env, account.id, publicationInput(body))
    return publicationResponse(env, account.id, result)
  }

  const publicationId = optionalBodyText(body.publicationId)?.trim()
  if (!publicationId || publicationId.length > 200) {
    return json(
      { issues: ['Provide a valid publicationId.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  if (request.method === 'DELETE') {
    const result = await setOrganizationPublicationAction(
      env,
      account.id,
      publicationId,
      'archive',
    )
    return publicationResponse(env, account.id, result)
  }

  const operation = optionalBodyText(body.operation)?.trim() ?? 'update'
  if (operation === 'update') {
    const result = await updateOrganizationPublication(
      env,
      account.id,
      publicationId,
      publicationInput(body),
    )
    return publicationResponse(env, account.id, result)
  }
  if (operation === 'submit') {
    const result = await submitOrganizationPublication(env, account.id, publicationId)
    return publicationResponse(env, account.id, result)
  }
  if (
    operation === 'pause' ||
    operation === 'resume' ||
    operation === 'sold_out' ||
    operation === 'archive'
  ) {
    const result = await setOrganizationPublicationAction(
      env,
      account.id,
      publicationId,
      operation,
    )
    return publicationResponse(env, account.id, result)
  }

  return json(
    { issues: ['Choose update, submit, pause, resume, sold_out, or archive.'] },
    { headers: privateHeaders, status: 422 },
  )
}

async function publicationResponse(
  env: TrolleyScoutEnv,
  accountId: string,
  result: { publication?: unknown; issues?: string[] },
) {
  const publications = await listOrganizationPublications(env, accountId)
  if (result.issues?.length || !result.publication) {
    return json(
      {
        issues: result.issues ?? ['The publication could not be changed.'],
        publication: result.publication,
        publications,
      },
      { headers: privateHeaders, status: 422 },
    )
  }
  return json(
    { publication: result.publication, publications },
    { headers: privateHeaders },
  )
}

function publicationInput(body: Record<string, unknown>): OrganizationPublicationInput {
  return {
    bodyText: bodyText(body.bodyText),
    couponCode: optionalBodyText(body.couponCode),
    currencyCode: optionalBodyText(body.currencyCode),
    endsAt: optionalBodyText(body.endsAt),
    imageAlt: optionalBodyText(body.imageAlt),
    imageUrl: optionalBodyText(body.imageUrl),
    kind: bodyText(body.kind) as OrganizationPublicationInput['kind'],
    locationIds: stringArray(body.locationIds),
    offerText: optionalBodyText(body.offerText),
    placement: bodyText(body.placement) as OrganizationPublicationInput['placement'],
    previousPriceCents: optionalInteger(body.previousPriceCents),
    priceCents: optionalInteger(body.priceCents),
    soldOut: body.soldOut === true,
    startsAt: optionalBodyText(body.startsAt),
    targetUrl: optionalBodyText(body.targetUrl),
    title: bodyText(body.title),
  }
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

async function readBody(
  request: Request,
): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  try {
    return { body: await readJsonObjectBody(request, 32_768) }
  } catch (error) {
    const tooLarge = error instanceof RangeError
    return {
      response: json(
        { issues: [tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.'] },
        { headers: privateHeaders, status: tooLarge ? 413 : 400 },
      ),
    }
  }
}
