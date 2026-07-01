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
  Basket,
  BasketItemDraft,
  BasketQuantityDraft,
  MemberPlan,
  MemberSession,
  MemberSessionDraft,
  OfferDraft,
  OfferValidationResult,
  Retailer,
  DiscoveryRun,
  DiscoveredDeal,
  SavedSource,
  SavedSourceDraft,
  SavedDeal,
  SavedDealDraft,
  SourceKind,
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

export async function loadDiscovery(signal?: AbortSignal): Promise<ResourceState<DiscoveryResource>> {
  try {
    const response = await fetch('/api/discovery', {
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
          billingReady: false,
          message: 'Subscription API unavailable.',
          planId: draft.planId,
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

function emptyDiscoveryRun(): DiscoveryRun {
  return {
    deals: [] satisfies DiscoveredDeal[],
    sources: [],
    summary: {
      checkedSourceCount: 0,
      dataPolicy: 'Discovery rows require official source pages and extracted source text.',
      foundDealCount: 0,
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
