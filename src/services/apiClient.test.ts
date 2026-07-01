import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSourceSummary } from '../api/staticData'
import type { OfferDraft } from '../types'
import {
  createVerifiedOffer,
  deleteSavedSource,
  deleteVerifiedOffer,
  endMemberSession,
  loadDiscovery,
  loadMemberSession,
  loadOffers,
  loadRetailers,
  loadSavedSources,
  loadSubscription,
  saveSourceForMember,
  startMemberSession,
  startSubscriptionCheckout,
  validateOfferDraft,
} from './apiClient'

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

  it('loads source-backed discovery runs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            deals: [
              {
                capturedAt: '2026-07-01T00:00:00.000Z',
                evidenceText: 'Source product. Now R99.99',
                id: 'deal-test',
                priceText: 'R99.99',
                productUrl: 'https://www.dischem.co.za/product-test',
                retailerId: 'dis-chem',
                retailerName: 'Dis-Chem',
                sourceLabel: 'On promotion',
                sourceUrl: 'https://www.dischem.co.za/on-promotion',
                title: 'Source product',
              },
            ],
            sources: [
              {
                checkedAt: '2026-07-01T00:00:00.000Z',
                httpStatus: 200,
                itemCount: 1,
                retailerId: 'dis-chem',
                retailerName: 'Dis-Chem',
                sourceLabel: 'On promotion',
                sourceUrl: 'https://www.dischem.co.za/on-promotion',
                status: 'found',
                statusText: 'Source-backed rows found.',
              },
            ],
            summary: {
              checkedSourceCount: 1,
              dataPolicy: 'Official source text only.',
              foundDealCount: 1,
              unavailableSourceCount: 0,
            },
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

    const state = await loadDiscovery()

    expect(fetchMock).toHaveBeenCalledWith('/api/discovery', expect.objectContaining({ headers: expect.any(Object) }))
    expect(state.data.discovery.summary.foundDealCount).toBe(1)
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

  it('loads a member session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            session: {
              isAuthenticated: false,
            },
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

    const state = await loadMemberSession()

    expect(fetchMock).toHaveBeenCalledWith('/api/member-session', expect.objectContaining({ headers: expect.any(Object) }))
    expect(state.data.session.isAuthenticated).toBe(false)
  })

  it('starts and ends a member session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              session: {
                account: {
                  createdAt: '2026-07-01T00:00:00.000Z',
                  displayName: 'Test Shopper',
                  email: 'test@example.com',
                  id: 'member-test',
                  initials: 'TS',
                  planId: 'free',
                  planName: 'Free',
                  planStatus: 'active',
                  updatedAt: '2026-07-01T00:00:00.000Z',
                },
                isAuthenticated: true,
              },
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              session: {
                isAuthenticated: false,
              },
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

    const started = await startMemberSession({
      displayName: 'Test Shopper',
      email: 'test@example.com',
    })
    const ended = await endMemberSession()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/member-session', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/member-session', expect.objectContaining({ method: 'DELETE' }))
    expect(started.data.session.isAuthenticated).toBe(true)
    expect(ended.data.session.isAuthenticated).toBe(false)
  })

  it('manages saved sources through the member API', async () => {
    const savedSource = {
      createdAt: '2026-07-01T00:00:00.000Z',
      id: 'source-test',
      retailerId: 'pick-n-pay',
      retailerName: 'Pick n Pay',
      sourceKind: 'specials',
      sourceLabel: 'Catalogues',
      sourceUrl: 'https://www.pnp.co.za/catalogues',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              savedSources: [],
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              savedSource,
              savedSources: [savedSource],
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              deleted: true,
              id: savedSource.id,
              savedSources: [],
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

    const loaded = await loadSavedSources()
    const saved = await saveSourceForMember({
      retailerId: 'pick-n-pay',
      sourceUrl: 'https://www.pnp.co.za/catalogues',
    })
    const deleted = await deleteSavedSource(savedSource.id)

    expect(loaded.data.savedSources).toEqual([])
    expect('savedSource' in saved.data && saved.data.savedSource.id).toBe(savedSource.id)
    expect(deleted.data.deleted).toBe(true)
  })

  it('loads subscription plans and starts checkout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              billingReady: false,
              plans: [
                {
                  badge: 'Included',
                  description: 'Use the source directory.',
                  features: ['Official source directory'],
                  id: 'free',
                  isPaid: false,
                  name: 'Free',
                  statusText: 'Active now',
                },
              ],
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              checkout: {
                billingReady: false,
                message: 'Billing keys are not configured for this plan.',
                planId: 'scout',
                status: 'billing_not_configured',
              },
            },
            meta: {
              generatedAt: '2026-07-01T00:00:00.000Z',
              source: 'cloudflare-pages',
            },
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 503,
          },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const subscription = await loadSubscription()
    const checkout = await startSubscriptionCheckout({ planId: 'scout' })

    expect(subscription.data.plans).toHaveLength(1)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/subscription', expect.objectContaining({ method: 'POST' }))
    expect(checkout.data.checkout.status).toBe('billing_not_configured')
  })
})
