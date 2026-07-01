import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSourceSummary } from '../api/staticData'
import type { OfferDraft } from '../types'
import { createVerifiedOffer, deleteVerifiedOffer, loadOffers, loadRetailers, validateOfferDraft } from './apiClient'

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads retailers from the API when available', async () => {
    const summary = buildSourceSummary()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            retailers: [],
            summary,
          },
          meta: {
            generatedAt: '2026-07-01T00:00:00.000Z',
            source: 'cloudflare-pages',
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const state = await loadRetailers({ query: '', sourceKind: 'all' })

    expect(fetchMock).toHaveBeenCalledWith('/api/retailers', expect.any(Object))
    expect(state.meta.source).toBe('cloudflare-pages')
    expect(state.data.summary).toEqual(summary)
  })

  it('uses filtered bundled retailers when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const state = await loadRetailers({ query: 'clubcard', sourceKind: 'loyalty' })

    expect(state.meta.source).toBe('static-fallback')
    expect(state.data.retailers.map((retailer) => retailer.id)).toEqual(['clicks'])
  })

  it('keeps offers empty when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const state = await loadOffers()

    expect(state.meta.source).toBe('static-fallback')
    expect(state.data.offers).toEqual([])
  })

  it('posts offer drafts to the validator API', async () => {
    const draft: OfferDraft = {
      capturedAt: '2026-07-01',
      priceText: 'Source price text',
      retailerId: 'clicks',
      sourceUrl: 'https://clicks.co.za/clubcard',
      termsText: 'ClubCard terms from source',
      title: 'Source offer title',
      validTo: '2026-07-07',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            accepted: true,
            issues: [],
          },
          meta: {
            generatedAt: '2026-07-01T00:00:00.000Z',
            source: 'cloudflare-pages',
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const state = await validateOfferDraft(draft)

    expect(fetchMock).toHaveBeenCalledWith('/api/offer-validator', expect.objectContaining({ method: 'POST' }))
    expect(state.data.accepted).toBe(true)
  })

  it('saves verified offer drafts through the offers API', async () => {
    const draft: OfferDraft = {
      capturedAt: '2026-07-01',
      priceText: 'Source price text',
      retailerId: 'clicks',
      sourceUrl: 'https://clicks.co.za/clubcard',
      termsText: 'ClubCard terms from source',
      title: 'Source offer title',
      validFrom: '2026-07-01',
      validTo: '2026-07-07',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            offer: {
              capturedAt: draft.capturedAt,
              id: 'clicks-test',
              priceText: draft.priceText,
              retailerId: draft.retailerId,
              sourceUrl: draft.sourceUrl,
              termsText: draft.termsText,
              title: draft.title,
              validFrom: draft.validFrom,
              validTo: draft.validTo,
            },
            saved: true,
            summary: buildSourceSummary(),
          },
          meta: {
            generatedAt: '2026-07-01T00:00:00.000Z',
            source: 'cloudflare-pages',
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const state = await createVerifiedOffer(draft)

    expect(fetchMock).toHaveBeenCalledWith('/api/offers', expect.objectContaining({ method: 'POST' }))
    expect('saved' in state.data && state.data.saved).toBe(true)
  })

  it('deletes verified offers through the offers API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            deleted: true,
            id: 'clicks-test',
            summary: buildSourceSummary(),
          },
          meta: {
            generatedAt: '2026-07-01T00:00:00.000Z',
            source: 'cloudflare-pages',
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const state = await deleteVerifiedOffer('clicks-test')

    expect(fetchMock).toHaveBeenCalledWith('/api/offers?id=clicks-test', expect.objectContaining({ method: 'DELETE' }))
    expect(state.data.deleted).toBe(true)
  })
})
