import type { RetailerDealScope } from './services/retailerFeeds/types'

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
  | 'frontline'
  | 'walmart'

// Discovery also represents validated supermarkets found outside the fixed
// directory. Directory records themselves remain restricted to RetailerId.
export type DiscoveryRetailerId = RetailerId | (string & {})

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
  // Computed from the retailer's own site favicon; never stored by hand.
  logoUrl?: string
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
  imageUrl?: string
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
  retailerId: DiscoveryRetailerId
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
  imageCrop?: ImageCrop
  catalogueDeepLink?: string
  catalogueFingerprint?: string
  expiresAt?: string
  priceScope?: RetailerDealScope
  productId?: string
  promotionId?: string
  validFrom?: string
  validTo?: string
  // 1-based page in the source catalogue, when the deal came from a page scan.
  pageNumber?: number
  personalizationReason?: string
}

export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
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
  retailerId: DiscoveryRetailerId
  retailerName: string
  sourceLabel: string
  sourceUrl: string
  status: DiscoverySourceStatus
  statusText: string
}

export interface StoreLeaflet {
  id: string
  retailerId: DiscoveryRetailerId
  retailerName: string
  name: string
  imageUrl?: string
  documentUrl?: string
  pages?: CataloguePage[]
  priceScope?: RetailerDealScope
  sourceLabel?: string
  validFrom?: string
  validTo?: string
  url: string
  capturedAt: string
}

export interface CataloguePage {
  pageNumber: number
  imageUrl: string
  width: number
  height: number
  fallbacks?: string[]
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

// One deal that answered a watched item.
export interface DealWatchMatch {
  title: string
  retailerName?: string
  priceText?: string
  productUrl?: string
  imageUrl?: string
}

// An item a member searched for that had no deal yet; matched watches with no
// seenAt are the member's unread alerts.
export interface DealWatch {
  id: string
  queryText: string
  createdAt: string
  matchedAt?: string
  seenAt?: string
  matches: DealWatchMatch[]
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
  imageUrl?: string
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

export type MemberRole = 'member' | 'admin'

export interface MemberAccount {
  id: string
  email: string
  displayName: string
  initials: string
  planId: MemberPlanId
  planName: string
  planStatus: MemberPlanStatus
  role: MemberRole
  // True when this member may open Properties Scout: the Household plan grants
  // it, admins always have it, and an admin can grant it to any single member.
  propertiesAccess: boolean
  createdAt: string
  updatedAt: string
}

// Properties Scout — a Household-tier tool that finds homes to buy or rent from
// the SA property portals (Property24, Private Property).
export type PropertyListingType = 'sale' | 'rent'

export type PropertyPortalId =
  | 'property24'
  | 'privateproperty'
  | 'gumtree'
  | 'pamgolding'
  | 'myroof'
  | 'sahometraders'
  | 'seeff'
  | 'remax'
  | 'harcourts'
  | 'rawson'
  | 'chaseveritt'
  | 'jawitz'
  | 'immoafrica'
  | 'wakefields'
  | 'tysonprop'
  | 'century21'
  | 'huizemark'
  | 'justproperty'
  | 'lewgeffen'
  | 'dormehlphalane'
  | 'fineandcountry'
  | 'engelvoelkers'
  | 'roomies'
  | 'realnet'
  | 'leapfrog'

export interface PropertyListing {
  id: string
  portal: PropertyPortalId
  portalName: string
  title: string
  priceText?: string
  // Numeric rand amount, for sorting and price filters. For rentals this is the
  // monthly figure. Undefined when the portal only shows "POA".
  priceValue?: number
  location?: string
  province?: string
  bedrooms?: number
  bathrooms?: number
  garages?: number
  propertyType?: string
  // Primary/cover image. `images` carries the full gallery when the portal
  // exposes more than one in its results (Gumtree, Leapfrog, Fine & Country);
  // otherwise the UI falls back to [imageUrl].
  imageUrl?: string
  images?: string[]
  listingUrl: string
  listingType: PropertyListingType
}

export interface PropertyPortalSourceMeta {
  id: PropertyPortalId
  label: string
  count: number
  ok: boolean
}

export interface PropertySearchResult {
  listings: PropertyListing[]
  sources: PropertyPortalSourceMeta[]
  listingType: PropertyListingType
  page: number
  locationText?: string
  refreshedAt?: string
}

export interface AdminOverview {
  accounts: MemberAccount[]
  scout: {
    dealCount: number
    leafletCount: number
    lastScoutedAt?: string
    sourceCount: number
  }
  summary: {
    accountCount: number
    planCounts: Record<string, number>
  }
}

export interface MemberSession {
  account?: MemberAccount
  isAuthenticated: boolean
}

export type AuthIntent = 'signup' | 'login'

export interface MemberSessionDraft {
  intent?: AuthIntent
  password?: string
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
  checkoutMode?: 'onsite' | 'redirect'
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
  redirectFields?: Record<string, string>
  redirectUrl?: string
  status: MemberPlanStatus
}
