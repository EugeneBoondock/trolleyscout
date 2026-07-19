import { describe, expect, it, vi } from 'vitest'
import type { DealSnapshot } from '../_shared/dealSnapshotStore'
import type { StoredDealItem } from '../_shared/dealItemStore'
import {
  buildNormalizedDiscoveryChecks,
  buildSnapshotChecks,
  dedupeDiscoveryDeals,
  enrichInteractiveLeaflets,
  mergeNormalizedFirstChecks,
  onRequest,
  readNormalizedDealItems,
  storePromotionsToDiscovery,
} from './discovery'

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

function fakeDiscoveryDatabase(item: StoredDealItem) {
  const row = {
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
  }

  return {
    prepare(sql: string) {
      const statement = {
        all: async () => ({ results: sql.includes('FROM deal_items') ? [row] : [] }),
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
