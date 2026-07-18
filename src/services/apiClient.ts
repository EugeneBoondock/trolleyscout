import { getStaticOffersPayload, getStaticRetailersPayload } from '../api/staticData'
import { filterRetailers } from './sourceEngine'
import { validateOfferDraft as validateOfferDraftLocal } from './offerValidation'
import type {
  ApiEnvelope,
  BasketItemCreateResponse,
  BasketItemDeleteResponse,
  BasketItemUpdateResponse,
  BasketResponse,
  DiscoveryResponse,
  MemberSessionResponse,
  OfferCreateResponse,
  OfferDeleteResponse,
  OfferValidationResponse,
  OffersResponse,
  RetailersResponse,
  SavedDealCreateResponse,
  SavedDealDeleteResponse,
  SavedDealsResponse,
  SavedSourceCreateResponse,
  SavedSourceDeleteResponse,
  SavedSourcesResponse,
  SourceSummary,
  SubscriptionCheckoutResponse,
  SubscriptionResponse,
} from '../api/contracts'
import type {
  AdminOverview,
  Basket,
  BasketItemDraft,
  BasketQuantityDraft,
  DealWatch,
  DealWatchMatch,
  MemberAccount,
  MemberPlan,
  MemberSession,
  MemberSessionDraft,
  OfferDraft,
  OfferValidationResult,
  PropertyListingType,
  PropertySearchResult,
  Retailer,
  DiscoveryRun,
  DiscoveredDeal,
  SavedSource,
  SavedSourceDraft,
  SavedDeal,
  SavedDealDraft,
  SourceKind,
  StoreLeaflet,
  SubscriptionCheckoutRequest,
  VerifiedOffer,
} from '../types'

type LoadStatus = 'loading' | 'ready' | 'error'

export interface ResourceState<T> {
  data: T
  meta: ApiEnvelope<T>['meta']
  message: string
  status: LoadStatus
}

export interface RetailerResource {
  retailers: Retailer[]
  summary: SourceSummary
}

export interface OfferResource {
  offers: VerifiedOffer[]
  summary: SourceSummary
}

export interface DiscoveryResource {
  discovery: DiscoveryRun
}

export interface MemberResource {
  session: MemberSession
}

export interface SavedSourceResource {
  savedSources: SavedSource[]
}

export interface SavedDealResource {
  savedDeals: SavedDeal[]
}

export interface BasketResource {
  basket: Basket
}

export interface SubscriptionResource {
  account?: MemberSession['account']
  billingReady: boolean
  plans: MemberPlan[]
}

const defaultMeta: ApiEnvelope<unknown>['meta'] = {
  generatedAt: new Date(0).toISOString(),
  source: 'static-fallback',
}

export function getInitialRetailerState(): ResourceState<RetailerResource> {
  const payload = getStaticRetailersPayload()

  return {
    data: payload,
    message: 'Loading source directory.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export function getInitialOfferState(): ResourceState<OfferResource> {
  const payload = getStaticOffersPayload()

  return {
    data: payload,
    message: 'Loading offer board.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export function getInitialDiscoveryState(): ResourceState<DiscoveryResource> {
  return {
    data: {
      discovery: emptyDiscoveryRun(),
    },
    message: 'Waiting to check deal sources.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export function getInitialMemberState(): ResourceState<MemberResource> {
  return {
    data: {
      session: {
        isAuthenticated: false,
      },
    },
    message: 'Checking member session.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export function getInitialSavedSourceState(): ResourceState<SavedSourceResource> {
  return {
    data: {
      savedSources: [],
    },
    message: 'Checking saved sources.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export function getInitialSubscriptionState(): ResourceState<SubscriptionResource> {
  return {
    data: {
      billingReady: false,
      plans: [],
    },
    message: 'Checking subscription.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export async function loadRetailers(options: {
  query: string
  sourceKind: SourceKind | 'all'
  signal?: AbortSignal
}): Promise<ResourceState<RetailerResource>> {
  const params = new URLSearchParams()

  if (options.query.trim()) {
    params.set('q', options.query.trim())
  }

  if (options.sourceKind !== 'all') {
    params.set('kind', options.sourceKind)
  }

  try {
    const queryString = params.toString()
    const response = await fetch(queryString ? `/api/retailers?${queryString}` : '/api/retailers', {
      headers: {
        accept: 'application/json',
      },
      signal: options.signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as RetailersResponse

    return {
      data: envelope.data,
      message: 'API live.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    const payload = getStaticRetailersPayload()

    return {
      data: {
        retailers: filterRetailers(payload.retailers, {
          query: options.query,
          sourceKind: options.sourceKind,
        }),
        summary: payload.summary,
      },
      message: 'Using bundled source list.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function loadOffers(signal?: AbortSignal): Promise<ResourceState<OfferResource>> {
  try {
    const response = await fetch('/api/offers', {
      headers: {
        accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as OffersResponse

    return {
      data: envelope.data,
      message: 'API live.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: getStaticOffersPayload(),
      message: 'Using bundled offer board.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export function getInitialSavedDealState(): ResourceState<SavedDealResource> {
  return {
    data: {
      savedDeals: [],
    },
    message: 'Checking saved deals.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export function getInitialBasketState(): ResourceState<BasketResource> {
  return {
    data: {
      basket: emptyBasket(),
    },
    message: 'Checking basket.',
    meta: defaultMeta,
    status: 'loading',
  }
}

export async function loadDiscovery(
  signal?: AbortSignal,
  options: { forceLive?: boolean } = {},
): Promise<ResourceState<DiscoveryResource>> {
  try {
    const response = await fetch(options.forceLive ? '/api/discovery?refresh=1' : '/api/discovery', {
      headers: {
        accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as DiscoveryResponse

    return {
      data: {
        discovery: envelope.data,
      },
      message: 'Discovery check finished.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        discovery: emptyDiscoveryRun(),
      },
      message: 'Discovery API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function validateOfferDraft(
  draft: OfferDraft,
  signal?: AbortSignal,
): Promise<ResourceState<OfferValidationResult>> {
  try {
    const response = await fetch('/api/offer-validator', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    })
    const envelope = (await response.json()) as OfferValidationResponse

    return {
      data: envelope.data,
      message: response.ok ? 'API live.' : 'Offer needs edits.',
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: validateOfferDraftLocal(draft),
      message: 'Using local validator.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'ready',
    }
  }
}

export async function createVerifiedOffer(
  draft: OfferDraft,
  signal?: AbortSignal,
): Promise<ResourceState<OfferCreateResponse['data'] | OfferValidationResult>> {
  try {
    const response = await fetch('/api/offers', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    })
    const envelope = (await response.json()) as OfferCreateResponse | OfferValidationResponse

    return {
      data: envelope.data,
      message: response.ok ? 'Saved to backend.' : 'Offer needs edits.',
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        accepted: false,
        issues: [
          {
            field: 'source',
            message: 'Open the Cloudflare preview to save verified offers.',
            severity: 'error',
          },
        ],
      },
      message: 'Backend unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function deleteVerifiedOffer(
  id: string,
  signal?: AbortSignal,
): Promise<ResourceState<OfferDeleteResponse['data']>> {
  try {
    const response = await fetch(`/api/offers?id=${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
      },
      method: 'DELETE',
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as OfferDeleteResponse

    return {
      data: envelope.data,
      message: envelope.data.deleted ? 'Offer removed.' : 'Offer was already absent.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        deleted: false,
        id,
        summary: getStaticOffersPayload().summary,
      },
      message: 'Backend unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function loadMemberSession(signal?: AbortSignal): Promise<ResourceState<MemberResource>> {
  try {
    const response = await fetch('/api/member-session', {
      headers: {
        accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as MemberSessionResponse

    return {
      data: envelope.data,
      message: envelope.data.session.isAuthenticated ? 'Member session active.' : 'Signed out.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        session: {
          isAuthenticated: false,
        },
      },
      message: 'Member API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function startMemberSession(
  draft: MemberSessionDraft,
  signal?: AbortSignal,
): Promise<ResourceState<MemberResource>> {
  try {
    const response = await fetch('/api/member-session', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    })
    const envelope = (await response.json()) as MemberSessionResponse

    return {
      data: envelope.data,
      message: response.ok ? 'Member session started.' : 'Member session needs edits.',
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        session: {
          isAuthenticated: false,
        },
      },
      message: 'Member API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function endMemberSession(signal?: AbortSignal): Promise<ResourceState<MemberResource>> {
  try {
    const response = await fetch('/api/member-session', {
      headers: {
        accept: 'application/json',
      },
      method: 'DELETE',
      signal,
    })
    const envelope = (await response.json()) as MemberSessionResponse

    return {
      data: envelope.data,
      message: 'Signed out.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        session: {
          isAuthenticated: false,
        },
      },
      message: 'Member API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function loadSavedSources(signal?: AbortSignal): Promise<ResourceState<SavedSourceResource>> {
  try {
    const response = await fetch('/api/saved-sources', {
      headers: {
        accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as SavedSourcesResponse

    return {
      data: envelope.data,
      message: 'Saved sources loaded.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        savedSources: [],
      },
      message: 'Saved source API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function saveSourceForMember(
  draft: SavedSourceDraft,
  signal?: AbortSignal,
): Promise<ResourceState<SavedSourceCreateResponse['data'] | SavedSourcesResponse['data']>> {
  try {
    const response = await fetch('/api/saved-sources', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    })
    const envelope = (await response.json()) as SavedSourceCreateResponse | SavedSourcesResponse

    return {
      data: envelope.data,
      message: response.ok ? 'Source saved.' : 'Source could not be saved.',
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        savedSources: [],
      },
      message: 'Saved source API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function deleteSavedSource(
  id: string,
  signal?: AbortSignal,
): Promise<ResourceState<SavedSourceDeleteResponse['data']>> {
  try {
    const response = await fetch(`/api/saved-sources?id=${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
      },
      method: 'DELETE',
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as SavedSourceDeleteResponse

    return {
      data: envelope.data,
      message: envelope.data.deleted ? 'Source removed.' : 'Source was already absent.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        deleted: false,
        id,
        savedSources: [],
      },
      message: 'Saved source API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function loadSubscription(signal?: AbortSignal): Promise<ResourceState<SubscriptionResource>> {
  try {
    const response = await fetch('/api/subscription', {
      headers: {
        accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as SubscriptionResponse

    return {
      data: envelope.data,
      message: 'Subscription loaded.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        billingReady: false,
        plans: [],
      },
      message: 'Subscription API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function startSubscriptionCheckout(
  draft: SubscriptionCheckoutRequest,
  signal?: AbortSignal,
): Promise<ResourceState<SubscriptionCheckoutResponse['data']>> {
  try {
    const response = await fetch('/api/subscription', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    })
    const envelope = (await response.json()) as SubscriptionCheckoutResponse

    return {
      data: envelope.data,
      message: envelope.data.checkout.message,
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        checkout: {
          billingCycle: draft.billingCycle,
          billingReady: false,
          message: 'Subscription API unavailable.',
          planId: draft.planId,
          provider: 'payfast',
          status: 'billing_not_configured',
        },
      },
      message: 'Subscription API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export interface NearbyStoreResult {
  placeId: string
  name: string
  address?: string
  lat: number
  lon: number
  website?: string
  distanceM?: number
  retailerId?: string
  logoUrl?: string
  firstSeenAt?: string
  lastSeenAt?: string
  promotionCount?: number
  deals: DiscoveredDeal[]
  leaflets: StoreLeaflet[]
  promotions: Array<{
    id: string
    kind: 'deal' | 'catalogue'
    title: string
    priceText?: string
    previousPriceText?: string
    savingText?: string
    sourceUrl: string
    productUrl?: string
    imageUrl?: string
    validFrom?: string
    validTo?: string
  }>
}

export interface DiscoveredStoresResource {
  stores: NearbyStoreResult[]
  summary: {
    areaCount: number
    knownChainCount: number
    storeCount: number
    withPromotionsCount: number
  }
}

export async function loadDiscoveredStores(
  signal?: AbortSignal,
): Promise<DiscoveredStoresResource> {
  try {
    const response = await fetch('/api/discovered-stores', {
      headers: { accept: 'application/json' },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as { data: DiscoveredStoresResource }
    return envelope.data
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      stores: [],
      summary: { areaCount: 0, knownChainCount: 0, storeCount: 0, withPromotionsCount: 0 },
    }
  }
}

export interface NearbyStoresState {
  status: 'idle' | 'locating' | 'loading' | 'ready' | 'error'
  message: string
  servedFrom?: 'cache' | 'live'
  stores: NearbyStoreResult[]
  summary?: { storeCount: number; knownChainCount: number; withDealsCount: number }
}

export async function loadNearbyStores(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<NearbyStoresState> {
  try {
    const response = await fetch(
      `/api/nearby-stores?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      { headers: { accept: 'application/json' }, signal },
    )

    if (!response.ok) {
      return { message: 'Could not find stores near you.', status: 'error', stores: [] }
    }

    const envelope = (await response.json()) as {
      data: {
        servedFrom?: 'cache' | 'live'
        stores: NearbyStoreResult[]
        summary?: NearbyStoresState['summary']
        message?: string
      }
    }

    return {
      message: envelope.data.message ?? 'Stores near you.',
      servedFrom: envelope.data.servedFrom,
      status: 'ready',
      stores: envelope.data.stores ?? [],
      summary: envelope.data.summary,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return { message: 'Store discovery is unavailable.', status: 'error', stores: [] }
  }
}

export async function loadAdminOverview(
  signal?: AbortSignal,
): Promise<{ data?: AdminOverview; message: string; status: 'ready' | 'error' }> {
  try {
    const response = await fetch('/api/admin', {
      headers: { accept: 'application/json' },
      signal,
    })

    if (!response.ok) {
      return {
        message: response.status === 403 ? 'Admin access is required.' : 'Admin data unavailable.',
        status: 'error',
      }
    }

    const envelope = (await response.json()) as { data: AdminOverview }

    return { data: envelope.data, message: 'Admin data loaded.', status: 'ready' }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return { message: 'Admin data unavailable.', status: 'error' }
  }
}

export async function updateAccountProfile(displayName: string) {
  return postAccount({ action: 'profile', displayName })
}

export async function changeAccountPassword(currentPassword: string, newPassword: string) {
  return postAccount({ action: 'password', currentPassword, newPassword })
}

async function postAccount(body: Record<string, string>) {
  try {
    const response = await fetch('/api/account', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const envelope = (await response.json()) as {
      data?: { account?: MemberAccount; issues?: string[]; message?: string }
    }

    return {
      account: envelope.data?.account,
      message: envelope.data?.message ?? envelope.data?.issues?.[0] ?? 'Could not update account.',
      ok: response.ok,
    }
  } catch {
    return { message: 'Account API unavailable.', ok: false }
  }
}

export async function loadSavedDeals(signal?: AbortSignal): Promise<ResourceState<SavedDealResource>> {
  try {
    const response = await fetch('/api/saved-deals', {
      headers: {
        accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as SavedDealsResponse

    return {
      data: envelope.data,
      message: 'Saved deals loaded.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        savedDeals: [],
      },
      message: 'Saved deal API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function saveDealForMember(
  draft: SavedDealDraft,
  signal?: AbortSignal,
): Promise<ResourceState<SavedDealCreateResponse['data'] | SavedDealsResponse['data']>> {
  try {
    const response = await fetch('/api/saved-deals', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    })
    const envelope = (await response.json()) as SavedDealCreateResponse | SavedDealsResponse

    return {
      data: envelope.data,
      message: response.ok ? 'Deal saved.' : 'Deal could not be saved.',
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        savedDeals: [],
      },
      message: 'Saved deal API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function deleteSavedDeal(
  id: string,
  signal?: AbortSignal,
): Promise<ResourceState<SavedDealDeleteResponse['data']>> {
  try {
    const response = await fetch(`/api/saved-deals?id=${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
      },
      method: 'DELETE',
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as SavedDealDeleteResponse

    return {
      data: envelope.data,
      message: envelope.data.deleted ? 'Deal removed.' : 'Deal was already absent.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        deleted: false,
        id,
        savedDeals: [],
      },
      message: 'Saved deal API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function loadBasket(signal?: AbortSignal): Promise<ResourceState<BasketResource>> {
  try {
    const response = await fetch('/api/basket-items', {
      headers: {
        accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as BasketResponse

    return {
      data: envelope.data,
      message: 'Basket loaded.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        basket: emptyBasket(),
      },
      message: 'Basket API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function addBasketItemForMember(
  draft: BasketItemDraft,
  signal?: AbortSignal,
): Promise<ResourceState<BasketItemCreateResponse['data'] | BasketResponse['data']>> {
  try {
    const response = await fetch('/api/basket-items', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    })
    const envelope = (await response.json()) as BasketItemCreateResponse | BasketResponse

    return {
      data: envelope.data,
      message: response.ok ? 'Added to basket.' : 'Basket item could not be saved.',
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        basket: emptyBasket(),
      },
      message: 'Basket API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function updateBasketItemForMember(
  draft: BasketQuantityDraft,
  signal?: AbortSignal,
): Promise<ResourceState<BasketItemUpdateResponse['data'] | BasketResponse['data']>> {
  try {
    const response = await fetch('/api/basket-items', {
      body: JSON.stringify(draft),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'PATCH',
      signal,
    })
    const envelope = (await response.json()) as BasketItemUpdateResponse | BasketResponse

    return {
      data: envelope.data,
      message: response.ok ? 'Basket updated.' : 'Basket item could not be updated.',
      meta: envelope.meta,
      status: response.ok ? 'ready' : 'error',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        basket: emptyBasket(),
      },
      message: 'Basket API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export async function deleteBasketItemForMember(
  id: string,
  signal?: AbortSignal,
): Promise<ResourceState<BasketItemDeleteResponse['data']>> {
  try {
    const response = await fetch(`/api/basket-items?id=${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
      },
      method: 'DELETE',
      signal,
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const envelope = (await response.json()) as BasketItemDeleteResponse

    return {
      data: envelope.data,
      message: envelope.data.deleted ? 'Basket item removed.' : 'Basket item was already absent.',
      meta: envelope.meta,
      status: 'ready',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    return {
      data: {
        basket: emptyBasket(),
        deleted: false,
        id,
      },
      message: 'Basket API unavailable.',
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'static-fallback',
      },
      status: 'error',
    }
  }
}

export interface DealWatchListResult {
  watches: DealWatch[]
  alertCount: number
}

export interface DealWatchCreateResult {
  watches: DealWatch[]
  matches: DealWatchMatch[]
  message: string
  issue?: string
}

export async function loadDealWatches(signal?: AbortSignal): Promise<DealWatchListResult> {
  const response = await fetch('/api/deal-watches', {
    headers: { accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    return { alertCount: 0, watches: [] }
  }

  const envelope = (await response.json()) as {
    data?: { watches?: DealWatch[]; alertCount?: number }
  }

  return {
    alertCount: envelope.data?.alertCount ?? 0,
    watches: envelope.data?.watches ?? [],
  }
}

export async function createDealWatch(query: string): Promise<DealWatchCreateResult> {
  const response = await fetch('/api/deal-watches', {
    body: JSON.stringify({ query }),
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    method: 'POST',
  })

  const envelope = (await response.json()) as {
    data?: { watches?: DealWatch[]; matches?: DealWatchMatch[]; message?: string; issues?: string[] }
  }

  return {
    issue: response.ok ? undefined : (envelope.data?.issues?.[0] ?? 'Could not save the watch.'),
    matches: envelope.data?.matches ?? [],
    message: envelope.data?.message ?? '',
    watches: envelope.data?.watches ?? [],
  }
}

export async function markDealWatchSeen(id: string): Promise<DealWatch[]> {
  const response = await fetch('/api/deal-watches', {
    body: JSON.stringify({ id }),
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    method: 'PATCH',
  })

  const envelope = (await response.json()) as { data?: { watches?: DealWatch[] } }
  return envelope.data?.watches ?? []
}

export async function deleteDealWatch(id: string): Promise<DealWatch[]> {
  const response = await fetch(`/api/deal-watches?id=${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json' },
    method: 'DELETE',
  })

  const envelope = (await response.json()) as { data?: { watches?: DealWatch[] } }
  return envelope.data?.watches ?? []
}

export type PropertySearchOutcome =
  | { ok: true; result: PropertySearchResult }
  | { ok: false; locked?: boolean; needsAuth?: boolean; message: string }

export interface PropertySearchInput {
  query: string
  listingType: PropertyListingType
  lat?: number
  lon?: number
  page?: number
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  sort?: string
}

// Properties Scout search. Access is enforced server-side; a 401 means log in,
// a 403 means the plan does not include it (the view shows an upgrade card).
export async function searchProperties(
  input: PropertySearchInput,
  signal?: AbortSignal,
): Promise<PropertySearchOutcome> {
  const params = new URLSearchParams({ q: input.query, type: input.listingType })
  if (input.lat !== undefined && input.lon !== undefined) {
    params.set('lat', String(input.lat))
    params.set('lon', String(input.lon))
  }
  if (input.page && input.page > 1) params.set('page', String(input.page))
  if (input.minPrice) params.set('minPrice', String(input.minPrice))
  if (input.maxPrice) params.set('maxPrice', String(input.maxPrice))
  if (input.minBeds) params.set('minBeds', String(input.minBeds))
  if (input.sort && input.sort !== 'relevance') params.set('sort', input.sort)

  try {
    const response = await fetch(`/api/properties?${params.toString()}`, {
      headers: { accept: 'application/json' },
      signal,
    })
    const envelope = (await response.json()) as {
      data?: PropertySearchResult & { error?: string; locked?: boolean; reason?: string }
    }
    if (!response.ok || !envelope.data || !('listings' in envelope.data)) {
      return {
        ok: false,
        locked: envelope.data?.locked ?? response.status === 403,
        needsAuth: response.status === 401,
        message: envelope.data?.error ?? 'Could not search properties.',
      }
    }
    return { ok: true, result: envelope.data }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    return { ok: false, message: 'Properties Scout is unavailable right now.' }
  }
}

// Admin-only: grant or revoke a single member's Properties Scout access.
export async function setMemberPropertiesAccess(accountId: string, granted: boolean) {
  try {
    const response = await fetch('/api/admin', {
      body: JSON.stringify({ action: 'set_properties_access', accountId, granted }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const envelope = (await response.json()) as {
      data?: { account?: MemberAccount; accounts?: MemberAccount[]; message?: string }
    }
    return {
      account: envelope.data?.account,
      accounts: envelope.data?.accounts,
      message: envelope.data?.message ?? (response.ok ? 'Access updated.' : 'Could not update access.'),
      ok: response.ok,
    }
  } catch {
    return { message: 'Admin API unavailable.', ok: false }
  }
}

function emptyDiscoveryRun(): DiscoveryRun {
  return {
    deals: [] satisfies DiscoveredDeal[],
    leaflets: [],
    sources: [],
    summary: {
      checkedSourceCount: 0,
      dataPolicy: 'Discovery rows require official source pages and extracted source text.',
      foundDealCount: 0,
      leafletCount: 0,
      unavailableSourceCount: 0,
    },
  }
}

function emptyBasket(): Basket {
  return {
    items: [],
    summary: {
      itemCount: 0,
      knownPriceItemCount: 0,
      savingsCents: 0,
      totalCents: 0,
    },
  }
}
