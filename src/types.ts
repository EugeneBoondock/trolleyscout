export type RetailerId =
  | 'pick-n-pay'
  | 'checkers'
  | 'shoprite'
  | 'woolworths'
  | 'spar'
  | 'boxer'
  | 'food-lovers'
  | 'makro'
  | 'dis-chem'
  | 'clicks'
  | 'usave'
  | 'ok-foods'

export type SourceKind = 'specials' | 'loyalty' | 'app' | 'store-finder'

export type RetailerGroup = 'Supermarket' | 'Value grocer' | 'Fresh market' | 'Wholesale' | 'Pharmacy'

export interface RetailerSource {
  label: string
  url: string
  kind: SourceKind
}

export interface Retailer {
  id: RetailerId
  name: string
  shortName: string
  group: RetailerGroup
  program: string
  sourceNote: string
  verifiedOn: string
  accentColor: string
  sources: RetailerSource[]
}

export interface VerifiedOffer {
  id: string
  retailerId: RetailerId
  title: string
  sourceUrl: string
  capturedAt: string
  validFrom?: string
  validTo?: string
  priceText?: string
  savingText?: string
  termsText?: string
  createdAt?: string
  updatedAt?: string
}

export interface OfferDraft {
  retailerId: RetailerId
  title: string
  sourceUrl: string
  capturedAt: string
  validFrom?: string
  validTo?: string
  priceText: string
  savingText?: string
  termsText: string
}

export type OfferValidationSeverity = 'error' | 'warning'

export interface OfferValidationIssue {
  field: keyof OfferDraft | 'source'
  message: string
  severity: OfferValidationSeverity
}

export interface OfferValidationResult {
  accepted: boolean
  issues: OfferValidationIssue[]
  normalizedOffer?: VerifiedOffer
}

export type MemberPlanId = 'free' | 'scout' | 'household'

export type MemberPlanStatus = 'active' | 'billing_not_configured' | 'checkout_required'

export interface MemberPlan {
  id: MemberPlanId
  name: string
  description: string
  badge: string
  isPaid: boolean
  statusText: string
  features: string[]
}

export interface MemberAccount {
  id: string
  email: string
  displayName: string
  initials: string
  planId: MemberPlanId
  planName: string
  planStatus: MemberPlanStatus
  createdAt: string
  updatedAt: string
}

export interface MemberSession {
  account?: MemberAccount
  isAuthenticated: boolean
}

export interface MemberSessionDraft {
  displayName: string
  email: string
}

export interface SavedSource {
  id: string
  createdAt: string
  retailerId: RetailerId
  retailerName: string
  sourceLabel: string
  sourceKind: SourceKind
  sourceUrl: string
}

export interface SavedSourceDraft {
  retailerId: RetailerId
  sourceUrl: string
}

export interface SubscriptionCheckoutRequest {
  planId: MemberPlanId
}

export interface SubscriptionCheckoutResult {
  billingReady: boolean
  checkoutUrl?: string
  message: string
  planId: MemberPlanId
  status: MemberPlanStatus
}
