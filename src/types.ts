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
  | 'takealot'
  | 'amazon-za'
  | 'game'
  | 'builders'
  | 'yuppiechef'
  | 'kit-kat'
  | 'president-hyper'
  | 'roots-butchery'

export type SourceKind = 'specials' | 'loyalty' | 'app' | 'store-finder'

export type RetailerGroup =
  | 'Supermarket'
  | 'Value grocer'
  | 'Fresh market'
  | 'Wholesale'
  | 'Pharmacy'
  | 'Marketplace'
  | 'General retailer'
  | 'Homeware'

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

export type DiscoveryParserId =
  | 'amazon-deals'
  | 'amazon-vouchers'
  | 'clicks-promotions'
  | 'pnp-promotions'
  | 'dischem-promotion'
  | 'takealot-deals'
  | 'yuppiechef-specials'
  | 'metadata-only'

export type DiscoverySourceStatus =
  | 'found'
  | 'checked_no_static_rows'
  | 'unavailable'
  | 'unsupported'

export interface DiscoverySourceTarget {
  retailerId: RetailerId
  sourceLabel: string
  parserId: DiscoveryParserId
}

export interface DiscoveredDeal {
  id: string
  retailerId: RetailerId
  retailerName: string
  sourceLabel: string
  sourceUrl: string
  productUrl: string
  title: string
  capturedAt: string
  priceText?: string
  previousPriceText?: string
  savingText?: string
  evidenceText: string
  imageUrl?: string
  personalizationReason?: string
}

export type DealActivityEventType =
  | 'search_submitted'
  | 'deal_opened'
  | 'deal_saved'
  | 'basket_added'
  | 'retailer_opened'

export interface DealActivityDraft {
  eventType: DealActivityEventType
  retailerId?: string
  term?: string
  title?: string
}

export interface DealActivity extends DealActivityDraft {
  createdAt: string
  id: string
}

export interface DealLearningState {
  activities: DealActivity[]
  enabled: boolean
}

export interface DiscoverySourceResult {
  checkedAt: string
  httpStatus?: number
  itemCount: number
  retailerId: RetailerId
  retailerName: string
  sourceLabel: string
  sourceUrl: string
  status: DiscoverySourceStatus
  statusText: string
}

export interface StoreLeaflet {
  id: string
  retailerId: RetailerId
  retailerName: string
  name: string
  imageUrl?: string
  documentUrl?: string
  validFrom?: string
  validTo?: string
  url: string
  capturedAt: string
}

export interface DiscoveryRun {
  deals: DiscoveredDeal[]
  leaflets?: StoreLeaflet[]
  refreshedAt?: string
  served?: 'snapshot' | 'live'
  sources: DiscoverySourceResult[]
  summary: {
    checkedSourceCount: number
    dataPolicy: string
    foundDealCount: number
    leafletCount?: number
    unavailableSourceCount: number
  }
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

export type BillingCycle = 'monthly' | 'annual'

export type MemberPlanStatus = 'active' | 'billing_not_configured' | 'checkout_required'

export interface MemberPlanLimits {
  savedSources: number
  savedDeals: number
  basketItems: number
}

export interface MemberPlan {
  id: MemberPlanId
  name: string
  description: string
  badge: string
  isPaid: boolean
  statusText: string
  features: string[]
  limits: MemberPlanLimits
  prices: {
    annual: number
    monthly: number
  }
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

export interface SavedDeal extends DiscoveredDeal {
  savedAt: string
}

export type SavedDealDraft = DiscoveredDeal

export interface BasketItem {
  id: string
  savedDealId: string
  quantity: number
  addedAt: string
  updatedAt: string
  deal: SavedDeal
  unitPriceCents?: number
  previousUnitPriceCents?: number
  linePriceCents?: number
  lineSavingCents?: number
}

export interface BasketSummary {
  itemCount: number
  knownPriceItemCount: number
  totalCents: number
  savingsCents: number
}

export interface Basket {
  items: BasketItem[]
  summary: BasketSummary
}

export interface BasketItemDraft {
  savedDealId: string
  quantity?: number
}

export interface BasketQuantityDraft {
  id: string
  quantity: number
}

export interface SubscriptionCheckoutRequest {
  billingCycle: BillingCycle
  planId: MemberPlanId
}

export interface SubscriptionCheckoutResult {
  billingCycle: BillingCycle
  billingReady: boolean
  engineUrl?: string
  message: string
  onsiteUuid?: string
  planId: MemberPlanId
  provider: 'payfast'
  status: MemberPlanStatus
}
