import type { RetailerDealScope } from './services/retailerFeeds/types'

export type KnownRetailerId =
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
  | 'fair-price'
  | 'yuppiechef'
  | 'nike'
  | 'adidas'
  | 'puma'
  | 'under-armour'
  | 'new-balance'
  | 'asics'
  | 'superbalist'
  | 'bash'
  | 'sportscene'
  | 'totalsports'
  | 'archive'
  | 'sneaker-factory'
  | 'shelflife'
  | 'sportsmans-warehouse'
  | 'mr-price'
  | 'truworths'
  | 'office-london'
  | 'edgars'
  | 'cape-union-mart'
  | 'old-khaki'
  | 'cotton-on'
  | 'h-and-m'
  | 'zara'
  | 'kit-kat'
  | 'president-hyper'
  | 'roots-butchery'
  | 'frontline'
  | 'walmart'

export type RetailerId = KnownRetailerId | (string & {})

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
  | 'Fashion'
  | 'Sports and outdoors'

export interface RetailerSource {
  label: string
  url: string
  kind: SourceKind
}

export type RetailerOfferStatus =
  | 'available'
  | 'checking'
  | 'no-current-offers'
  | 'not-checked'
  | 'temporarily-unavailable'
  | 'unverified'

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
  // International store directories can be much larger than the current deal
  // snapshot. This says what the source check actually found, so a transport
  // failure or a shop waiting for its first pass is never presented as “0
  // deals”.
  offerStatus?: RetailerOfferStatus
  offersCheckedAt?: string
}

export type ScoutChatRole = 'assistant' | 'user'

export interface ScoutChatTurn {
  role: ScoutChatRole
  text: string
}

export interface ScoutChatDealCard {
  id: string
  imageUrl?: string
  previousPriceText?: string
  priceText: string
  productUrl: string
  retailerName: string
  savingText?: string
  soldOut?: boolean
  title: string
}

export interface ScoutChatCatalogueCard {
  id: string
  imageUrl?: string
  name: string
  pageCount: number
  pageImageUrls: string[]
  pagesUrl?: string
  retailerName: string
  url: string
  validTo?: string
}

export interface ScoutChatAnswer {
  catalogues: ScoutChatCatalogueCard[]
  deals: ScoutChatDealCard[]
  followUps: string[]
  reply: string
  /** Ties a thumbs rating back to the retrieval that produced this answer. */
  retrievalId?: string
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
  | 'generic-storefront'
  | 'json-storefront'
  | 'vtex-catalogue'
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
  unitText?: string
  // True only when the shop states every way of buying this is gone. Absent
  // when the shop says nothing, since a wrong sold-out badge sends a shopper
  // away from something they could have had.
  soldOut?: boolean
  evidenceText: string
  imageUrl?: string
  images?: string[]
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
  countryCode?: string
  imageUrl?: string
  documentUrl?: string
  pages?: CataloguePage[]
  pagesUrl?: string
  priceScope?: RetailerDealScope
  retailerLogoUrl?: string
  retailerUrl?: string
  sourceId?: string
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
  access?: {
    availableCatalogueCount: number
    availableDealCount: number
    catalogueLimit: number
    dealLimit: number
    planId: MemberPlanId
  }
  deals: DiscoveredDeal[]
  businessStories?: BusinessStoryPublication[]
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

export type MemberPlanId = 'free' | 'scout' | 'household' | 'organization' | 'developers'

export type BillingCycle = 'monthly' | 'annual'

// 'scheduled' means the member asked for a cheaper plan and it is queued for the
// end of the period they already paid for, rather than taking effect now.
export type MemberPlanStatus =
  | 'active'
  | 'billing_not_configured'
  | 'checkout_required'
  | 'scheduled'

export interface MemberPlanLimits {
  savedSources: number
  savedDeals: number
  basketItems: number
  visibleCatalogues: number
  visibleDeals: number
}

// What a business on the Organisation plan may do. Absent on shopper plans,
// which is what gates the merchant features rather than an id comparison.
export interface MemberPlanMerchant {
  includedAdsPerMonth: number
  livePromos: number
  shopProfiles: number
}

export interface BusinessStoryPublication {
  bodyText: string
  id: string
  imageAlt?: string
  imageUrl: string
  offerText?: string
  organizationName: string
  organizationSlug: string
  priceText?: string
  targetUrl: string
  title: string
}

export interface MemberPlanDeveloper {
  callsPerMinute: number
  callsPerMonth: number
}

export type DeveloperScope =
  | 'shopping:read'
  | 'trends:read'
  | 'campaigns:read'
  | 'campaigns:write'

export interface DeveloperApiKeySummary {
  createdAt: string
  expiresAt?: string
  id: string
  keyPrefix: string
  lastUsedAt?: string
  name: string
  revokedAt?: string
  scopes: DeveloperScope[]
}

export interface DeveloperKeyResource {
  allowance: MemberPlanDeveloper
  keys: DeveloperApiKeySummary[]
  scopes: DeveloperScope[]
  usage: number
}

export interface MemberPlan {
  id: MemberPlanId
  name: string
  description: string
  badge: string
  // Announced on the pricing page but not yet open for sign-ups, because the
  // features it promises are still being built. Nobody can be charged for one.
  comingSoon?: boolean
  isPaid: boolean
  statusText: string
  features: string[]
  limits: MemberPlanLimits
  developer?: MemberPlanDeveloper
  merchant?: MemberPlanMerchant
  // Rand cents: what PayFast debits, whatever currency the shopper was quoted.
  prices: {
    annual: number
    monthly: number
  }
  // Whole units of the shopper's own currency — the price they were quoted.
  // Absent on the free plan, and on the static table nobody has been priced
  // against yet. When its currency is rand it simply matches `prices`.
  localPrices?: {
    annual: number
    currencyCode: string
    monthly: number
  }
}

export type MemberRole = 'member' | 'admin'

export type MemberAccountStatus = 'active' | 'banned'

export interface MemberAccount {
  id: string
  email: string
  emailVerified?: boolean
  displayName: string
  initials: string
  planId: MemberPlanId
  planName: string
  planStatus: MemberPlanStatus
  role: MemberRole
  countryCode: string
  countryName: string
  currencyCode: string
  // True when this member may open Properties Scout: the Household plan grants
  // it, admins always have it, and an admin can grant it to any single member.
  propertiesAccess: boolean
  createdAt: string
  updatedAt: string
  // Moderation and presence. A banned account keeps all of its data but no
  // session resolves for it, so the person is signed out of every device.
  status: MemberAccountStatus
  banReason?: string
  bannedAt?: string
  lastSeenAt?: string
  // Only populated on admin reads — how many deals this member has opened.
  dealViewCount?: number
  billingCycle?: BillingCycle
  // End of the period already paid for, and the downgrade queued to land on it.
  // Both are absent unless the member has an active paid subscription; the
  // pending fields are absent unless they have asked to move to a cheaper plan.
  currentPeriodEnd?: string
  pendingBillingCycle?: BillingCycle
  pendingEffectiveAt?: string
  pendingPlanId?: MemberPlanId
  phoneVerified?: boolean
}

export type OrganizationApplicationStatus = 'pending' | 'approved' | 'rejected'

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

export interface OrganizationApplication extends OrganizationApplicationDraft {
  id: string
  accountId: string
  status: OrganizationApplicationStatus
  planId?: string
  planStatus?: string
  businessSubscriptionActive: boolean
  reviewNote?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

// Properties Scout — a Household-tier tool that finds homes to buy or rent from
// the SA property portals (Property24, Private Property).
export type PropertyListingType = 'sale' | 'rent'

export type KnownPropertyPortalId =
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

export type PropertyPortalId = KnownPropertyPortalId | (string & {})

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
  currencyCode?: string
}

export interface PropertyPortalSourceMeta {
  id: PropertyPortalId
  label: string
  count: number
  ok: boolean
}

export interface PropertySearchResult {
  country?: CountryOption
  listings: PropertyListing[]
  sources: PropertyPortalSourceMeta[]
  listingType: PropertyListingType
  page: number
  locationText?: string
  refreshedAt?: string
}

export interface SupportMessage {
  id: string
  accountId?: string
  name: string
  email: string
  topic: string
  message: string
  status: 'open' | 'resolved'
  adminNote?: string
  // Where it came from: the support form, or the AI help chat. A chat message
  // carries a brief the model wrote from the member's own words — the brief
  // sits beside `message`, it never replaces it.
  channel?: 'form' | 'chat'
  aiBrief?: string
  category?: string
  severity?: string
  createdAt: string
  updatedAt: string
}

export type SupportChatRole = 'user' | 'assistant'

export interface SupportChatTurn {
  role: SupportChatRole
  text: string
}

/// One reply from the help chat. When the model has heard enough it also
/// returns [filed], the brief it sent to the admin.
export interface SupportChatAnswer {
  reply: string
  filed?: {
    category: string
    severity: string
    summary: string
    topic: string
  }
}

/// Member-side numbers, straight out of our own database. Every series is
/// aligned to [days], one value per day, oldest first.
export interface AdminAnalytics {
  activeMembers: number[]
  days: string[]
  dealViews: number[]
  signups: number[]
  topSearches: Array<{ count: number; term: string }>
  totals: {
    accountCount: number
    activeThisWeek: number
    activeToday: number
    bannedCount: number
    dealViewsInWindow: number
    neverSeenCount: number
  }
}

export interface AdminTrafficDay {
  bytes: number
  date: string
  pageViews: number
  requests: number
  uniques: number
}

/// Cloudflare zone traffic. [configured] is false when the read token is not
/// set, in which case [issue] explains what to set.
export interface AdminTrafficReport {
  configured: boolean
  days: AdminTrafficDay[]
  issue?: string
  totals?: {
    bytes: number
    pageViews: number
    requests: number
    uniques: number
  }
}

export interface AdminAnalyticsReport {
  members: AdminAnalytics
  traffic: AdminTrafficReport
  windowDays: number
}

export interface AdminOverview {
  accounts: MemberAccount[]
  countries: CountryOption[]
  emailProtection: {
    configured: boolean
    pendingAccounts: number
    pendingSupport: number
  }
  selectedCountry: CountryOption
  scout: {
    dealCount: number
    leafletCount: number
    lastScoutedAt?: string
    sourceCount: number
    storeCount: number
  }
  summary: {
    accountCount: number
    planCounts: Record<string, number>
    supportOpenCount: number
  }
  support: SupportMessage[]
}

export interface CountryOption {
  capital?: string
  code: string
  currencyCode: string
  flag: string
  name: string
}

export interface CountryContext extends CountryOption {
  locale: string
  rateFromZar?: number
  rateUpdatedAt?: string
}

export type RetailerProductSearchStatus = 'priced' | 'found' | 'unavailable'

export interface RetailerProductSearchMatch {
  /// Runner-up products from the same retailer's search, most relevant first,
  /// so a shopper can swap in the right item when word overlap fools the
  /// primary pick ("eggs" → "marshmallow eggs").
  alternatives?: RetailerProductAlternative[]
  isCheapest?: boolean
  priceCents?: number
  productUrl?: string
  retailerId: string
  retailerName: string
  sourceKind?: 'retailer-api' | 'official-site' | 'promotion'
  status: RetailerProductSearchStatus
  title?: string
  /**
   * Why nothing came back. "We could not reach the shop" and "the shop does
   * not stock this" are different answers to a shopper and used to share one
   * message.
   */
  unavailableReason?: 'no-search' | 'not-stocked' | 'store-unreachable'
}

export interface RetailerProductAlternative {
  priceCents: number
  productUrl: string
  title: string
}

export interface ProductComparisonResult {
  checkedAt: string
  cheapestRetailerId?: string
  country: CountryOption
  foundCount: number
  matches: RetailerProductSearchMatch[]
  pricedCount: number
  query: string
  savingsCents: number
  unavailableCount: number
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
  // Set when status is 'scheduled': the date the queued downgrade takes effect.
  effectiveAt?: string
  engineUrl?: string
  message: string
  onsiteUuid?: string
  planId: MemberPlanId
  provider: 'payfast'
  redirectFields?: Record<string, string>
  redirectUrl?: string
  status: MemberPlanStatus
}
