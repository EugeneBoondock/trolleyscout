import type { TrolleyScoutEnv } from './env'
import { hasTrolleyScoutDatabase } from './env'
import type { DeveloperPrincipal, DeveloperScope } from './developerAccess'
import {
  createOrganizationPublication,
  getOrganizationPublication,
  listOrganizationPublications,
  readOrganizationMetrics,
  setOrganizationPublicationAction,
  submitOrganizationPublication,
  updateOrganizationPublication,
  type OrganizationPublicationInput,
} from './organizationPublicationStore'

export interface DeveloperApiContext {
  env: TrolleyScoutEnv
  path: string[]
  principal: DeveloperPrincipal
  request: Request
  requestId: string
}

export function requiredDeveloperScopes(path: string[], method: string): DeveloperScope[] {
  if (path[0] === 'campaigns') {
    return method === 'GET' ? ['campaigns:read'] : ['campaigns:write']
  }
  if (path[0] === 'trends') return ['trends:read']
  return ['shopping:read']
}

export async function handleDeveloperApi(context: DeveloperApiContext): Promise<Response> {
  const { env, path, principal, request, requestId } = context
  if (path[0] === 'campaigns') {
    return campaignResponse(env, principal.accountId, request, path, requestId)
  }
  if (request.method !== 'GET') {
    return developerApiError('method_not_allowed', 'This route accepts GET requests.', 405, requestId)
  }
  if (path[0] === 'deals') return dealsResponse(request, requestId)
  if (path[0] === 'catalogues') return cataloguesResponse(request, requestId)
  if (path[0] === 'stores' && path[1] === 'nearby') {
    return nearbyStoresResponse(request, requestId)
  }
  if (path[0] === 'stories') return storiesResponse(request, requestId)
  if (path[0] === 'trends') return trendsResponse(env, request, requestId)
  return developerApiError('not_found', 'Developer API route not found.', 404, requestId)
}

export function developerApiError(
  code: string,
  message: string,
  status: number,
  requestId: string,
  issues?: string[],
): Response {
  return new Response(
    JSON.stringify({ error: { code, issues, message, requestId } }),
    {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': requestId,
      },
      status,
    },
  )
}

function developerData(data: unknown, requestId: string, status = 200): Response {
  return new Response(JSON.stringify({ data, requestId }), {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
    },
    status,
  })
}

async function dealsResponse(request: Request, requestId: string) {
  const url = new URL(request.url)
  const discovery = await publicPayload(request, '/api/discovery')
  const query = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
  const retailer = url.searchParams.get('retailer')?.trim() ?? ''
  const limit = boundedLimit(url.searchParams.get('limit'))
  const deals = Array.isArray(discovery?.discovery?.deals)
    ? discovery.discovery.deals as Array<Record<string, unknown>>
    : []
  const filtered = deals.filter((deal) => {
    const matchesQuery = !query || String(deal.title ?? '').toLowerCase().includes(query)
    const matchesRetailer = !retailer || deal.retailerId === retailer
    return matchesQuery && matchesRetailer
  })
  return developerData({
    count: filtered.length,
    deals: filtered.slice(0, limit),
    nextCursor: filtered.length > limit ? encodeCursor(limit) : undefined,
  }, requestId)
}

async function cataloguesResponse(request: Request, requestId: string) {
  const url = new URL(request.url)
  const discovery = await publicPayload(request, '/api/discovery')
  const retailer = url.searchParams.get('retailer')?.trim() ?? ''
  const limit = boundedLimit(url.searchParams.get('limit'))
  const leaflets = Array.isArray(discovery?.discovery?.leaflets)
    ? discovery.discovery.leaflets as Array<Record<string, unknown>>
    : []
  const filtered = leaflets.filter((leaflet) => !retailer || leaflet.retailerId === retailer)
  return developerData({
    catalogues: filtered.slice(0, limit),
    count: filtered.length,
    nextCursor: filtered.length > limit ? encodeCursor(limit) : undefined,
  }, requestId)
}

async function nearbyStoresResponse(request: Request, requestId: string) {
  const url = new URL(request.url)
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return developerApiError(
      'validation_failed',
      'Latitude and longitude are required numbers.',
      422,
      requestId,
      ['Provide lat and lon query parameters.'],
    )
  }
  const payload = await publicPayload(request, `/api/nearby-stores?lat=${lat}&lon=${lon}`)
  return developerData(payload ?? { stores: [] }, requestId)
}

async function storiesResponse(request: Request, requestId: string) {
  const discovery = await publicPayload(request, '/api/discovery')
  const deals = Array.isArray(discovery?.discovery?.deals)
    ? discovery.discovery.deals as Array<Record<string, unknown>>
    : []
  const leaflets = Array.isArray(discovery?.discovery?.leaflets)
    ? discovery.discovery.leaflets as Array<Record<string, unknown>>
    : []
  const businessStories = Array.isArray(discovery?.discovery?.businessStories)
    ? discovery.discovery.businessStories as Array<Record<string, unknown>>
    : []
  const groups = new Map<string, { id: string; retailerName: string; frames: unknown[] }>()
  for (const item of [...leaflets, ...deals]) {
    const retailerId = String(item.retailerId ?? '')
    const imageUrl = item.imageUrl
    if (!retailerId || typeof imageUrl !== 'string' || !imageUrl) continue
    const story = groups.get(retailerId) ?? {
      frames: [],
      id: retailerId,
      retailerName: String(item.retailerName ?? retailerId),
    }
    if (story.frames.length < 40) {
      story.frames.push({
        id: String(item.id ?? `${retailerId}:${story.frames.length}`),
        imageUrl,
        sourceUrl: item.productUrl ?? item.url,
        subtitle: item.priceText,
        title: item.title ?? item.name,
      })
    }
    groups.set(retailerId, story)
  }
  for (const item of businessStories) {
    const organizationSlug = String(item.organizationSlug ?? '')
    const imageUrl = item.imageUrl
    if (!organizationSlug || typeof imageUrl !== 'string' || !imageUrl) continue
    const id = `organization:${organizationSlug}`
    const story = groups.get(id) ?? {
      frames: [],
      id,
      retailerName: String(item.organizationName ?? 'Business'),
    }
    if (story.frames.length < 40) {
      story.frames.push({
        id: String(item.id ?? `${id}:${story.frames.length}`),
        imageUrl,
        sourceUrl: item.targetUrl,
        subtitle: item.offerText ?? item.priceText,
        title: item.title,
      })
    }
    groups.set(id, story)
  }
  return developerData({ stories: [...groups.values()].slice(0, 16) }, requestId)
}

async function trendsResponse(
  env: TrolleyScoutEnv,
  request: Request,
  requestId: string,
) {
  if (!hasTrolleyScoutDatabase(env)) {
    return developerData({ period: 'day', publications: [] }, requestId)
  }
  const requestedPeriod = new URL(request.url).searchParams.get('period')
  const period = requestedPeriod === 'week' || requestedPeriod === 'month'
    ? requestedPeriod
    : 'day'
  const days = period === 'month' ? 30 : period === 'week' ? 7 : 1
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - days + 1)
  const rows = await env.DB.prepare(
    `SELECT publication.id, publication.title, organization.name AS organization_name,
        SUM(metric.impressions) AS impressions,
        SUM(metric.image_views) AS image_views,
        SUM(metric.saves) AS saves,
        SUM(metric.link_clicks) AS link_clicks
      FROM organization_publication_metrics_daily AS metric
      INNER JOIN organization_publications AS publication ON publication.id = metric.publication_id
      INNER JOIN organizations AS organization ON organization.id = publication.organization_id
      WHERE metric.event_date >= ?
      GROUP BY publication.id, publication.title, organization.name
      ORDER BY (SUM(metric.image_views) + SUM(metric.saves) + SUM(metric.link_clicks)) DESC,
        SUM(metric.impressions) DESC, publication.id
      LIMIT 50`,
  ).bind(start.toISOString().slice(0, 10)).all<Record<string, unknown>>()
  return developerData({ period, publications: rows.results }, requestId)
}

async function campaignResponse(
  env: TrolleyScoutEnv,
  accountId: string,
  request: Request,
  path: string[],
  requestId: string,
) {
  const publicationId = path[1]
  const operation = path[2]
  if (request.method === 'GET' && !publicationId) {
    return developerData(
      { campaigns: await listOrganizationPublications(env, accountId) },
      requestId,
    )
  }
  if (request.method === 'GET' && publicationId && operation === 'results') {
    const publication = await getOrganizationPublication(env, accountId, publicationId)
    if (!publication) return developerApiError('not_found', 'Campaign not found.', 404, requestId)
    return developerData(
      {
        campaign: publication,
        metrics: await readOrganizationMetrics(
          env,
          accountId,
          range(request),
          new Date().toISOString(),
          publicationId,
        ),
      },
      requestId,
    )
  }
  if (request.method === 'GET' && publicationId) {
    const publication = await getOrganizationPublication(env, accountId, publicationId)
    return publication
      ? developerData({ campaign: publication }, requestId)
      : developerApiError('not_found', 'Campaign not found.', 404, requestId)
  }

  const body = await readJson(request)
  if (!body) {
    return developerApiError('invalid_json', 'Request body must be valid JSON.', 400, requestId)
  }
  if (request.method === 'POST' && !publicationId) {
    return mutationResult(
      await createOrganizationPublication(env, accountId, publicationInput(body)),
      requestId,
      201,
    )
  }
  if (!publicationId) {
    return developerApiError('not_found', 'Campaign route not found.', 404, requestId)
  }
  if (request.method === 'PATCH' && !operation) {
    return mutationResult(
      await updateOrganizationPublication(env, accountId, publicationId, publicationInput(body)),
      requestId,
    )
  }
  if (request.method === 'POST' && operation === 'submit') {
    return mutationResult(
      await submitOrganizationPublication(env, accountId, publicationId),
      requestId,
    )
  }
  if (request.method === 'POST' && (operation === 'pause' || operation === 'resume')) {
    return mutationResult(
      await setOrganizationPublicationAction(env, accountId, publicationId, operation),
      requestId,
    )
  }
  return developerApiError('not_found', 'Campaign route not found.', 404, requestId)
}

function mutationResult(
  result: { publication?: unknown; issues?: string[] },
  requestId: string,
  successStatus = 200,
) {
  if (!result.publication || result.issues?.length) {
    const stateConflict = result.issues?.some((issue) =>
      issue.includes('Only a draft') || issue.includes('not available'))
    return developerApiError(
      stateConflict ? 'campaign_state_conflict' : 'validation_failed',
      stateConflict ? 'The campaign cannot make that transition.' : 'Campaign validation failed.',
      stateConflict ? 409 : 422,
      requestId,
      result.issues,
    )
  }
  return developerData({ campaign: result.publication }, requestId, successStatus)
}

function publicationInput(body: Record<string, unknown>): OrganizationPublicationInput {
  return {
    bodyText: stringValue(body.bodyText),
    couponCode: optionalString(body.couponCode),
    currencyCode: optionalString(body.currencyCode),
    destinations: Array.isArray(body.destinations)
      ? body.destinations.filter((value): value is 'marketplace' | 'window' | 'stories' =>
          value === 'marketplace' || value === 'window' || value === 'stories')
      : undefined,
    endsAt: optionalString(body.endsAt),
    imageAlt: optionalString(body.imageAlt),
    imageUrl: optionalString(body.imageUrl),
    kind: stringValue(body.kind) as OrganizationPublicationInput['kind'],
    locationIds: Array.isArray(body.locationIds)
      ? body.locationIds.filter((value): value is string => typeof value === 'string')
      : undefined,
    offerText: optionalString(body.offerText),
    placement: stringValue(body.placement) as OrganizationPublicationInput['placement'],
    previousPriceCents: integerValue(body.previousPriceCents),
    priceCents: integerValue(body.priceCents),
    soldOut: body.soldOut === true,
    startsAt: optionalString(body.startsAt),
    targetUrl: optionalString(body.targetUrl),
    title: stringValue(body.title),
  }
}

async function publicPayload(request: Request, path: string): Promise<any> {
  try {
    const response = await fetch(new URL(path, request.url), {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return undefined
    const envelope = await response.json() as { data?: unknown }
    return envelope.data
  } catch {
    return undefined
  }
}

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const value = await request.json()
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function boundedLimit(value: string | null): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 50
}

function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ offset })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function range(request: Request): number {
  const days = Number(new URL(request.url).searchParams.get('days'))
  return days === 1 || days === 7 || days === 30 ? days : 30
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}
