import type { MemberSession } from '../types'

export type BusinessView = 'overview' | 'content' | 'create' | 'locations' | 'insights' | 'account'
export type PublicationKind = 'deal' | 'special' | 'promotion' | 'post'
export type PublicationPlacement = 'marketplace' | 'window' | 'both'
export type PublicationStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'scheduled'
  | 'live'
  | 'paused'
  | 'expired'
  | 'rejected'
  | 'archived'

export interface PortalOrganization {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended'
}

export interface OrganizationGate {
  applicationStatus: 'pending' | 'approved' | 'rejected' | null
  hasOrganization: boolean
  message?: string
  organization: PortalOrganization | null
}

export interface PublicationDraft {
  kind: PublicationKind
  placement: PublicationPlacement
  title: string
  bodyText: string
  targetUrl?: string
  imageUrl?: string
  imageAlt?: string
  priceCents?: number
  previousPriceCents?: number
  currencyCode?: string
  offerText?: string
  couponCode?: string
  startsAt?: string
  endsAt?: string
  locationIds?: string[]
  soldOut?: boolean
}

export interface BusinessPublication extends PublicationDraft {
  id: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  createdBy: string
  status: PublicationStatus
  reviewNote?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface BusinessLocationDraft {
  name: string
  addressLine: string
  city: string
  province?: string
  countryCode: string
  latitude?: number
  longitude?: number
  websiteUrl?: string
  status?: 'active' | 'closed'
}

export interface BusinessLocation extends BusinessLocationDraft {
  id: string
  organizationId: string
  status: 'active' | 'closed'
  createdAt: string
  updatedAt: string
}

export interface BusinessMetricTotals {
  impressions: number
  opens: number
  saves: number
  outboundVisits: number
}

export interface BusinessMetricDay extends BusinessMetricTotals {
  date: string
}

export interface BusinessMetrics {
  days: BusinessMetricDay[]
  rangeDays: number
  totals: BusinessMetricTotals
}

export interface BusinessBootstrap {
  session: MemberSession
  gate: OrganizationGate
  publications: BusinessPublication[]
  locations: BusinessLocation[]
  metrics: BusinessMetrics
}

export interface BusinessMutationResult {
  publication?: BusinessPublication
  publications: BusinessPublication[]
  issues?: string[]
}

export interface BusinessLocationResult {
  location?: BusinessLocation
  locations: BusinessLocation[]
  issues?: string[]
}

export interface OrganizationApplicationDraft {
  organisationName: string
  tradingName?: string
  registrationNumber?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  websiteUrl?: string
  category?: string
  description: string
  city?: string
  province?: string
}
