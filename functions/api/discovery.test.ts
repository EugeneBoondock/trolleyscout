import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DealSnapshot } from '../_shared/dealSnapshotStore'
import type { StoredDealItem } from '../_shared/dealItemStore'
import type { DiscoveredDeal, StoreLeaflet } from '../../src/types'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  runDealRefreshWithAlerts: vi.fn(),
}))

vi.mock('../_shared/memberStore', async (importOriginal) => ({
  ...await importOriginal<typeof import('../_shared/memberStore')>(),
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/dealAlertStore', () => ({
  runDealRefreshWithAlerts: mocks.runDealRefreshWithAlerts,
}))
import {
  buildNormalizedDiscoveryChecks,
  buildSnapshotChecks,
  dedupeLeaflets,
  dedupeDiscoveryDeals,
  enrichInteractiveLeaflets,
  mergeNormalizedFirstChecks,
  onRequest,
  readNormalizedDealItems,
  refreshLeafletCache,
  resolvePnpHflipDocuments,
  storePromotionsToDiscovery,
} from './discovery'

beforeEach(() => {
  mocks.getMemberSession.mockReset()
  mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
  mocks.runDealRefreshWithAlerts.mockReset()
  mocks.runDealRefreshWithAlerts.mockImplementation(async (
    _env: unknown,
    refresh: () => Promise<unknown>,
  ) => ({ alerts: {}, value: await refresh() }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildSnapshotChecks', () => {
  it('surfaces catalogue scans from retailers outside the fixed source list', () => {
    const snapshots = new Map<string, DealSnapshot>([
      [
        'kit-kat::Catalogue scan',
        {
          checkedAt: '2026-07-15T12:00:00.000Z',
          deals: [
            {
              capturedAt: '2026-07-15T12:00:00.000Z',
              evidenceText: 'Tastic Rice 2kg R29.99',
              id: 'kit-kat-rice',
              priceText: 'R29.99',
              productUrl: 'https://kitkatgroup.com/current.pdf',
              retailerId: 'kit-kat',
              retailerName: 'Kit Kat Cash & Carry',
              sourceLabel: 'Catalogue scan',
              sourceUrl: 'https://kitkatgroup.com/current.pdf',
              title: 'Tastic Rice 2kg',
            },
          ],
        },
      ],
    ])

    const result = buildSnapshotChecks(snapshots)
    const external = result.find((item) => item.source.retailerId === 'kit-kat')

    expect(external?.source).toMatchObject({
      itemCount: 1,
      retailerName: 'Kit Kat Cash & Carry',
      sourceLabel: 'Catalogue scan',
      status: 'found',
    })
    expect(external?.deals[0].title).toBe('Tastic Rice 2kg')
  })
})

describe('storePromotionsToDiscovery', () => {
  it('maps store deals and catalogues into the global response shapes', () => {
    const result = storePromotionsToDiscovery([
      {
        id: 'deal-1',
        imageUrl: 'https://market.test/rice.jpg',
        kind: 'deal',
        placeId: 'market-1',
        priceText: 'R29.99',
        productUrl: 'https://market.test/rice',
        sourceUrl: 'https://market.test/specials',
        storeName: 'Local Market',
        title: 'Rice 2kg',
      },
      {
        capturedAt: '2026-07-15T08:30:00.000Z',
        id: 'catalogue-1',
        imageUrl: 'https://market.test/catalogue.jpg',
        kind: 'catalogue',
        placeId: 'market-1',
        sourceUrl: 'https://market.test/catalogue.pdf',
        storeName: 'Local Market',
        title: 'Weekly catalogue',
        validTo: '2026-07-31',
      },
    ], '2026-07-16T10:00:00.000Z')

    expect(result.deals[0]).toMatchObject({
      imageUrl: 'https://market.test/rice.jpg',
      priceScope: { type: 'store', storeIds: ['market-1'] },
      retailerName: 'Local Market',
      sourceLabel: 'Store scout',
      title: 'Rice 2kg',
    })
    expect(result.leaflets[0]).toMatchObject({
      capturedAt: '2026-07-15T08:30:00.000Z',
      imageUrl: 'https://market.test/catalogue.jpg',
      name: 'Weekly catalogue',
      retailerName: 'Local Market',
      validTo: '2026-07-31',
    })
  })

  it('keeps matching offers from two branches distinct while global legacy duplicates collapse', () => {
    const branchPromotions = storePromotionsToDiscovery([
      {
        id: 'branch-one',
        kind: 'deal',
        placeId: 'branch-1',
        priceText: 'R29.99',
        productUrl: 'https://market.test/rice',
        retailerId: 'spar',
        sourceUrl: 'https://market.test/specials',
        storeName: 'SPAR Branch One',
        title: 'Rice 2kg',
      },
      {
        id: 'branch-two',
        kind: 'deal',
        placeId: 'branch-2',
        priceText: 'R31.99',
        productUrl: 'https://market.test/rice',
        retailerId: 'spar',
        sourceUrl: 'https://market.test/specials',
        storeName: 'SPAR Branch Two',
        title: 'Rice 2kg',
      },
    ], '2026-07-16T10:00:00.000Z')

    expect(dedupeDiscoveryDeals(branchPromotions.deals)).toHaveLength(2)
    expect(branchPromotions.deals.map((deal) => deal.priceScope)).toEqual([
      { type: 'store', storeIds: ['branch-1'] },
      { type: 'store', storeIds: ['branch-2'] },
    ])

    const globalRows = [
      {
        ...branchPromotions.deals[0],
        id: 'normalized-national',
        priceScope: { type: 'national' as const },
      },
      {
        ...branchPromotions.deals[0],
        id: 'legacy-no-scope',
        priceScope: undefined,
      },
    ]
    expect(dedupeDiscoveryDeals(globalRows).map((deal) => deal.id))
      .toEqual(['normalized-national'])
  })
})

describe('normalized discovery cutover', () => {
  it('selects national, online, province, then store scope and keeps normalized rows over legacy duplicates', () => {
    const items = [
      storedItem({ id: 'store', priceCents: 1_000, scope: { type: 'store', storeIds: ['cape-town'] } }),
      storedItem({ id: 'province', priceCents: 1_100, scope: { type: 'province', regionIds: ['western-cape'] } }),
      storedItem({ id: 'online', priceCents: 1_200, scope: { type: 'online' } }),
      storedItem({ id: 'national', priceCents: 1_300, scope: { type: 'national' } }),
    ]
    const normalized = buildNormalizedDiscoveryChecks(items)
    const legacy = [{
      deals: [{
        capturedAt: '2026-07-15T10:00:00.000Z',
        evidenceText: 'Legacy snapshot',
        id: 'legacy-duplicate',
        priceText: 'R99.99',
        productUrl: 'https://official.test/products/rice?tracking=legacy',
        retailerId: 'woolworths' as const,
        retailerName: 'Woolworths',
        sourceLabel: 'Legacy',
        sourceUrl: 'https://official.test/legacy',
        title: 'Rice 2kg',
      }, {
        capturedAt: '2026-07-15T10:00:00.000Z',
        evidenceText: 'Legacy-only snapshot',
        id: 'legacy-only',
        productUrl: 'https://official.test/products/milk',
        retailerId: 'woolworths' as const,
        retailerName: 'Woolworths',
        sourceLabel: 'Legacy',
        sourceUrl: 'https://official.test/legacy',
        title: 'Milk 2L',
      }],
      source: {
        checkedAt: '2026-07-15T10:00:00.000Z',
        itemCount: 2,
        retailerId: 'woolworths' as const,
        retailerName: 'Woolworths',
        sourceLabel: 'Legacy',
        sourceUrl: 'https://official.test/legacy',
        status: 'found' as const,
        statusText: 'Captured.',
      },
    }]

    const merged = mergeNormalizedFirstChecks(normalized, legacy)
    const deals = merged.flatMap((check) => check.deals)

    expect(deals.filter((deal) => deal.productId === 'rice')).toHaveLength(1)
    expect(deals.find((deal) => deal.productId === 'rice')).toMatchObject({
      id: 'national',
      priceScope: { type: 'national' },
      priceText: 'R13.00',
    })
    expect(deals.some((deal) => deal.id === 'legacy-duplicate')).toBe(false)
    expect(deals.some((deal) => deal.id === 'legacy-only')).toBe(true)
  })

  it('falls back to legacy checks when normalized storage has no active rows', () => {
    const legacy = buildSnapshotChecks(new Map<string, DealSnapshot>([[
      'kit-kat::Catalogue scan',
      {
        checkedAt: '2026-07-15T12:00:00.000Z',
        deals: [{
          capturedAt: '2026-07-15T12:00:00.000Z',
          evidenceText: 'Legacy row',
          id: 'legacy-row',
          productUrl: 'https://official.test/legacy-row',
          retailerId: 'kit-kat',
          retailerName: 'Kit Kat Cash & Carry',
          sourceLabel: 'Catalogue scan',
          sourceUrl: 'https://official.test/catalogue.pdf',
          title: 'Legacy row',
        }],
      },
    ]]))

    expect(mergeNormalizedFirstChecks([], legacy)).toEqual(legacy)
  })

  it('maps normalized catalogue page evidence back to public crop metadata', () => {
    const fingerprint = 'b'.repeat(64)
    const item = storedItem({
      evidenceText: JSON.stringify({
        crop: { height: 0.25, width: 0.2, x: 0.1, y: 0.3 },
        deepLink: 'https://official.test/catalogue/index.html#page=4',
        documentFingerprint: fingerprint,
        pageImageUrl: 'https://official.test/catalogue/page0004_3.webp',
        pageNumber: 4,
        priceCents: 2_999,
        promotionMarker: 'catalogue-page',
        sourceId: 'rice',
      }),
      imageUrl: 'https://official.test/catalogue/page0004_3.webp',
      productUrl: 'https://official.test/catalogue/index.html#page=4',
      sourceKind: 'catalogue',
      sourceKey: `catalogue::shoprite::${fingerprint}`,
    })

    const deal = buildNormalizedDiscoveryChecks([item])[0].deals[0]

    expect(deal).toMatchObject({
      catalogueDeepLink: 'https://official.test/catalogue/index.html#page=4',
      catalogueFingerprint: fingerprint,
      imageCrop: { height: 0.25, width: 0.2, x: 0.1, y: 0.3 },
      imageUrl: 'https://official.test/catalogue/page0004_3.webp',
      pageNumber: 4,
    })
  })

  it('pages D1 reads in bounded chunks up to the overall safety cap', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => storedItem({
      id: `row-${index}`,
      productId: `product-${index}`,
    }))
    const listItems = vi.fn(async (_env, options) =>
      rows.slice(options.offset, options.offset + options.limit))

    const result = await readNormalizedDealItems(
      { DB: {} as D1Database },
      '2026-07-16T12:00:00.000Z',
      { listItems, pageSize: 2, safetyCap: 5 },
    )

    expect(result).toHaveLength(5)
    expect(listItems.mock.calls.map(([, options]) => [options.offset, options.limit]))
      .toEqual([[0, 2], [2, 2], [4, 1]])
  })

  it('degrades to legacy storage when the normalized table is not deployed', async () => {
    const listItems = vi.fn(async () => {
      throw new Error('no such table: deal_items')
    })

    await expect(readNormalizedDealItems(
      { DB: {} as D1Database },
      '2026-07-16T12:00:00.000Z',
      { listItems },
    )).resolves.toEqual([])
  })

  it('serves a normalized-only cache without starting live retailer fetches', async () => {
    const current = new Date().toISOString()
    const db = fakeDiscoveryDatabase(storedItem({
      capturedAt: current,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      lastSeenAt: current,
      updatedAt: current,
    }))
    const liveFetch = vi.fn(async () => {
      throw new Error('live fetch must not block normalized cache responses')
    })
    vi.stubGlobal('fetch', liveFetch)

    try {
      const response = await onRequest({
        data: {},
        env: {
          ASSETS: { fetch: async () => new Response('asset') },
          DB: db,
        },
        functionPath: '/api/discovery',
        next: async () => new Response('next'),
        passThroughOnException: () => undefined,
        params: {},
        request: new Request('https://trolleyscout.co.za/api/discovery'),
        waitUntil: vi.fn(),
      })
      const body = await response.json() as { data: { deals: Array<{ id: string }>; served: string } }

      expect(body.data.served).toBe('snapshot')
      expect(body.data.deals.map((deal) => deal.id)).toContain('normalized-1')
      expect(liveFetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('serves an empty stored cache without starting live retailer fetches', async () => {
    const liveFetch = vi.fn(async () => {
      throw new Error('plain reads must not call retailer sites')
    })
    vi.stubGlobal('fetch', liveFetch)
    const waitUntil = vi.fn()

    const response = await onRequest({
      data: {},
      env: {
        ASSETS: { fetch: async () => new Response('asset') },
        DB: fakeDiscoveryDatabase(),
      },
      functionPath: '/api/discovery',
      next: async () => new Response('next'),
      passThroughOnException: () => undefined,
      params: {},
      request: new Request('https://trolleyscout.co.za/api/discovery'),
      waitUntil,
    })
    const body = await response.json() as { data: { deals: unknown[]; served: string } }

    expect(response.status).toBe(200)
    expect(body.data.served).toBe('snapshot')
    expect(body.data.deals).toEqual([])
    expect(liveFetch).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('rejects a forced refresh from a non-admin account before fetching sources', async () => {
    mocks.getMemberSession.mockResolvedValue({
      isAuthenticated: true,
      account: { id: 'member-1', role: 'member' },
    })
    const liveFetch = vi.fn(async () => new Response('', { status: 503 }))
    vi.stubGlobal('fetch', liveFetch)

    const response = await onRequest({
      data: {},
      env: {
        ASSETS: { fetch: async () => new Response('asset') },
        DB: fakeDiscoveryDatabase(),
      },
      functionPath: '/api/discovery',
      next: async () => new Response('next'),
      passThroughOnException: () => undefined,
      params: {},
      request: new Request('https://trolleyscout.co.za/api/discovery?refresh=1'),
      waitUntil: vi.fn(),
    })

    expect(response.status).toBe(403)
    expect(liveFetch).not.toHaveBeenCalled()
  })

  it('allows an administrator to force a live source refresh', async () => {
    mocks.getMemberSession.mockResolvedValue({
      isAuthenticated: true,
      account: { id: 'admin-1', role: 'admin' },
    })
    const liveFetch = vi.fn(async () => new Response('', { status: 503 }))
    vi.stubGlobal('fetch', liveFetch)

    const response = await onRequest({
      data: {},
      env: {
        ASSETS: { fetch: async () => new Response('asset') },
        DB: fakeDiscoveryDatabase(),
      },
      functionPath: '/api/discovery',
      next: async () => new Response('next'),
      passThroughOnException: () => undefined,
      params: {},
      request: new Request('https://trolleyscout.co.za/api/discovery?refresh=1'),
      waitUntil: vi.fn(),
    })

    expect(response.status).toBe(200)
    expect(liveFetch).toHaveBeenCalled()
    expect(mocks.runDealRefreshWithAlerts).toHaveBeenCalledTimes(1)
  })
})

describe('interactive catalogue manifest enrichment', () => {
  it('adds official high-resolution page URLs and preserves leaflets when a manifest fails', async () => {
    const leaflets = [{
      capturedAt: '2026-07-16T10:00:00.000Z',
      documentUrl: 'https://specials.shoprite.co.za/current/catalogue.pdf',
      id: 'shoprite-current',
      imageUrl: 'https://specials.shoprite.co.za/current/cover.webp',
      name: 'Shoprite current deals',
      retailerId: 'shoprite' as const,
      retailerName: 'Shoprite',
      url: 'https://specials.shoprite.co.za/current/index.html',
    }, {
      capturedAt: '2026-07-16T10:00:00.000Z',
      id: 'checkers-current',
      imageUrl: 'https://specials.checkers.co.za/current/cover.webp',
      name: 'Checkers current deals',
      retailerId: 'checkers' as const,
      retailerName: 'Checkers',
      url: 'https://specials.checkers.co.za/current/index.html',
    }]
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('checkers')) {
        return new Response('manifest unavailable', { status: 503 })
      }
      return new Response(`window.pager = ${JSON.stringify({
        pages: {
          defaults: {
            substrateFormat: 'jpg',
            substrateSizes: [650, 960, 1350, 2050],
            substrateSizesReady: [true, true, true, true],
            substrateWebPCount: 4,
          },
          structure: ['1', '2'],
        },
      })};`, { headers: { 'content-type': 'text/javascript' } })
    })

    const enriched = await enrichInteractiveLeaflets(leaflets, { fetcher })

    expect(enriched[0]).toMatchObject({
      imageUrl: leaflets[0].imageUrl,
      pages: [
        expect.objectContaining({ pageNumber: 1, width: 1350 }),
        expect.objectContaining({ pageNumber: 2, width: 1350 }),
      ],
    })
    expect(enriched[1]).toEqual(leaflets[1])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('probes a bare HTML leaflet for an embedded viewer and builds its pages', async () => {
    const leaflet = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      id: 'edgars-specials',
      name: 'Edgars specials',
      retailerId: 'edgars' as const,
      retailerName: 'Edgars',
      url: 'https://www.edgars.co.za/specials',
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/pager.js')) {
        return new Response(`window.pager = ${JSON.stringify({
          pages: {
            defaults: {
              substrateFormat: 'jpg',
              substrateSizes: [1350],
              substrateSizesReady: [true],
              substrateWebPCount: 1,
            },
            structure: ['1'],
          },
        })};`, { headers: { 'content-type': 'text/javascript' } })
      }
      return new Response(
        '<a href="https://online.flippingbook.com/view/53977247/">Read our leaflet</a>',
        { headers: { 'content-type': 'text/html' } },
      )
    })

    const enriched = await enrichInteractiveLeaflets([leaflet], { fetcher })

    expect(enriched[0].pages).toEqual([
      expect.objectContaining({
        imageUrl:
          'https://online.flippingbook.com/view/53977247/files/assets/common/page-html5-substrates/page0001_1.webp',
        pageNumber: 1,
      }),
    ])
    // The official source link must stay on the retailer page, not the viewer.
    expect(enriched[0].url).toBe(leaflet.url)
  })

  it('falls back to the og:image cover when a probed page has no viewer', async () => {
    const leaflet = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      id: 'clicks-specials',
      name: 'Clicks specials',
      retailerId: 'clicks' as const,
      retailerName: 'Clicks',
      url: 'https://clicks.co.za/promotions',
    }
    const fetcher = vi.fn(async () => new Response(
      '<meta property="og:image" content="/media/promo-cover.jpg">',
      { headers: { 'content-type': 'text/html' } },
    ))

    const enriched = await enrichInteractiveLeaflets([leaflet], { fetcher })

    expect(enriched[0].imageUrl).toBe('https://clicks.co.za/media/promo-cover.jpg')
  })

  it('leaves PDF-only leaflets untouched — readers embed those directly', async () => {
    const leaflet = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      documentUrl: 'https://www.okfoods.co.za/leaflets/CEN-Foods.pdf',
      id: 'ok-foods-cen',
      name: 'OK Foods specials',
      retailerId: 'ok-foods' as const,
      retailerName: 'OK Foods',
      url: 'https://www.okfoods.co.za/leaflets/CEN-Foods.pdf',
    }
    const fetcher = vi.fn(async () => new Response('should not fetch'))

    const enriched = await enrichInteractiveLeaflets([leaflet], { fetcher })

    expect(enriched[0]).toEqual(leaflet)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

function storedItem(overrides: Partial<StoredDealItem> = {}): StoredDealItem {
  return {
    capturedAt: '2026-07-16T10:00:00.000Z',
    contentFingerprint: 'a'.repeat(64),
    createdAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Official source price',
    expiresAt: '2026-07-17T10:00:00.000Z',
    id: 'normalized-1',
    imageUrl: 'https://official.test/products/rice.webp',
    lastSeenAt: '2026-07-16T10:00:00.000Z',
    priceCents: 2_999,
    previousPriceCents: 3_999,
    productId: 'rice',
    productUrl: 'https://official.test/products/rice',
    promotionId: 'rice-promo',
    retailerId: 'woolworths',
    savingText: 'Save R10',
    scope: { type: 'online' },
    sourceKey: 'woolworths::all-savings',
    sourceKind: 'structured',
    sourceUrl: 'https://www.woolworths.co.za/browse/food-south-africa/all-savings',
    status: 'active',
    title: 'Rice 2kg',
    updatedAt: '2026-07-16T10:00:00.000Z',
    validFrom: '2026-07-16T00:00:00.000Z',
    validTo: '2026-07-17T10:00:00.000Z',
    ...overrides,
  }
}

function fakeDiscoveryDatabase(item?: StoredDealItem) {
  const row = item ? {
    captured_at: item.capturedAt,
    content_fingerprint: item.contentFingerprint,
    created_at: item.createdAt,
    current_price_cents: item.priceCents,
    evidence_text: item.evidenceText,
    excluded_store_ids: '[]',
    expires_at: item.expiresAt,
    id: item.id,
    image_url: item.imageUrl ?? null,
    last_seen_at: item.lastSeenAt,
    previous_price_cents: item.previousPriceCents ?? null,
    product_url: item.productUrl,
    promotion_id: item.promotionId,
    retailer_id: item.retailerId,
    saving_text: item.savingText ?? null,
    scope_region_ids: '[]',
    scope_store_ids: '[]',
    scope_type: item.scope.type,
    source_key: item.sourceKey,
    source_kind: item.sourceKind,
    source_product_id: item.productId,
    source_url: item.sourceUrl,
    status: item.status,
    terms_text: null,
    title: item.title,
    unit_text: null,
    updated_at: item.updatedAt,
    valid_from: item.validFrom ?? null,
    valid_to: item.validTo ?? null,
  } : undefined

  return {
    prepare(sql: string) {
      const statement = {
        all: async () => ({
          results: sql.includes('FROM deal_items') && row ? [row] : [],
        }),
        bind: () => statement,
        first: async () => undefined,
        run: async () => ({ meta: { changes: 0 } }),
      }
      return statement
    },
  } as unknown as D1Database
}

describe('catalogue-scanned deals in the feed', () => {
  it('names the source "Catalogue scan" instead of the key fingerprint', () => {
    // Catalogue source keys end in a content fingerprint. The generic
    // last-segment rule surfaced that raw hash to shoppers as the deal source.
    const checks = buildNormalizedDiscoveryChecks([
      storedItem({
        id: 'catalogue-deal',
        productId: 'catalogue-9f2c',
        scope: { type: 'national' },
        sourceKey: `catalogue::shoprite::${'b'.repeat(64)}`,
      }),
    ])

    expect(checks).toHaveLength(1)
    expect(checks[0].source.sourceLabel).toBe('Catalogue scan')
    expect(checks[0].deals[0].sourceLabel).toBe('Catalogue scan')
  })
})

describe('catalogue deal dedupe', () => {
  const catalogueDeal = (overrides: Partial<DiscoveredDeal>): DiscoveredDeal => ({
    capturedAt: '2026-07-22T08:00:00.000Z',
    evidenceText: '{}',
    id: 'checkers-catalogue-1',
    priceText: 'R36.99',
    productId: 'catalogue-aaaaaaaaaaaaaaaaaaaaaaaa',
    productUrl: 'https://specials.checkers.co.za/current/index.html#page=2',
    priceScope: { storeIds: ['168228'], type: 'store' },
    retailerId: 'checkers',
    retailerName: 'Checkers',
    sourceLabel: 'Catalogue scan',
    sourceUrl: 'https://specials.checkers.co.za/current/index.html',
    title: 'Albany Wraps All Variants 250g',
    ...overrides,
  })

  it('keeps every product scanned from one catalogue despite the shared leaflet URL', () => {
    // Regression: the URL key strips the #page anchor, so all 88 items of a
    // Checkers catalogue collapsed into a single surviving deal.
    const deals = dedupeDiscoveryDeals([
      catalogueDeal({}),
      catalogueDeal({
        id: 'checkers-catalogue-2',
        productId: 'catalogue-bbbbbbbbbbbbbbbbbbbbbbbb',
        title: 'Nescafe Classic 200g',
      }),
      catalogueDeal({
        id: 'checkers-catalogue-3',
        productId: 'catalogue-cccccccccccccccccccccccc',
        productUrl: 'https://specials.checkers.co.za/current/index.html#page=2',
        title: 'Sunlight Liquid 750ml',
      }),
    ])

    expect(deals).toHaveLength(3)
  })

  it('still removes the same catalogue product stored twice', () => {
    const deals = dedupeDiscoveryDeals([
      catalogueDeal({}),
      catalogueDeal({ id: 'checkers-catalogue-duplicate' }),
    ])

    expect(deals).toHaveLength(1)
  })
})

describe('leaflet refresh retention', () => {
  it('keeps prior rows for a failed retailer while replacing successful retailer rows', async () => {
    const prior: StoreLeaflet[] = [{
      capturedAt: '2026-07-18T10:00:00.000Z',
      documentUrl: 'https://www.usave.co.za/catalogues/old.pdf',
      id: 'usave-old',
      name: 'Usave previous catalogue',
      retailerId: 'usave',
      retailerName: 'Usave',
      url: 'https://www.usave.co.za/catalogues/old.pdf',
    }, {
      capturedAt: '2026-07-18T10:00:00.000Z',
      documentUrl: 'https://www.okfoods.co.za/catalogues/old.pdf',
      id: 'ok-foods-old',
      name: 'OK Foods previous catalogue',
      retailerId: 'ok-foods',
      retailerName: 'OK Foods',
      url: 'https://www.okfoods.co.za/catalogues/old.pdf',
    }]
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('usave')) {
        return new Response('temporary failure', { status: 503 })
      }
      return new Response(`
        <a href="/content/dam/okfoods/specials/2026/week-29/WC-urban.pdf">
          Western Cape specials
        </a>
      `, { status: 200 })
    })
    const saveSnapshot = vi.fn(async () => undefined)

    const leaflets = await refreshLeafletCache(
      { DB: {} as D1Database },
      prior,
      {
        fetcher,
        saveSnapshot,
        targets: [{
          kind: 'html-pdf',
          origin: 'https://www.usave.co.za',
          pageUrl: 'https://www.usave.co.za/specials.html',
          retailerId: 'usave',
          retailerName: 'Usave',
        }, {
          kind: 'html-pdf',
          origin: 'https://www.okfoods.co.za',
          pageUrl: 'https://www.okfoods.co.za/specials.html',
          retailerId: 'ok-foods',
          retailerName: 'OK Foods',
        }],
      },
    )

    expect(leaflets.map((leaflet) => leaflet.id)).toContain('usave-old')
    expect(leaflets.map((leaflet) => leaflet.id)).not.toContain('ok-foods-old')
    expect(leaflets).toContainEqual(expect.objectContaining({
      retailerId: 'ok-foods',
      url: 'https://www.okfoods.co.za/content/dam/okfoods/specials/2026/week-29/WC-urban.pdf',
    }))
    expect(saveSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      leaflets,
      expect.any(String),
    )
  })
})

describe('Pick n Pay catalogue document enrichment', () => {
  const pnpLeaflet: StoreLeaflet = {
    capturedAt: '2026-07-16T10:00:00.000Z',
    id: 'pick-n-pay-weekly-gauteng',
    imageUrl: 'https://cdn-prd-02.pnp.co.za/catalogues/weekly.jpg',
    name: 'Pick n Pay Weekly Specials (Gauteng)',
    priceScope: { regionIds: ['Gauteng'], type: 'province' as const },
    retailerId: 'pick-n-pay' as const,
    retailerName: 'Pick n Pay',
    url: 'https://pnpcatalogues.hflip.co/4b5699c20a.html',
  }

  it('adds the trusted direct PDF to the leaflet returned by discovery refresh', async () => {
    const directPdf =
      'https://cdn.heyzine.com/flip-book/pdf/4b5699c20afee4a6fed85ec8013c92382fcaa693.pdf'
    const fetcher = vi.fn(async () => new Response(
      `<a class="download" href="${directPdf}">Download</a>`,
      { headers: { 'content-type': 'text/html' } },
    ))

    const result = await resolvePnpHflipDocuments([pnpLeaflet], { fetcher })

    expect(result).toEqual([{ ...pnpLeaflet, documentUrl: directPdf }])
    expect(fetcher).toHaveBeenCalledWith(
      pnpLeaflet.url,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('derives the direct PDF from a cdnc v3 thumbnail when no PDF link exists', async () => {
    // Newer HFlip viewers stopped linking cdn.heyzine.com/flip-book/pdf/…;
    // they only reference the upload's thumbnail on cdnc.heyzine.com.
    const hash = '43c46c1f1102cb881886c600965f039fab6e1ee3'
    const fetcher = vi.fn(async () => new Response(
      `<meta property="og:image"
         content="https://cdnc.heyzine.com/files/uploaded/v3/${hash}.pdf-thumb.jpg">`,
      { headers: { 'content-type': 'text/html' } },
    ))

    const result = await resolvePnpHflipDocuments([pnpLeaflet], { fetcher })

    expect(result).toEqual([{
      ...pnpLeaflet,
      documentUrl: `https://cdnc.heyzine.com/files/uploaded/v3/${hash}.pdf`,
    }])
  })

  it('accepts a direct v3 upload PDF on cdnc.heyzine.com', async () => {
    const directPdf =
      'https://cdnc.heyzine.com/files/uploaded/v3/43c46c1f1102cb881886c600965f039fab6e1ee3.pdf'
    const fetcher = vi.fn(async () => new Response(
      `<a href="${directPdf}">Download</a>`,
      { headers: { 'content-type': 'text/html' } },
    ))

    await expect(resolvePnpHflipDocuments([pnpLeaflet], { fetcher }))
      .resolves.toEqual([{ ...pnpLeaflet, documentUrl: directPdf }])
  })

  it('rejects a PDF URL on a lookalike host', async () => {
    const fetcher = vi.fn(async () => new Response(`
      <a href="https://cdn.heyzine.com.evil.test/flip-book/pdf/4b5699c20afee4a6fed85ec8013c92382fcaa693.pdf">
        Download
      </a>`))

    await expect(resolvePnpHflipDocuments([pnpLeaflet], { fetcher }))
      .resolves.toEqual([pnpLeaflet])
  })

  it('keeps the source leaflet when the viewer response exceeds its byte limit', async () => {
    const fetcher = vi.fn(async () => new Response('too large', {
      headers: { 'content-length': String(300 * 1024) },
    }))

    await expect(resolvePnpHflipDocuments([pnpLeaflet], { fetcher }))
      .resolves.toEqual([pnpLeaflet])
  })

  it('keeps the timeout active until the HFlip response body finishes', async () => {
    vi.useFakeTimers()
    let responseController: ReadableStreamDefaultController<Uint8Array> | undefined
    let requestSignal: AbortSignal | undefined
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          responseController = controller
          requestSignal?.addEventListener('abort', () => {
            controller.error(new Error('request aborted'))
          }, { once: true })
        },
      }))
    })

    try {
      const pending = resolvePnpHflipDocuments(
        [pnpLeaflet],
        { fetcher, timeoutMs: 25 },
      )
      await vi.advanceTimersByTimeAsync(26)
      const wasAborted = requestSignal?.aborted ?? false
      if (!wasAborted) {
        responseController?.error(new Error('test cleanup'))
      }
      await expect(pending).resolves.toEqual([pnpLeaflet])

      expect(wasAborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Pick n Pay generic catalogue suppression', () => {
  it('removes the unusable store-scout catalogue when official viewers exist', () => {
    const official = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      documentUrl:
        'https://cdn.heyzine.com/flip-book/pdf/4b5699c20afee4a6fed85ec8013c92382fcaa693.pdf',
      id: 'pick-n-pay-weekly',
      name: 'Pick n Pay Weekly Specials (Gauteng)',
      retailerId: 'pick-n-pay' as const,
      retailerName: 'Pick n Pay',
      url: 'https://pnpcatalogues.hflip.co/4b5699c20a.html',
    }
    const generic = {
      capturedAt: '2026-07-16T10:00:00.000Z',
      documentUrl: 'https://www.pnp.co.za/catalogues',
      id: 'store-scout-pnp',
      name: 'Pick n Pay catalogues',
      retailerId: 'pick-n-pay' as const,
      retailerName: 'Pick n Pay',
      sourceLabel: 'Store scout',
      url: 'https://www.pnp.co.za/catalogues',
    }
    const other = {
      ...generic,
      id: 'other-catalogue',
      retailerId: 'spar' as const,
      retailerName: 'SPAR',
      url: 'https://www.spar.co.za/catalogues',
    }

    expect(dedupeLeaflets([generic, other, official])).toEqual([other, official])
  })
})
