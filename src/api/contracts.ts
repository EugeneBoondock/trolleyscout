import type { OfferDraft, OfferValidationResult, Retailer, SourceKind, VerifiedOffer } from '../types'

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

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
  meta: ApiMeta
}
