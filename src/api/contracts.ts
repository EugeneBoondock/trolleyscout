import type {
  MemberAccount,
  MemberPlan,
  MemberSession,
  MemberSessionDraft,
  OfferDraft,
  OfferValidationResult,
  Retailer,
  SavedSource,
  SavedSourceDraft,
  SourceKind,
  SubscriptionCheckoutRequest,
  SubscriptionCheckoutResult,
  VerifiedOffer,
} from '../types'

export interface ApiMeta {
  generatedAt: string
  source: 'cloudflare-pages' | 'static-fallback'
}

export interface SourceSummary {
  retailerCount: number
  sourceCount: number
  verifiedOfferCount: number
  sourceKinds: SourceKind[]
  dataPolicy: string
}

export interface ApiEnvelope<T> {
  data: T
  meta: ApiMeta
}

export type RetailersResponse = ApiEnvelope<{
  retailers: Retailer[]
  summary: SourceSummary
}>

export type OffersResponse = ApiEnvelope<{
  offers: VerifiedOffer[]
  summary: SourceSummary
}>

export type HealthResponse = ApiEnvelope<{
  ok: boolean
  service: 'trolley-scout'
  version: string
}>

export type OfferValidationRequest = OfferDraft

export type OfferValidationResponse = ApiEnvelope<OfferValidationResult>

export type OfferCreateResponse = ApiEnvelope<{
  offer: VerifiedOffer
  saved: boolean
  summary: SourceSummary
}>

export type OfferDeleteResponse = ApiEnvelope<{
  deleted: boolean
  id: string
  summary: SourceSummary
}>

export type MemberSessionRequest = MemberSessionDraft

export type MemberSessionResponse = ApiEnvelope<{
  session: MemberSession
}>

export type SavedSourcesResponse = ApiEnvelope<{
  savedSources: SavedSource[]
}>

export type SavedSourceRequest = SavedSourceDraft

export type SavedSourceCreateResponse = ApiEnvelope<{
  savedSource: SavedSource
  savedSources: SavedSource[]
}>

export type SavedSourceDeleteResponse = ApiEnvelope<{
  deleted: boolean
  id: string
  savedSources: SavedSource[]
}>

export type SubscriptionResponse = ApiEnvelope<{
  account?: MemberAccount
  billingReady: boolean
  plans: MemberPlan[]
}>

export type SubscriptionCheckoutResponse = ApiEnvelope<{
  checkout: SubscriptionCheckoutResult
}>

export type SubscriptionCheckoutBody = SubscriptionCheckoutRequest

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
  meta: ApiMeta
}
