import type { MemberSession, MemberSessionDraft } from '../types'
import type {
  BusinessBootstrap,
  BusinessLocationDraft,
  BusinessLocationResult,
  BusinessMetrics,
  BusinessMutationResult,
  BusinessPublication,
  OrganizationApplicationDraft,
  OrganizationGate,
  PublicationDraft,
} from './types'

interface Envelope<T> {
  data: T
}

const emptyMetrics: BusinessMetrics = {
  days: [],
  rangeDays: 30,
  totals: { impressions: 0, opens: 0, outboundVisits: 0, saves: 0 },
}

const emptyGate: OrganizationGate = {
  applicationStatus: null,
  hasOrganization: false,
  organization: null,
}

export class BusinessApiError extends Error {
  readonly issues: string[]
  readonly status: number

  constructor(status: number, issues: string[]) {
    super(issues[0] ?? 'The request could not be completed.')
    this.name = 'BusinessApiError'
    this.issues = issues
    this.status = status
  }
}

export async function loadBusinessBootstrap(signal?: AbortSignal): Promise<BusinessBootstrap> {
  const sessionData = await request<{ session: MemberSession }>(
    '/api/member-session',
    { signal },
  )
  const session = sessionData.session
  if (!session.isAuthenticated || !session.account) {
    return {
      gate: emptyGate,
      locations: [],
      metrics: emptyMetrics,
      publications: [],
      session,
    }
  }

  let gate: OrganizationGate
  try {
    gate = await request<OrganizationGate>('/api/organization', { signal })
  } catch (error) {
    if (error instanceof BusinessApiError && error.status === 401) {
      return {
        gate: emptyGate,
        locations: [],
        metrics: emptyMetrics,
        publications: [],
        session: { isAuthenticated: false },
      }
    }
    throw error
  }

  if (!gate.hasOrganization || !gate.organization) {
    return { gate, locations: [], metrics: emptyMetrics, publications: [], session }
  }

  const [publicationData, locationData, metricData] = await Promise.all([
    request<{ publications: BusinessPublication[] }>('/api/organization-publications', { signal }),
    request<{ locations: BusinessBootstrap['locations'] }>('/api/organization-locations', { signal }),
    request<{ metrics: BusinessMetrics }>('/api/organization-metrics?days=30', { signal }),
  ])

  return {
    gate,
    locations: locationData.locations,
    metrics: normalizeMetrics(metricData.metrics),
    publications: publicationData.publications,
    session,
  }
}

export async function signInBusiness(
  draft: MemberSessionDraft,
): Promise<MemberSession> {
  const data = await request<{ session: MemberSession; issues?: string[] }>(
    '/api/member-session',
    {
      body: JSON.stringify({ ...draft, intent: draft.intent ?? 'login' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  )
  return data.session
}

export async function signOutBusiness(): Promise<void> {
  await request<{ session: MemberSession }>('/api/member-session', { method: 'DELETE' })
}

export async function createBusinessPublication(
  draft: PublicationDraft,
): Promise<BusinessMutationResult> {
  return request<BusinessMutationResult>('/api/organization-publications', mutation('POST', draft))
}

export async function updateBusinessPublication(
  publicationId: string,
  draft: PublicationDraft,
): Promise<BusinessMutationResult> {
  return request<BusinessMutationResult>(
    '/api/organization-publications',
    mutation('PATCH', { ...draft, operation: 'update', publicationId }),
  )
}

export async function changeBusinessPublication(
  publicationId: string,
  operation: 'submit' | 'pause' | 'resume' | 'sold_out' | 'archive',
): Promise<BusinessMutationResult> {
  const method = operation === 'archive' ? 'DELETE' : 'PATCH'
  return request<BusinessMutationResult>(
    '/api/organization-publications',
    mutation(method, { operation, publicationId }),
  )
}

export async function createBusinessLocation(
  draft: BusinessLocationDraft,
): Promise<BusinessLocationResult> {
  return request<BusinessLocationResult>('/api/organization-locations', mutation('POST', draft))
}

export async function updateBusinessLocation(
  locationId: string,
  draft: BusinessLocationDraft,
): Promise<BusinessLocationResult> {
  return request<BusinessLocationResult>(
    '/api/organization-locations',
    mutation('PATCH', { ...draft, locationId }),
  )
}

export async function loadBusinessMetrics(days: 7 | 30 | 90): Promise<BusinessMetrics> {
  const data = await request<{ metrics: BusinessMetrics }>(
    `/api/organization-metrics?days=${days}`,
  )
  return normalizeMetrics(data.metrics)
}

export async function uploadBusinessImage(file: File, altText: string): Promise<{
  altText: string
  id: string
  key: string
  url: string
}> {
  const body = new FormData()
  body.set('image', file)
  body.set('altText', altText)
  const data = await request<{
    media: { altText: string; id: string; key: string; url: string }
  }>('/api/organization-media', {
    body,
    method: 'POST',
  })
  return data.media
}

export async function submitOrganizationApplication(
  draft: OrganizationApplicationDraft,
): Promise<{ issues?: string[]; application?: { id: string; status: string } }> {
  return request('/api/organization-applications', mutation('POST', draft))
}

export async function loadOrganizationPublicationReviewQueue(
  status = 'submitted',
): Promise<BusinessPublication[]> {
  const data = await request<{ publications: BusinessPublication[] }>(
    `/api/admin/organization-publications?status=${encodeURIComponent(status)}`,
  )
  return data.publications
}

export async function reviewOrganizationPublication(
  publicationId: string,
  decision: 'approved' | 'changes_requested' | 'rejected',
  note?: string,
): Promise<{
  changed: boolean
  publication?: BusinessPublication
  publications: BusinessPublication[]
  issues?: string[]
}> {
  return request(
    '/api/admin/organization-publications?status=submitted',
    mutation('POST', { decision, note, publicationId }),
  )
}

function mutation(method: string, body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method,
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...init.headers,
    },
  })
  const envelope = await safeEnvelope<T>(response)
  if (!response.ok) {
    const data = envelope.data as Record<string, unknown> | undefined
    const issues = Array.isArray(data?.issues)
      ? data.issues.filter((issue): issue is string => typeof issue === 'string')
      : [typeof data?.message === 'string' ? data.message : `Request failed with ${response.status}.`]
    throw new BusinessApiError(response.status, issues)
  }
  return envelope.data
}

async function safeEnvelope<T>(response: Response): Promise<Envelope<T>> {
  try {
    return await response.json() as Envelope<T>
  } catch {
    throw new BusinessApiError(response.status || 500, ['The server returned an unreadable response.'])
  }
}

function normalizeMetrics(metrics: BusinessMetrics | undefined): BusinessMetrics {
  if (!metrics) return emptyMetrics
  return {
    days: Array.isArray(metrics.days) ? metrics.days : [],
    rangeDays: metrics.rangeDays === 7 || metrics.rangeDays === 90 ? metrics.rangeDays : 30,
    totals: {
      impressions: Number(metrics.totals?.impressions ?? 0),
      opens: Number(metrics.totals?.opens ?? 0),
      outboundVisits: Number(metrics.totals?.outboundVisits ?? 0),
      saves: Number(metrics.totals?.saves ?? 0),
    },
  }
}
