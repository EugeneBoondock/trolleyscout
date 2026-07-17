// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoreLeaflet } from '../../src/types'
import {
  defaultPdfMarkdown,
  buildFlippingBookPages,
  claimCatalogueScanLease,
  catalogueLeaseOwnerToken,
  catalogueSourceKey,
  flippingBookPageUrls,
  flippingBookPagerUrl,
  parseFlippingBookPager,
  readHighResolutionImageDimensions,
  releaseCatalogueScanLease,
  runCatalogueScout,
  selectCatalogueWindow,
  selectUnscannedLeaflets,
} from './catalogueScout'

const leaseMigrationUrl = new NodeUrl('../../migrations/0014_catalogue_scan_leases.sql', import.meta.url)
const miniflareInstances: Miniflare[] = []

afterEach(async () => {
  await Promise.all(miniflareInstances.splice(0).map((instance) => instance.dispose()))
})

const capturedAt = '2026-07-15T12:00:00.000Z'

function leaflet(overrides: Partial<StoreLeaflet>): StoreLeaflet {
  return {
    capturedAt,
    id: 'leaflet-1',
    name: 'Weekly deals',
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    url: 'https://retailer.test/deals',
    ...overrides,
  }
}

describe('selectUnscannedLeaflets', () => {
  it('keeps one new document per retailer and skips previously scanned documents', () => {
    const existingUrl = 'https://retailer.test/existing.pdf'
    const snapshots = new Map([
      [
        'shoprite::Catalogue scan',
        {
          checkedAt: capturedAt,
          deals: [
            {
              capturedAt,
              evidenceText: 'Rice R20',
              id: 'deal-1',
              priceText: 'R20',
              productUrl: existingUrl,
              retailerId: 'shoprite' as const,
              retailerName: 'Shoprite',
              sourceLabel: 'Catalogue scan',
              sourceUrl: existingUrl,
              title: 'Rice',
            },
          ],
        },
      ],
    ])

    const selected = selectUnscannedLeaflets(
      [
        leaflet({ documentUrl: existingUrl }),
        leaflet({ documentUrl: 'https://retailer.test/new.pdf', id: 'leaflet-2' }),
        leaflet({ documentUrl: 'https://retailer.test/another.pdf', id: 'leaflet-3' }),
        leaflet({ documentUrl: 'https://kitkat.test/current.pdf', id: 'leaflet-4', retailerId: 'kit-kat', retailerName: 'Kit Kat Cash & Carry' }),
      ],
      snapshots,
      4,
    )

    expect(selected.map((item) => item.documentUrl)).toEqual([
      'https://retailer.test/new.pdf',
      'https://kitkat.test/current.pdf',
    ])
  })

  it('selects the first ready 1350px substrate and never emits the thumbnail path', () => {
    const interactive = leaflet({
      documentUrl: 'https://specials.shoprite.co.za/deals/current/catalogue.pdf',
      url: 'https://specials.shoprite.co.za/deals/current/index.html',
    })
    const pager = {
      pages: {
        defaults: {
          substrateFormat: 'jpg',
          substrateSizes: [650, 960, 1350, 2050],
          substrateSizesReady: [true, true, true, true],
          substrateWebPCount: 4,
        },
        structure: ['1', '2', '3'],
      },
    }

    expect(flippingBookPagerUrl(interactive)).toBe(
      'https://specials.shoprite.co.za/deals/current/files/assets/pager.js',
    )
    expect(flippingBookPageUrls(interactive, pager, 2)).toEqual([
      'https://specials.shoprite.co.za/deals/current/files/assets/common/page-html5-substrates/page0001_3.webp',
      'https://specials.shoprite.co.za/deals/current/files/assets/common/page-html5-substrates/page0002_3.webp',
    ])
    const firstPage = buildFlippingBookPages(interactive, pager, 1)[0]
    expect(firstPage).toMatchObject({
      fallbacks: [
        'https://specials.shoprite.co.za/deals/current/files/assets/common/page-html5-substrates/page0001_3.jpg',
        'https://specials.shoprite.co.za/deals/current/files/assets/common/page-html5-substrates/page0001_4.webp',
        'https://specials.shoprite.co.za/deals/current/files/assets/common/page-html5-substrates/page0001_4.jpg',
        'https://specials.shoprite.co.za/deals/current/catalogue.pdf',
      ],
      height: expect.any(Number),
      imageUrl: 'https://specials.shoprite.co.za/deals/current/files/assets/common/page-html5-substrates/page0001_3.webp',
      pageNumber: 1,
      width: 1350,
    })
    expect(JSON.stringify(firstPage)).not.toContain('_w.webp')
  })

  it('parses a JavaScript pager assignment before reading substrate metadata', () => {
    const pager = parseFlippingBookPager(`window.pager = ${JSON.stringify({
      pages: {
        defaults: {
          substrateFormat: 'jpg',
          substrateSizes: [650, 1350],
          substrateSizesReady: 2,
          substrateWebPCount: 2,
        },
        structure: ['one'],
      },
    })};`)

    expect(buildFlippingBookPages(leaflet({
      url: 'https://specials.checkers.co.za/current/index.html',
    }), pager)).toEqual([expect.objectContaining({
      imageUrl: 'https://specials.checkers.co.za/current/files/assets/common/page-html5-substrates/page0001_2.webp',
      width: 1350,
    })])
  })

  it('rejects small page images and reads PNG, JPEG, and WebP dimensions', () => {
    expect(() => readHighResolutionImageDimensions(pngHeader(960, 1358), 'image/png'))
      .not.toThrow()
    expect(() => readHighResolutionImageDimensions(pngHeader(800, 1100), 'image/png'))
      .toThrow(/1350/)
    expect(readHighResolutionImageDimensions(jpegHeader(1350, 1909), 'image/jpeg'))
      .toEqual({ height: 1909, width: 1350 })
    expect(readHighResolutionImageDimensions(webpHeader(2050, 2899), 'image/webp'))
      .toEqual({ height: 2899, width: 2050 })
  })
})

describe('selectCatalogueWindow', () => {
  it('rotates beyond the first bounded catalogue batch', () => {
    const leaflets = Array.from({ length: 6 }, (_, index) => leaflet({
      documentUrl: `https://retailer.test/catalogue-${index + 1}.pdf`,
      id: `leaflet-${index + 1}`,
    }))

    expect(selectCatalogueWindow(leaflets, 0, 4).map((item) => item.id)).toEqual([
      'leaflet-1',
      'leaflet-2',
      'leaflet-3',
      'leaflet-4',
    ])
    expect(selectCatalogueWindow(leaflets, 4, 4).map((item) => item.id)).toEqual([
      'leaflet-5',
      'leaflet-6',
      'leaflet-1',
      'leaflet-2',
    ])
  })
})

describe('catalogue scan leases', () => {
  it('prevents a duplicate claim and lets a later owner reclaim an expired lease', async () => {
    const db = await leaseDatabase()
    const sourceKey = 'catalogue::shoprite::abc123'

    await expect(claimCatalogueScanLease(db, {
      expiresAt: '2026-07-16T10:05:00.000Z',
      now: '2026-07-16T10:00:00.000Z',
      ownerToken: 'owner-a',
      sourceKey,
    })).resolves.toBe(true)
    await expect(claimCatalogueScanLease(db, {
      expiresAt: '2026-07-16T10:06:00.000Z',
      now: '2026-07-16T10:01:00.000Z',
      ownerToken: 'owner-b',
      sourceKey,
    })).resolves.toBe(false)
    await expect(claimCatalogueScanLease(db, {
      expiresAt: '2026-07-16T10:11:00.000Z',
      now: '2026-07-16T10:06:00.000Z',
      ownerToken: 'owner-b',
      sourceKey,
    })).resolves.toBe(true)
    await expect(releaseCatalogueScanLease(db, sourceKey, 'owner-a')).resolves.toBe(false)
    await expect(releaseCatalogueScanLease(db, sourceKey, 'owner-b')).resolves.toBe(true)
  })

  it('uses different source keys for regional catalogues from one retailer', async () => {
    const west = leaflet({
      id: 'regional-weekly',
      priceScope: { type: 'province', regionIds: ['western-cape'] },
      retailerId: 'food-lovers',
      url: 'https://food.test/current.pdf',
    })
    const gauteng = leaflet({
      ...west,
      priceScope: { type: 'province', regionIds: ['gauteng'] },
    })

    await expect(Promise.all([catalogueSourceKey(west), catalogueSourceKey(gauteng)]))
      .resolves.toSatisfy(([left, right]: string[]) => left !== right)
  })

  it('derives a deterministic lease owner from one run token and source key', async () => {
    const first = await catalogueLeaseOwnerToken('scheduled-run-1', 'catalogue::shoprite::one')
    const repeated = await catalogueLeaseOwnerToken('scheduled-run-1', 'catalogue::shoprite::one')
    const other = await catalogueLeaseOwnerToken('scheduled-run-1', 'catalogue::shoprite::two')

    expect(first).toMatch(/^catalogue-owner:[a-f0-9]{64}$/)
    expect(repeated).toBe(first)
    expect(other).not.toBe(first)
  })
})

describe('resumable catalogue scanning', () => {
  it('writes one normalized page per run, resumes, completes, and resets when the manifest changes', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const pageRequests: string[] = []
    let manifestVersion = 1
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('pager.js')) {
        return new Response(pagerManifest(2, manifestVersion))
      }
      pageRequests.push(url)
      return new Response(pngHeader(1350, 1909), {
        headers: { 'content-type': 'image/png' },
      })
    }) as typeof fetch
    const upsert = vi.fn(async (_env, options) => ({
      processed: options.candidates.length,
      rowIds: options.candidates.map((candidate: { productId: string }) => candidate.productId),
      runId: 'catalogue-run',
    }))
    const dependencies = catalogueDependencies({ cursors, fetcher, upsert })
    const current = leaflet({
      documentUrl: 'https://specials.shoprite.test/current/catalogue.pdf',
      priceScope: { type: 'province', regionIds: ['western-cape'] },
      url: 'https://specials.shoprite.test/current/index.html',
    })

    const env = { DB: {} as D1Database }
    await runCatalogueScout(env, [current], dependencies)
    await runCatalogueScout(env, [current], dependencies)
    const completed = await runCatalogueScout(env, [current], dependencies)
    manifestVersion = 2
    await runCatalogueScout(env, [current], dependencies)

    expect(pageRequests.map((url) => url.match(/page(\d{4})_3/)?.[1])).toEqual([
      '0001',
      '0002',
      '0001',
    ])
    expect(completed.scannedDocumentCount).toBe(0)
    expect(upsert).toHaveBeenCalledTimes(3)
    const firstWrite = upsert.mock.calls[0][1]
    expect(firstWrite.sourceKey).toMatch(/^catalogue::shoprite::[a-f0-9]{64}$/)
    expect(firstWrite.candidates[0]).toMatchObject({
      imageUrl: expect.stringContaining('page0001_3.webp'),
      priceCents: 2_999,
      previousPriceCents: 3_999,
      retailerId: 'shoprite',
      scope: { type: 'province', regionIds: ['western-cape'] },
      sourceKind: 'catalogue',
    })
    expect(JSON.parse(firstWrite.candidates[0].evidenceText)).toMatchObject({
      crop: { height: 0.2, width: 0.2, x: 0.1, y: 0.1 },
      documentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      pageNumber: 1,
      pageImageUrl: expect.stringContaining('page0001_3.webp'),
    })
  })

  it('scans a SPAR HTML leaflet through its public high-resolution cover image', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const htmlUrl = 'https://mobile.spar.test/specials/11111111-1111-1111-1111-111111111111/show'
    const imageUrl = 'https://www.spar.test/getattachment/11111111-1111-1111-1111-111111111111/img'
    const requests: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url === htmlUrl) {
        return new Response('<html><body><h1>Weekly specials</h1></body></html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (url === imageUrl) {
        return new Response(pngHeader(1350, 1909), {
          headers: { 'content-type': 'image/png' },
        })
      }
      throw new Error(`Unexpected request ${url}`)
    }) as typeof fetch
    const upsert = vi.fn(async (_env, options) => ({
      processed: options.candidates.length,
      rowIds: options.candidates.map((candidate: { productId: string }) => candidate.productId),
      runId: 'spar-image',
    }))
    const toMarkdown = vi.fn(async () => 'Should never run')

    const result = await runCatalogueScout({ DB: {} as D1Database }, [leaflet({
      documentUrl: htmlUrl,
      id: 'spar-special',
      imageUrl,
      retailerId: 'spar',
      retailerName: 'SPAR',
      url: htmlUrl,
    })], catalogueDependencies({ cursors, fetcher, toMarkdown, upsert }))

    expect(result.scannedDocumentCount).toBe(1)
    expect(requests).toEqual([htmlUrl, imageUrl])
    expect(toMarkdown).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][1].candidates[0]).toMatchObject({
      imageUrl,
      retailerId: 'spar',
      sourceKind: 'catalogue',
    })
    expect(documentCursorCount(cursors)).toBe(1)
  })

  it('uses a same-origin high-resolution page image and ignores page images from other origins', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const detailUrl = 'https://retailer.test/specials/weekly'
    const imageUrl = 'https://retailer.test/catalogues/weekly-page.png'
    const externalImageUrl = 'https://unverified-images.test/weekly-page.png'
    const requests: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url === detailUrl) {
        return new Response(`
          <img src="${externalImageUrl}" alt="Copied catalogue">
          <img src="/catalogues/weekly-page.png" alt="Weekly catalogue">
        `, { headers: { 'content-type': 'text/html' } })
      }
      if (url === imageUrl) {
        return new Response(pngHeader(1350, 1909), {
          headers: { 'content-type': 'image/png' },
        })
      }
      throw new Error(`Unexpected request ${url}`)
    }) as typeof fetch
    const upsert = vi.fn(async (_env, options) => ({
      processed: options.candidates.length,
      rowIds: [],
      runId: 'html-image',
    }))

    const result = await runCatalogueScout({ DB: {} as D1Database }, [leaflet({
      id: 'html-image',
      url: detailUrl,
    })], catalogueDependencies({ cursors, fetcher, upsert }))

    expect(result.scannedDocumentCount).toBe(1)
    expect(requests).toEqual([detailUrl, imageUrl])
    expect(upsert.mock.calls[0][1].candidates[0].imageUrl).toBe(imageUrl)
  })

  it('resolves a Boxer HTML detail page to a same-origin PDF and ignores an external PDF', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const detailUrl = 'https://www.boxer.test/promotions/month-end-savings'
    const pdfUrl = 'https://www.boxer.test/catalogues/month-end.pdf'
    const externalPdfUrl = 'https://catalogue-aggregator.test/copied.pdf'
    const requests: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url === detailUrl) {
        return new Response(`
          <html><body>
            <a href="${externalPdfUrl}">Copied catalogue</a>
            <a href="/catalogues/month-end.pdf">Read the official catalogue</a>
          </body></html>
        `, { headers: { 'content-type': 'text/html' } })
      }
      if (url === pdfUrl) {
        return new Response(pdfDocument(), { headers: { 'content-type': 'application/pdf' } })
      }
      throw new Error(`Unexpected request ${url}`)
    }) as typeof fetch
    const toMarkdown = vi.fn(async () => 'Tastic Long Grain Rice 2kg R29.99 was R39.99')
    const upsert = vi.fn(async (_env, options) => ({
      processed: options.candidates.length,
      rowIds: [],
      runId: 'boxer-pdf',
    }))

    const result = await runCatalogueScout({ DB: {} as D1Database }, [leaflet({
      id: 'boxer-special',
      retailerId: 'boxer',
      retailerName: 'Boxer',
      url: detailUrl,
    })], catalogueDependencies({ cursors, fetcher, toMarkdown, upsert }))

    expect(result.scannedDocumentCount).toBe(1)
    expect(requests).toEqual([detailUrl, pdfUrl])
    expect(fetcher).not.toHaveBeenCalledWith(externalPdfUrl, expect.anything())
    expect(toMarkdown).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][1].candidates[0]).toMatchObject({
      priceCents: 2_999,
      previousPriceCents: 3_999,
      retailerId: 'boxer',
    })
  })

  it('resolves a same-origin FlippingBook viewer from an HTML catalogue page', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const detailUrl = 'https://www.boxer.test/specials/weekly'
    const viewerUrl = 'https://www.boxer.test/catalogues/weekly/index.html'
    const pagerUrl = 'https://www.boxer.test/catalogues/weekly/files/assets/pager.js'
    const pageUrl = 'https://www.boxer.test/catalogues/weekly/files/assets/common/page-html5-substrates/page0001_3.webp'
    const requests: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url === detailUrl) {
        return new Response(`<a href="${viewerUrl}">Open catalogue</a>`, {
          headers: { 'content-type': 'text/html' },
        })
      }
      if (url === pagerUrl) {
        return new Response(pagerManifest(1, 1))
      }
      if (url === pageUrl) {
        return new Response(pngHeader(1350, 1909), {
          headers: { 'content-type': 'image/png' },
        })
      }
      throw new Error(`Unexpected request ${url}`)
    }) as typeof fetch
    const upsert = vi.fn(async (_env, options) => ({
      processed: options.candidates.length,
      rowIds: [],
      runId: 'boxer-viewer',
    }))

    const result = await runCatalogueScout({ DB: {} as D1Database }, [leaflet({
      id: 'boxer-viewer',
      retailerId: 'boxer',
      retailerName: 'Boxer',
      url: detailUrl,
    })], catalogueDependencies({ cursors, fetcher, upsert }))

    expect(result.scannedDocumentCount).toBe(1)
    expect(requests).toEqual([
      detailUrl,
      pagerUrl,
      pageUrl,
    ])
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('never sends HTML from a PDF-looking URL to document conversion', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const pdfUrl = 'https://retailer.test/catalogue.pdf'
    const fetcher = vi.fn(async () => new Response('<html>Access denied</html>', {
      headers: { 'content-type': 'text/html' },
    })) as typeof fetch
    const toMarkdown = vi.fn(async () => 'Rice 2kg R20.00')

    const result = await runCatalogueScout({ DB: {} as D1Database }, [leaflet({
      documentUrl: pdfUrl,
      url: pdfUrl,
    })], catalogueDependencies({ cursors, fetcher, toMarkdown }))

    expect(result.scannedDocumentCount).toBe(0)
    expect(toMarkdown).not.toHaveBeenCalled()
    expect(documentCursorCount(cursors)).toBe(0)
  })

  it.each(['fetch', 'ai', 'd1'] as const)(
    'does not advance the cursor after a %s failure',
    async (failure) => {
      const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
      const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('pager.js')) {
          return new Response(pagerManifest(1, 1))
        }
        return failure === 'fetch'
          ? new Response('failed', { status: 503 })
          : new Response(pngHeader(1350, 1909), { headers: { 'content-type': 'image/png' } })
      }) as typeof fetch
      const dependencies = catalogueDependencies({
        cursors,
        fetcher,
        runVision: failure === 'ai'
          ? async () => { throw new Error('AI unavailable') }
          : undefined,
        upsert: failure === 'd1'
          ? async () => { throw new Error('D1 unavailable') }
          : undefined,
      })

      await runCatalogueScout({ DB: {} as D1Database }, [leaflet({
        documentUrl: 'https://specials.shoprite.test/current/catalogue.pdf',
        url: 'https://specials.shoprite.test/current/index.html',
      })], dependencies)

      expect(documentCursorCount(cursors)).toBe(0)
    },
  )

  it('advances after a valid empty page and writes two regional catalogues separately', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const upsert = vi.fn(async (_env, options) => ({
      processed: options.candidates.length,
      rowIds: [],
      runId: 'empty-run',
    }))
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('pager.js')
      ? new Response(pagerManifest(1, 1))
      : new Response(pngHeader(1350, 1909), { headers: { 'content-type': 'image/png' } })) as typeof fetch
    const dependencies = catalogueDependencies({
      cursors,
      fetcher,
      runVision: async () => '{"deals":[]}',
      upsert,
    })
    const base = leaflet({
      id: 'regional',
      retailerId: 'food-lovers',
      retailerName: 'Food Lovers Market',
      url: 'https://food.test/current/index.html',
    })

    await runCatalogueScout({ DB: {} as D1Database }, [{
      ...base,
      priceScope: { type: 'province', regionIds: ['western-cape'] },
    }, {
      ...base,
      priceScope: { type: 'province', regionIds: ['gauteng'] },
    }], dependencies)

    expect(upsert).toHaveBeenCalledTimes(2)
    expect(new Set(upsert.mock.calls.map(([, options]) => options.sourceKey)).size).toBe(2)
    expect(documentCursorCount(cursors)).toBe(2)
  })

  it('keeps source-run audit timestamps ordered when the clock advances', async () => {
    const cursors = new Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>()
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('pager.js')
      ? new Response(pagerManifest(1, 1))
      : new Response(pngHeader(1350, 1909), { headers: { 'content-type': 'image/png' } })) as typeof fetch
    const upsert = vi.fn(async (_env, options) => {
      if (Date.parse(options.run.startedAt) > Date.parse(options.run.finishedAt)) {
        throw new Error('run.startedAt cannot be later than run.finishedAt')
      }
      return { processed: options.candidates.length, rowIds: [], runId: 'ordered' }
    })
    const dependencies = catalogueDependencies({ cursors, fetcher, upsert })
    let tick = 0
    dependencies.now = () => new Date(Date.parse('2026-07-16T10:00:00.000Z') + tick++).toISOString()

    await runCatalogueScout({ DB: {} as D1Database }, [leaflet({
      url: 'https://specials.shoprite.test/current/index.html',
    })], dependencies)

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(documentCursorCount(cursors)).toBe(1)
  })
})

function catalogueDependencies({
  cursors,
  fetcher,
  runVision = async () => JSON.stringify({
    deals: [{
      box: box(),
      previousPrice: 'R39.99',
      price: 'R29.99',
      title: 'Tastic Rice 2kg',
    }],
  }),
  toMarkdown,
  upsert = async (_env: unknown, options: { candidates: unknown[] }) => ({
    processed: options.candidates.length,
    rowIds: [],
    runId: 'run',
  }),
}: {
  cursors: Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>
  fetcher: typeof fetch
  runVision?: (() => Promise<string>) | undefined
  toMarkdown?: (() => Promise<string>) | undefined
  upsert?: ((env: unknown, options: any) => Promise<any>) | undefined
}) {
  return {
    claimLease: async () => true,
    discoverExternalLeaflets: async () => [],
    fetcher,
    now: () => '2026-07-16T10:00:00.000Z',
    ownerToken: 'owner-test',
    readSourceCursor: async (_env: unknown, sourceKey: string) => cursors.get(sourceKey),
    releaseLease: async () => true,
    runVision,
    ...(toMarkdown ? { toMarkdown } : {}),
    upsertDealItems: upsert,
    writeSourceCursor: async (_env: unknown, options: { sourceKey: string; cursor: import('../../src/services/retailerFeeds/types').FeedCursor }) => {
      cursors.set(options.sourceKey, options.cursor)
    },
  }
}

function documentCursorCount(
  cursors: Map<string, import('../../src/services/retailerFeeds/types').FeedCursor>,
) {
  return Array.from(cursors.values()).filter((cursor) => cursor.kind === 'token').length
}

function pagerManifest(pageCount: number, version: number) {
  return `window.pager = ${JSON.stringify({
    manifestVersion: version,
    pages: {
      defaults: {
        substrateFormat: 'jpg',
        substrateSizes: [650, 960, 1350, 2050],
        substrateSizesReady: [true, true, true, true],
        substrateWebPCount: 4,
      },
      structure: Array.from({ length: pageCount }, (_, index) => String(index + 1)),
    },
  })};`
}

function box() {
  return { height: 0.2, width: 0.2, x: 0.1, y: 0.1 }
}

async function leaseDatabase() {
  const miniflare = new Miniflare({
    d1Databases: { DB: `catalogue-lease-${miniflareInstances.length}` },
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
  })
  miniflareInstances.push(miniflare)
  const db = await miniflare.getD1Database('DB') as unknown as D1Database
  const migration = await readFile(leaseMigrationUrl, 'utf8')
  for (const statement of migration.split(';').map((value) => value.trim()).filter(Boolean)) {
    await db.prepare(statement).run()
  }
  return db
}

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

function pdfDocument() {
  return new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF')
}

function jpegHeader(width: number, height: number) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ])
}

function webpHeader(width: number, height: number) {
  const bytes = new Uint8Array(30)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WEBP'), 8)
  bytes.set(new TextEncoder().encode('VP8X'), 12)
  const write24 = (offset: number, value: number) => {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >> 8) & 0xff
    bytes[offset + 2] = (value >> 16) & 0xff
  }
  write24(24, width - 1)
  write24(27, height - 1)
  return bytes
}

describe('defaultPdfMarkdown', () => {
  it('never asks the converter to rasterise images', async () => {
    // Measured against real leaflets on Workers AI: pdf.images.convert = true
    // exceeds the Worker's 128MB memory limit even for a 1.1MB PDF with
    // maxConvertedImages: 1. The OOM kills the isolate and takes the whole
    // scheduled scout down, so almost no catalogue deals were ever stored.
    // Image-only catalogues are read page-by-page through the vision path.
    const toMarkdown = vi.fn(async () => ({ data: '# leaflet', format: 'markdown' }))
    const ai = { toMarkdown } as unknown as Parameters<typeof defaultPdfMarkdown>[0]

    await defaultPdfMarkdown(ai, new ArrayBuffer(8), 'leaflet.pdf')

    const options = toMarkdown.mock.calls[0][1] as {
      conversionOptions: { pdf: { images: { convert: boolean } } }
    }
    expect(options.conversionOptions.pdf.images.convert).toBe(false)
    expect(JSON.stringify(options)).not.toContain('maxConvertedImages')
  })
})
