import { describe, expect, it, vi } from 'vitest'
import { retailerSlug } from '../../src/services/retailerFeeds/types'
import type {
  FeedCursor,
  RetailerDealCandidate,
  RetailerCatalogueRecord,
  RetailerFeedPage,
} from '../../src/services/retailerFeeds/types'
import {
  decodeClicksPromotions,
  decodeWoolworthsInitialState,
  getStructuredRetailerSources,
  runStructuredRetailerFeedScout,
  type RetailerFeedSource,
  type RetailerFeedScoutStorage,
} from './retailerFeedScout'
import type { UpsertDealItemsOptions } from './dealItemStore'
import type { TrolleyScoutEnv } from './env'

describe('structured retailer source decoders', () => {
  it('extracts one balanced Woolworths initial-state object', () => {
    const response = {
      results: [{ data: { description: 'Text with } brace', id: 'ww-1' } }],
      total_num_results: 1,
    }
    const html = `<script>window.__INITIAL_STATE__ = ${JSON.stringify({
      ignored: { value: '{still text}' },
      plpReducer: { data: { response } },
    })}; window.after = {"doNotRead":true};</script>`

    expect(decodeWoolworthsInitialState(html)).toEqual({ response })
    expect(() => decodeWoolworthsInitialState(
      '<script>window.__INITIAL_STATE__ = {"plpReducer":{"data":{}}}</script>',
    )).toThrow(/Woolworths/)
  })

  it('normalizes Clicks numberOfPages before the strict adapter parses it', () => {
    const decoded = decodeClicksPromotions(JSON.stringify({
      pagination: {
        currentPage: 0,
        numberOfPages: 9,
        totalNumberOfResults: 427,
      },
      results: [],
    })) as { pagination: Record<string, unknown> }

    expect(decoded.pagination).toMatchObject({
      currentPage: 0,
      numberOfPages: 9,
      totalPages: 9,
      totalNumberOfResults: 427,
    })
  })

  it('registers bounded deal sources without mixing in Amazon vouchers', () => {
    const sources = getStructuredRetailerSources()

    expect(sources.map((source) => source.key)).toEqual([
      'woolworths::all-savings',
      'clicks::promotion-products',
      'food-lovers::specials',
      'game::bundle-deals',
      'game::savings',
      'builders::deals',
      'makro::catalogues-store',
      'dis-chem::klevu-promotions',
    ])
    expect(sources.every((source) => !source.key.includes('amazon'))).toBe(true)
  })

  it('builds bounded official requests for Builders, Makro, and Dis-Chem', () => {
    const sources = getStructuredRetailerSources()
    const builders = sources.find((source) => source.key === 'builders::deals')
    const makro = sources.find((source) => source.key === 'makro::catalogues-store')
    const dischem = sources.find((source) => source.key === 'dis-chem::klevu-promotions')

    expect(builders).toBeDefined()
    expect(makro).toBeDefined()
    expect(dischem).toBeDefined()

    const buildersRequest = builders!.buildRequest({ kind: 'page', page: 2 })
    expect(buildersRequest).toMatchObject({
      url: 'https://www.builders.co.za/web/v2/builders/channel/web/zone/B14/category/deals-17/search',
      init: {
        method: 'POST',
        body: JSON.stringify({
          currentPage: 2,
          pageSize: 100,
          query: ':bs-relevance',
        }),
      },
    })

    expect(makro!.buildRequest({ kind: 'page', page: 0 }).url).toBe(
      'https://www.makro.co.za/catalogues-store',
    )
    // Any non-token cursor falls back to a fresh Klevu discovery pass.
    const discoverUrl = dischem!.buildRequest({ kind: 'page', page: 0 }).url
    expect(discoverUrl).toContain('ksearchnet.com')
    expect(discoverUrl).toContain('enableFilters=true')

    const pagedUrl = dischem!.buildRequest({
      kind: 'token',
      token: '{"phase":"page","values":["20"],"valueIndex":0,"offset":100}',
    }).url
    expect(pagedUrl).toContain('filterResults=promo_discount_sap%3A20')
    expect(pagedUrl).toContain('paginationStartsFrom=100')
  })
})

describe('runStructuredRetailerFeedScout', () => {
  it('continues stored cursors and resets the last page to its initial cursor', async () => {
    const storage = fakeStorage(new Map([
      ['alpha::deals', { kind: 'page', page: 3 } as FeedCursor],
    ]))
    const seen: FeedCursor[] = []
    const source = testSource('alpha::deals', ({ cursor }) => {
      seen.push(cursor)
      return page([deal('alpha', 'a-1')])
    })

    const result = await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      {
        fetcher: async () => Response.json({ ok: true }),
        now: () => '2026-07-16T10:00:00.000Z',
        sources: [source],
        storage,
      },
    )

    expect(seen).toEqual([{ kind: 'page', page: 3 }])
    expect(storage.writeSourceCursor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cursor: { kind: 'page', page: 0 },
        sourceKey: 'alpha::deals',
      }),
    )
    expect(result).toMatchObject({
      acceptedDealCount: 1,
      checkedSourceCount: 1,
      failedSourceCount: 0,
      physicalRequestCount: 1,
    })
  })

  it('moves a successful source to the returned cursor', async () => {
    const storage = fakeStorage()
    const source = testSource('alpha::deals', () => page(
      [deal('alpha', 'a-1')],
      { kind: 'page', page: 1 },
    ))

    await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      {
        fetcher: async () => Response.json({ ok: true }),
        sources: [source],
        storage,
      },
    )

    expect(storage.writeSourceCursor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cursor: { kind: 'page', page: 1 } }),
    )
  })

  it('enforces the exact global physical-request cap', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }))
    const storage = fakeStorage()
    const sources = Array.from({ length: 5 }, (_, index) =>
      testSource(`retailer-${index}::deals`, () => page([])))

    const result = await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      { fetcher, requestCap: 3, sources, storage },
    )

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({
      checkedSourceCount: 3,
      physicalRequestCount: 3,
    })
  })

  it('covers every registered lane under the default request cap', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }))
    const sources = Array.from({ length: getStructuredRetailerSources().length }, (_, index) =>
      testSource(`retailer-${index}::deals`, () => page([])))

    const result = await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      { fetcher, sources, storage: fakeStorage() },
    )

    expect(result.checkedSourceCount).toBe(sources.length)
    expect(fetcher).toHaveBeenCalledTimes(sources.length)
  })

  it('records a failed source, preserves its cursor, and continues later sources', async () => {
    const originalCursor = { kind: 'page', page: 4 } as const
    const storage = fakeStorage(new Map([['bad::deals', originalCursor]]))
    const sources = [
      testSource('bad::deals', () => {
        throw new Error('decoder rejected response')
      }),
      testSource('good::deals', () => page([deal('good', 'good-1')])),
    ]

    const result = await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      {
        fetcher: async () => Response.json({ ok: true }),
        sources,
        storage,
      },
    )

    expect(result).toMatchObject({
      acceptedDealCount: 1,
      checkedSourceCount: 2,
      failedSourceCount: 1,
    })
    expect(storage.upsertDealItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        candidates: [],
        run: expect.objectContaining({ status: 'failed' }),
        sourceKey: 'bad::deals',
      }),
    )
    expect(storage.writeSourceCursor).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceKey: 'bad::deals' }),
    )
    expect(storage.writeSourceCursor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceKey: 'good::deals' }),
    )
  })

  it('counts accepted rows from normalized storage and reports catalogue candidates separately', async () => {
    const storage = fakeStorage()
    storage.upsertDealItems.mockResolvedValue({
      processed: 1,
      rowIds: ['stored-1'],
      runId: 'run-1',
    })
    const source = testSource('alpha::deals', () => ({
      candidates: [deal('alpha', 'a-1'), deal('alpha', 'a-1')],
      catalogues: [catalogue('alpha', 'catalogue-1'), {
        ...catalogue('alpha', 'catalogue-copy'),
        documentUrl: 'https://official.test/catalogues/catalogue-1.pdf',
      }],
    }))

    const result = await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      {
        fetcher: async () => Response.json({ ok: true }),
        sources: [source],
        storage,
      },
    )

    expect(result).toMatchObject({
      acceptedDealCount: 1,
      catalogueCount: 1,
      checkedSourceCount: 1,
    })
    expect(result.catalogues).toEqual([expect.objectContaining({
      documentUrl: 'https://official.test/catalogues/catalogue-1.pdf',
      imageUrl: 'https://official.test/catalogues/catalogue-1.webp',
      name: 'Catalogue catalogue-1',
      priceScope: { type: 'store', storeIds: ['alpha-branch'] },
      retailerId: 'alpha',
      retailerName: 'alpha',
      sourceLabel: 'Deals',
      validTo: '2026-07-20',
    })])
  })

  it('resumes a 205-candidate response as 100, 100, and 5 across three runs', async () => {
    const storage = fakeStorage()
    const candidates = Array.from({ length: 205 }, (_, index) =>
      deal('alpha', `product-${index}`))
    const seenSourceCursors: FeedCursor[] = []
    const source = testSource('alpha::deals', ({ cursor }) => {
      seenSourceCursors.push(cursor)
      return page(candidates, { kind: 'page', page: 8 })
    })
    const fetcher = vi.fn(async () => Response.json({ responseVersion: 1 }))

    const results = []
    for (let run = 0; run < 3; run += 1) {
      results.push(await runStructuredRetailerFeedScout(
        { DB: {} as D1Database },
        { fetcher, sources: [source], storage },
      ))
    }

    expect(results.map((result) => result.acceptedDealCount)).toEqual([100, 100, 5])
    expect(storage.upsertDealItems).toHaveBeenCalledTimes(3)
    expect(storage.upsertDealItems.mock.calls.map(([, options]) => options.candidates.length))
      .toEqual([100, 100, 5])
    expect(seenSourceCursors).toEqual([
      { kind: 'page', page: 0 },
      { kind: 'page', page: 0 },
      { kind: 'page', page: 0 },
    ])
    expect(storage.cursors.get('alpha::deals')).toEqual({ kind: 'page', page: 8 })
  })

  it('restarts an internal candidate window when the response fingerprint changes', async () => {
    const storage = fakeStorage()
    const candidates = Array.from({ length: 150 }, (_, index) =>
      deal('alpha', `product-${index}`))
    const source = testSource('alpha::deals', () => page(candidates))
    let responseVersion = 1
    const fetcher = vi.fn(async () => Response.json({ responseVersion }))

    await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      { fetcher, sources: [source], storage },
    )
    responseVersion = 2
    await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      { fetcher, sources: [source], storage },
    )

    expect(storage.upsertDealItems.mock.calls.map(([, options]) => [
      options.candidates.length,
      options.candidates[0]?.productId,
    ])).toEqual([
      [100, 'product-0'],
      [100, 'product-0'],
    ])
  })

  it('passes a native source token through without treating it as a window cursor', async () => {
    const native = { kind: 'token', token: 'retailer-native-next-token' } as const
    const storage = fakeStorage(new Map([['alpha::deals', native]]))
    const seen: FeedCursor[] = []
    const source = {
      ...testSource('alpha::deals', ({ cursor }) => {
        seen.push(cursor)
        return page([deal('alpha', 'a-1')])
      }),
      initialCursor: native,
    }

    await runStructuredRetailerFeedScout(
      { DB: {} as D1Database },
      {
        fetcher: async () => Response.json({ ok: true }),
        sources: [source],
        storage,
      },
    )

    expect(seen).toEqual([native])
  })
})

function testSource(
  key: string,
  parse: RetailerFeedSource['parse'],
): RetailerFeedSource {
  const retailerId = retailerSlug(key.split('::')[0])

  return {
    buildRequest: () => ({ url: `https://official.test/${key}` }),
    decode: (body) => JSON.parse(body),
    initialCursor: { kind: 'page', page: 0 },
    key,
    parse,
    retailerId,
    retailerName: retailerId,
    sourceLabel: 'Deals',
    sourceUrl: `https://official.test/${key}`,
  }
}

function page(
  candidates: RetailerDealCandidate[],
  nextCursor?: FeedCursor,
): RetailerFeedPage {
  return { candidates, catalogues: [], nextCursor }
}

function deal(retailerId: string, productId: string): RetailerDealCandidate {
  return {
    capturedAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Official promotion',
    priceCents: 2_999,
    productId,
    productUrl: `https://official.test/products/${productId}`,
    promotionId: `${productId}-promo`,
    retailerId: retailerSlug(retailerId),
    scope: { type: 'national' },
    sourceKind: 'structured',
    sourceUrl: 'https://official.test/specials',
    title: `Product ${productId}`,
  }
}

function catalogue(retailerId: string, catalogueId: string): RetailerCatalogueRecord {
  return {
    capturedAt: '2026-07-16T10:00:00.000Z',
    catalogueId,
    documentUrl: `https://official.test/catalogues/${catalogueId}.pdf`,
    evidenceText: 'Official catalogue',
    format: 'pdf',
    imageUrl: `https://official.test/catalogues/${catalogueId}.webp`,
    retailerId: retailerSlug(retailerId),
    scope: { type: 'store', storeIds: [`${retailerId}-branch`] },
    sourceUrl: 'https://official.test/catalogues',
    title: `Catalogue ${catalogueId}`,
    validFrom: '2026-07-16',
    validTo: '2026-07-20',
  }
}

function fakeStorage(cursors = new Map<string, FeedCursor>()) {
  const storage = {
    cursors,
    readSourceCursor: vi.fn(async (_env, sourceKey) => cursors.get(sourceKey)),
    upsertDealItems: vi.fn(async (
      _env: TrolleyScoutEnv,
      options: UpsertDealItemsOptions,
    ) => ({
      processed: options.candidates.length,
      rowIds: options.candidates.map((candidate) => candidate.productId),
      runId: 'run-1',
    })),
    writeSourceCursor: vi.fn(async (_env, options) => {
      cursors.set(options.sourceKey, options.cursor)
    }),
  }
  return storage satisfies RetailerFeedScoutStorage & { cursors: Map<string, FeedCursor> }
}
