import { getStaticOffersPayload, getStaticRetailersPayload } from '../api/staticData'
import { filterRetailers } from './sourceEngine'
import { validateOfferDraft as validateOfferDraftLocal } from './offerValidation'
import type {
  ApiEnvelope,
  OfferCreateResponse,
  OfferDeleteResponse,
  OfferValidationResponse,
  OffersResponse,
  RetailersResponse,
  SourceSummary,
} from '../api/contracts'
import type { OfferDraft, OfferValidationResult, Retailer, SourceKind, VerifiedOffer } from '../types'

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
