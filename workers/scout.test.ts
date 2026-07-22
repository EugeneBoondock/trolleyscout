import { describe, expect, it, vi } from 'vitest'
import type { DiscoveryRun, StoreLeaflet } from '../src/types'
import {
  catalogueRetailerId,
  runScheduledScout,
  shouldRefreshDealSources,
} from './scout'

function discoveryRun(leaflets: StoreLeaflet[] = []): DiscoveryRun {
  return {
    deals: [],
    leaflets,
    refreshedAt: '2026-07-19T12:00:00.000Z',
    served: 'live' as const,
    sources: [],
    summary: {
      checkedSourceCount: 0,
      dataPolicy: 'official sources',
      foundDealCount: 0,
      unavailableSourceCount: 0,
    },
  }
}

describe('runScheduledScout', () => {
  it('keeps catalogue discovery and scanning hourly while skipping three-hour deal lanes', async () => {
    const cachedLeaflet: StoreLeaflet = {
      capturedAt: '2026-07-19T10:00:00.000Z',
      documentUrl: 'https://catalogues.test/current.pdf',
      id: 'current-catalogue',
      name: 'Current catalogue',
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      url: 'https://catalogues.test/current',
    }
    const refreshDiscovery = vi.fn(async () => discoveryRun([cachedLeaflet]))
    const runStructuredRetailerFeedScout = vi.fn()
    const refreshDealSites = vi.fn()
    const readDueDiscoveredStores = vi.fn()
    const scoutNearbyStores = vi.fn()
    const runVoucherScout = vi.fn()
    const runCatalogueScout = vi.fn(async () => ({
      dealCount: 0,
      discoveredLeafletCount: 1,
      scannedDocumentCount: 1,
    }))

    await runScheduledScout(
      { DB: {} as D1Database },
      async () => Response.json({}),
      {
        expireDealItems: async () => 0,
        purgeExpired: async () => 0,
        readDueDiscoveredStores,
        refreshDealSites,
        refreshDiscovery,
        runCatalogueScout,
        runStructuredRetailerFeedScout,
        runVoucherScout,
        scoutNearbyStores,
      },
      { refreshDealSources: false },
    )

    expect(refreshDiscovery).toHaveBeenCalledWith(
      expect.anything(),
      { refreshDeals: false },
    )
    expect(runCatalogueScout).toHaveBeenCalledWith(
      expect.anything(),
      [cachedLeaflet],
    )
    expect(runStructuredRetailerFeedScout).not.toHaveBeenCalled()
    expect(refreshDealSites).not.toHaveBeenCalled()
    expect(readDueDiscoveredStores).not.toHaveBeenCalled()
    expect(scoutNearbyStores).not.toHaveBeenCalled()
    expect(runVoucherScout).not.toHaveBeenCalled()
  })

  it('refreshes discovery and external deal sites through internal scout functions', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('the scheduled worker must not call its public refresh route')
    })
    const refreshDiscovery = vi.fn(async () => discoveryRun())
    const refreshDealSites = vi.fn(async () => 37)

    const result = await runScheduledScout(
      { DB: {} as D1Database, SCOUT_ORIGIN: 'https://trolleyscout.co.za' },
      fetcher,
      {
        expireDealItems: async () => 0,
        purgeExpired: async () => 0,
        readDueDiscoveredStores: async () => [],
        refreshDealSites,
        refreshDiscovery,
        runCatalogueScout: async () => ({
          dealCount: 0,
          discoveredLeafletCount: 0,
          scannedDocumentCount: 0,
        }),
        runStructuredRetailerFeedScout: async () => ({
          acceptedDealCount: 0,
          catalogueCount: 0,
          catalogues: [],
          checkedSourceCount: 0,
          databaseAvailable: true,
          failedSourceCount: 0,
          physicalRequestCount: 0,
          sources: [],
        }),
        scoutNearbyStores: async () => undefined,
      },
    )

    expect(fetcher).not.toHaveBeenCalled()
    expect(refreshDiscovery).toHaveBeenCalledWith(expect.anything())
    expect(refreshDealSites).toHaveBeenCalledWith(expect.anything())
    expect(result).toMatchObject({
      catalogueDealCount: 0,
      externalDealCount: 37,
      refreshedDealCount: 0,
      refreshedSourceCount: 0,
    })
  })

  it('snapshots before every refresh lane and records one batch after expiry', async () => {
    const order: string[] = []
    const snapshotDealAlertKeys = vi.fn(async () => {
      const phase = snapshotDealAlertKeys.mock.calls.length === 1 ? 'before' : 'after'
      order.push(`snapshot-${phase}`)
      return phase === 'before' ? ['deal-a'] : ['deal-a', 'deal-b']
    })
    const recordGlobalDealAlertBatch = vi.fn(async (
      _env: unknown,
      before: readonly string[],
      after: readonly string[],
    ) => {
      order.push('record-alert-batch')
      expect(before).toEqual(['deal-a'])
      expect(after).toEqual(['deal-a', 'deal-b'])
      return { cursor: 9, inserted: true, newDealCount: 1 }
    })

    const result = await runScheduledScout(
      { DB: {} as D1Database },
      async () => Response.json({}),
      {
        expireDealItems: async () => { order.push('expire-normalized'); return 0 },
        matchPendingWatches: async () => { order.push('match-watches'); return 0 },
        purgeExpired: async () => { order.push('expire-location'); return 0 },
        readDueDiscoveredStores: async () => [],
        recordGlobalDealAlertBatch,
        refreshDealSites: async () => { order.push('deal-sites'); return 0 },
        refreshDiscovery: async () => { order.push('discovery'); return discoveryRun() },
        runCatalogueScout: async () => {
          order.push('catalogue')
          return { dealCount: 0, discoveredLeafletCount: 0, scannedDocumentCount: 0 }
        },
        runStructuredRetailerFeedScout: async () => {
          order.push('structured')
          return {
            acceptedDealCount: 0,
            catalogueCount: 0,
            catalogues: [],
            checkedSourceCount: 0,
            databaseAvailable: true,
            failedSourceCount: 0,
            physicalRequestCount: 0,
            sources: [],
          }
        },
        runVoucherScout: async () => { order.push('vouchers'); return { expired: 0, sources: [] } },
        scoutNearbyStores: async () => { order.push('stores') },
        snapshotDealAlertKeys,
      },
    )

    expect(order).toEqual([
      'snapshot-before',
      'structured',
      'discovery',
      'deal-sites',
      'stores',
      'catalogue',
      'vouchers',
      'expire-location',
      'expire-normalized',
      'snapshot-after',
      'record-alert-batch',
      'match-watches',
    ])
    expect(result).toMatchObject({
      dealAlertAfterSnapshotCount: 2,
      dealAlertBatchFailed: false,
      dealAlertBatchInserted: true,
      dealAlertBeforeSnapshotCount: 1,
      dealAlertNewDealCount: 1,
      dealAlertSnapshotFailed: false,
    })
  })

  it('skips batch recording when the strict after snapshot fails', async () => {
    const snapshotDealAlertKeys = vi.fn(async () => {
      if (snapshotDealAlertKeys.mock.calls.length === 1) return ['deal-a']
      throw new Error('after snapshot failed')
    })
    const recordGlobalDealAlertBatch = vi.fn()

    const result = await runScheduledScout(
      { DB: {} as D1Database },
      async () => Response.json({}),
      {
        expireDealItems: async () => 0,
        purgeExpired: async () => 0,
        readDueDiscoveredStores: async () => [],
        recordGlobalDealAlertBatch,
        refreshDealSites: async () => 0,
        refreshDiscovery: async () => discoveryRun(),
        runCatalogueScout: async () => ({
          dealCount: 0,
          discoveredLeafletCount: 0,
          scannedDocumentCount: 0,
        }),
        runStructuredRetailerFeedScout: async () => ({
          acceptedDealCount: 0,
          catalogueCount: 0,
          catalogues: [],
          checkedSourceCount: 0,
          databaseAvailable: true,
          failedSourceCount: 0,
          physicalRequestCount: 0,
          sources: [],
        }),
        runVoucherScout: async () => ({ expired: 0, sources: [] }),
        scoutNearbyStores: async () => undefined,
        snapshotDealAlertKeys,
      },
    )

    expect(snapshotDealAlertKeys).toHaveBeenCalledTimes(2)
    expect(recordGlobalDealAlertBatch).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      dealAlertAfterSnapshotCount: 0,
      dealAlertBatchInserted: false,
      dealAlertBeforeSnapshotCount: 1,
      dealAlertNewDealCount: 0,
      dealAlertSnapshotFailed: true,
    })
  })

  it('runs structured feeds before legacy refresh, expires normalized rows, and exposes metrics', async () => {
    const order: string[] = []
    const fetcher = vi.fn(async () => {
      order.push('legacy')
      return Response.json({
        data: {
          deals: [],
          leaflets: [],
          sources: [],
          summary: {
            checkedSourceCount: 0,
            dataPolicy: 'official sources',
            foundDealCount: 0,
            unavailableSourceCount: 0,
          },
        },
      })
    })

    const result = await runScheduledScout(
      { DB: {} as D1Database, SCOUT_ORIGIN: 'https://trolleyscout.co.za' },
      fetcher,
      {
        expireDealItems: async () => {
          order.push('expire-normalized')
          return 7
        },
        purgeExpired: async () => {
          order.push('expire-location')
          return 2
        },
        readDueDiscoveredStores: async () => [],
        refreshDealSites: async () => 0,
        refreshDiscovery: async () => {
          order.push('legacy')
          return discoveryRun()
        },
        runCatalogueScout: async () => ({
          dealCount: 0,
          discoveredLeafletCount: 0,
          scannedDocumentCount: 0,
        }),
        runStructuredRetailerFeedScout: async () => {
          order.push('structured')
          return {
            acceptedDealCount: 42,
            catalogueCount: 3,
            catalogues: [],
            checkedSourceCount: 5,
            databaseAvailable: true,
            failedSourceCount: 1,
            physicalRequestCount: 5,
            sources: [],
          }
        },
        runVoucherScout: async () => {
          order.push('vouchers')
          return {
            expired: 3,
            sources: [
              {
                checkedAt: '2026-07-16T10:00:00.000Z',
                discovered: 205,
                remaining: 105,
                retailerId: 'amazon-za',
                sourceKey: 'amazon-za::vouchers',
                status: 'partial' as const,
                written: 100,
              },
            ],
          }
        },
        scoutNearbyStores: async () => undefined,
      },
    )

    expect(order.slice(0, 2)).toEqual(['structured', 'legacy'])
    expect(order.slice(-2)).toEqual(['expire-location', 'expire-normalized'])
    expect(result).toMatchObject({
      expiredNormalizedDealCount: 7,
      structuredAcceptedDealCount: 42,
      structuredCatalogueCount: 3,
      structuredCheckedSourceCount: 5,
      structuredFailedSourceCount: 1,
      structuredPhysicalRequestCount: 5,
      voucherExpiredCount: 3,
      voucherSourceCount: 1,
      voucherWrittenCount: 100,
    })
    expect(order).toContain('vouchers')
  })

  it('keeps the legacy schedule working without a database binding', async () => {
    const structured = vi.fn(async () => ({
      acceptedDealCount: 0,
      catalogueCount: 0,
      catalogues: [],
      checkedSourceCount: 0,
      databaseAvailable: false,
      failedSourceCount: 0,
      physicalRequestCount: 0,
      sources: [],
    }))
    const fetcher = vi.fn(async () => Response.json({
      data: {
        deals: [],
        leaflets: [],
        sources: [],
        summary: {
          checkedSourceCount: 0,
          dataPolicy: 'official sources',
          foundDealCount: 0,
          unavailableSourceCount: 0,
        },
      },
    }))

    const result = await runScheduledScout({}, fetcher, {
      expireDealItems: vi.fn(async () => 99),
      purgeExpired: async () => 0,
      readDueDiscoveredStores: async () => [],
      refreshDealSites: async () => 0,
      refreshDiscovery: async () => discoveryRun(),
      runCatalogueScout: async () => ({
        dealCount: 0,
        discoveredLeafletCount: 0,
        scannedDocumentCount: 0,
      }),
      runStructuredRetailerFeedScout: structured,
      scoutNearbyStores: async () => undefined,
    })

    expect(structured).toHaveBeenCalled()
    expect(result.expiredNormalizedDealCount).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('continues discovered-store fallbacks when the legacy refresh endpoint is unavailable', async () => {
    const dueStore = {
      firstSeenAt: '2026-07-16T08:00:00.000Z',
      lastSeenAt: '2026-07-16T09:00:00.000Z',
      lat: -26.1,
      lon: 28.05,
      name: 'Branch Market',
      nextScoutAt: '2026-07-16T10:00:00.000Z',
      placeId: 'branch-market',
    }
    const scoutNearbyStores = vi.fn(async () => undefined)

    const result = await runScheduledScout(
      { DB: {} as D1Database },
      vi.fn(async () => new Response('', { status: 503 })),
      {
        expireDealItems: async () => 0,
        purgeExpired: async () => 0,
        readAllStoreCatalogues: async () => [],
        readDueDiscoveredStores: async () => [dueStore],
        refreshDealSites: async () => 0,
        refreshDiscovery: async () => {
          throw new Error('legacy discovery unavailable')
        },
        runCatalogueScout: async () => ({
          dealCount: 0,
          discoveredLeafletCount: 0,
          scannedDocumentCount: 0,
        }),
        runStructuredRetailerFeedScout: async () => ({
          acceptedDealCount: 0,
          catalogueCount: 0,
          catalogues: [],
          checkedSourceCount: 1,
          databaseAvailable: true,
          failedSourceCount: 1,
          physicalRequestCount: 1,
          sources: [],
        }),
        scoutNearbyStores,
      },
    )

    expect(scoutNearbyStores).toHaveBeenCalledWith(
      expect.anything(),
      [dueStore],
      expect.any(Number),
      1,
    )
    expect(result).toMatchObject({
      dueStoreCount: 1,
      legacyRefreshFailed: true,
      refreshedDealCount: 0,
    })
  })

  it('keeps every later discovery lane running after unexpected lane failures', async () => {
    const order: string[] = []
    const dueStore = {
      firstSeenAt: '2026-07-16T08:00:00.000Z',
      lastSeenAt: '2026-07-16T09:00:00.000Z',
      lat: -26.1,
      lon: 28.05,
      name: 'Fallback Market',
      nextScoutAt: '2026-07-16T10:00:00.000Z',
      placeId: 'fallback-market',
    }

    const result = await runScheduledScout(
      { DB: {} as D1Database },
      async () => {
        order.push('legacy')
        return Response.json({
          data: {
            deals: [],
            leaflets: [],
            sources: [],
            summary: {
              checkedSourceCount: 0,
              dataPolicy: 'official sources',
              foundDealCount: 0,
              unavailableSourceCount: 0,
            },
          },
        })
      },
      {
        expireDealItems: async () => { order.push('expire-normalized'); return 0 },
        purgeExpired: async () => { order.push('expire-location'); return 0 },
        readAllStoreCatalogues: async () => [],
        readDueDiscoveredStores: async () => [dueStore],
        refreshDealSites: async () => 0,
        refreshDiscovery: async () => {
          order.push('legacy')
          return discoveryRun()
        },
        runCatalogueScout: async () => {
          order.push('catalogue')
          throw new Error('catalogue lane failed')
        },
        runStructuredRetailerFeedScout: async () => {
          order.push('structured')
          throw new Error('structured lane failed')
        },
        runVoucherScout: async () => {
          order.push('vouchers')
          return { expired: 0, sources: [] }
        },
        scoutNearbyStores: async () => {
          order.push('store')
          throw new Error('store lane failed')
        },
      },
    )

    expect(order).toEqual([
      'structured',
      'legacy',
      'store',
      'catalogue',
      'vouchers',
      'expire-location',
      'expire-normalized',
    ])
    expect(result).toMatchObject({
      catalogueScoutFailed: true,
      storeScoutFailed: true,
      structuredScoutFailed: true,
    })
  })

  it('passes validated structured catalogues and discovery leaflets to catalogue scanning', async () => {
    const runCatalogue = vi.fn(async () => ({
      dealCount: 0,
      discoveredLeafletCount: 0,
      scannedDocumentCount: 0,
    }))
    const fetcher = vi.fn(async () => Response.json({
      data: {
        deals: [],
        leaflets: [{
          capturedAt: '2026-07-16T09:00:00.000Z',
          documentUrl: 'https://legacy.test/catalogue.pdf',
          id: 'legacy-catalogue',
          name: 'Legacy catalogue',
          retailerId: 'spar',
          retailerName: 'SPAR',
          url: 'https://legacy.test/specials',
        }],
        sources: [],
        summary: {
          checkedSourceCount: 0,
          dataPolicy: 'official sources',
          foundDealCount: 0,
          unavailableSourceCount: 0,
        },
      },
    }))

    await runScheduledScout({ DB: {} as D1Database }, fetcher, {
      expireDealItems: async () => 0,
      purgeExpired: async () => 0,
      readAllStoreCatalogues: async () => [{
        id: 'branch-catalogue',
        imageUrl: 'https://branch.test/catalogue-cover.jpg',
        kind: 'catalogue' as const,
        placeId: 'branch-42',
        productUrl: 'https://branch.test/catalogue.pdf',
        retailerId: 'spar',
        sourceUrl: 'https://branch.test/specials',
        storeName: 'SPAR Branch 42',
        title: 'Branch weekly catalogue',
      }],
      readDueDiscoveredStores: async () => [],
      refreshDealSites: async () => 0,
      refreshDiscovery: async () => discoveryRun([{
        capturedAt: '2026-07-16T09:00:00.000Z',
        documentUrl: 'https://legacy.test/catalogue.pdf',
        id: 'legacy-catalogue',
        name: 'Legacy catalogue',
        retailerId: 'spar',
        retailerName: 'SPAR',
        url: 'https://legacy.test/specials',
      }]),
      runCatalogueScout: runCatalogue,
      runStructuredRetailerFeedScout: async () => ({
        acceptedDealCount: 0,
        catalogueCount: 1,
        catalogues: [{
          capturedAt: '2026-07-16T10:00:00.000Z',
          documentUrl: 'https://structured.test/catalogue.pdf',
          id: 'structured-catalogue',
          name: 'Structured catalogue',
          priceScope: { type: 'province', regionIds: ['western-cape'] },
          retailerId: 'food-lovers',
          retailerName: 'Food Lovers Market',
          sourceLabel: 'Current specials',
          url: 'https://structured.test/specials',
        }],
        checkedSourceCount: 1,
        databaseAvailable: true,
        failedSourceCount: 0,
        physicalRequestCount: 1,
        sources: [],
      }),
      scoutNearbyStores: async () => undefined,
    })

    expect(runCatalogue).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          id: 'structured-catalogue',
          priceScope: { type: 'province', regionIds: ['western-cape'] },
        }),
        expect.objectContaining({ id: 'legacy-catalogue' }),
        expect.objectContaining({
          documentUrl: 'https://branch.test/catalogue.pdf',
          id: 'branch-catalogue',
          priceScope: { storeIds: ['branch-42'], type: 'store' },
          retailerId: 'spar',
        }),
      ],
    )
  })

  it('pages every stored branch catalogue into the catalogue scanner', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `branch-catalogue-${index}`,
      kind: 'catalogue' as const,
      placeId: `branch-${index}`,
      productUrl: `https://branch.test/catalogues/${index}.pdf`,
      retailerId: 'spar',
      sourceUrl: `https://branch.test/specials/${index}`,
      storeName: `SPAR Branch ${index}`,
      title: `Branch catalogue ${index}`,
    }))
    const secondPage = [{
      id: 'branch-catalogue-1000',
      kind: 'catalogue' as const,
      placeId: 'branch-1000',
      productUrl: 'https://branch.test/catalogues/1000.pdf',
      retailerId: 'spar',
      sourceUrl: 'https://branch.test/specials/1000',
      storeName: 'SPAR Branch 1000',
      title: 'Branch catalogue 1000',
    }]
    const readAllStoreCatalogues = vi.fn(async (
      _env: unknown,
      _nowIso: string,
      _limit = 1000,
      offset = 0,
    ) => offset === 0 ? firstPage : secondPage)
    const runCatalogueScout = vi.fn(async (
      _env: unknown,
      _leaflets: Array<{ id: string }>,
    ) => ({
      dealCount: 0,
      discoveredLeafletCount: 0,
      scannedDocumentCount: 0,
    }))

    await runScheduledScout(
      { DB: {} as D1Database },
      async () => Response.json({
        data: {
          deals: [],
          leaflets: [],
          sources: [],
          summary: {
            checkedSourceCount: 0,
            dataPolicy: 'official sources',
            foundDealCount: 0,
            unavailableSourceCount: 0,
          },
        },
      }),
      {
        expireDealItems: async () => 0,
        purgeExpired: async () => 0,
        readAllStoreCatalogues,
        readDueDiscoveredStores: async () => [],
        refreshDealSites: async () => 0,
        refreshDiscovery: async () => discoveryRun(),
        runCatalogueScout,
        runStructuredRetailerFeedScout: async () => ({
          acceptedDealCount: 0,
          catalogueCount: 0,
          catalogues: [],
          checkedSourceCount: 0,
          databaseAvailable: true,
          failedSourceCount: 0,
          physicalRequestCount: 0,
          sources: [],
        }),
        scoutNearbyStores: async () => undefined,
      },
    )

    expect(readAllStoreCatalogues).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.any(String),
      1000,
      0,
      'ZA',
    )
    expect(readAllStoreCatalogues).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.any(String),
      1000,
      1000,
      'ZA',
    )
    const leaflets = runCatalogueScout.mock.calls[0]?.[1] ?? []
    expect(leaflets).toHaveLength(1001)
    expect(leaflets).toContainEqual(expect.objectContaining({
      id: 'branch-catalogue-1000',
      priceScope: { storeIds: ['branch-1000'], type: 'store' },
    }))
  })

  it('keeps completed catalogue pages and later lanes when a subsequent page fails', async () => {
    const order: string[] = []
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `stored-catalogue-${index}`,
      kind: 'catalogue' as const,
      placeId: `stored-branch-${index}`,
      productUrl: `https://stored.test/catalogues/${index}.pdf`,
      retailerId: 'spar',
      sourceUrl: `https://stored.test/specials/${index}`,
      storeName: `Stored Branch ${index}`,
      title: `Stored catalogue ${index}`,
    }))
    const runCatalogueScout = vi.fn(async (_env, leaflets) => {
      order.push(`catalogue:${leaflets.length}`)
      return {
        dealCount: 0,
        discoveredLeafletCount: 0,
        scannedDocumentCount: 0,
      }
    })

    await runScheduledScout(
      { DB: {} as D1Database },
      async () => Response.json({
        data: {
          deals: [],
          leaflets: [{
            capturedAt: '2026-07-16T09:00:00.000Z',
            documentUrl: 'https://legacy.test/fallback.pdf',
            id: 'legacy-fallback',
            name: 'Legacy fallback',
            retailerId: 'spar',
            retailerName: 'SPAR',
            url: 'https://legacy.test/specials',
          }],
          sources: [],
          summary: {
            checkedSourceCount: 0,
            dataPolicy: 'official sources',
            foundDealCount: 0,
            unavailableSourceCount: 0,
          },
        },
      }),
      {
        expireDealItems: async () => {
          order.push('expire-normalized')
          return 0
        },
        purgeExpired: async () => {
          order.push('expire-location')
          return 0
        },
        readAllStoreCatalogues: async (_env, _nowIso, _limit, offset) => {
          if (offset === 0) {
            return firstPage
          }
          throw new Error('temporary D1 page failure')
        },
        readDueDiscoveredStores: async () => [],
        refreshDealSites: async () => 0,
        refreshDiscovery: async () => discoveryRun([{
          capturedAt: '2026-07-16T09:00:00.000Z',
          documentUrl: 'https://legacy.test/fallback.pdf',
          id: 'legacy-fallback',
          name: 'Legacy fallback',
          retailerId: 'spar',
          retailerName: 'SPAR',
          url: 'https://legacy.test/specials',
        }]),
        runCatalogueScout,
        runStructuredRetailerFeedScout: async () => ({
          acceptedDealCount: 0,
          catalogueCount: 1,
          catalogues: [{
            capturedAt: '2026-07-16T10:00:00.000Z',
            documentUrl: 'https://structured.test/fallback.pdf',
            id: 'structured-fallback',
            name: 'Structured fallback',
            retailerId: 'food-lovers',
            retailerName: 'Food Lovers Market',
            url: 'https://structured.test/specials',
          }],
          checkedSourceCount: 1,
          databaseAvailable: true,
          failedSourceCount: 0,
          physicalRequestCount: 1,
          sources: [],
        }),
        runVoucherScout: async () => {
          order.push('vouchers')
          return { expired: 0, sources: [] }
        },
        scoutNearbyStores: async () => undefined,
      },
    )

    expect(runCatalogueScout).toHaveBeenCalledTimes(1)
    const leaflets = runCatalogueScout.mock.calls[0]?.[1] ?? []
    expect(leaflets).toHaveLength(1002)
    expect(leaflets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'structured-fallback' }),
      expect.objectContaining({ id: 'legacy-fallback' }),
      expect.objectContaining({ id: 'stored-catalogue-999' }),
    ]))
    expect(order).toEqual([
      'catalogue:1002',
      'vouchers',
      'expire-location',
      'expire-normalized',
    ])
  })

  it('caps stored catalogue paging at ten thousand rows', async () => {
    const page = Array.from({ length: 1000 }, (_, index) => ({
      id: `bounded-catalogue-${index}`,
      kind: 'catalogue' as const,
      placeId: `bounded-branch-${index}`,
      productUrl: `https://bounded.test/catalogues/${index}.pdf`,
      retailerId: 'spar',
      sourceUrl: `https://bounded.test/specials/${index}`,
      storeName: `Bounded Branch ${index}`,
      title: `Bounded catalogue ${index}`,
    }))
    const readAllStoreCatalogues = vi.fn(async () => page)

    await runScheduledScout(
      { DB: {} as D1Database },
      async () => Response.json({
        data: {
          deals: [],
          leaflets: [],
          sources: [],
          summary: {
            checkedSourceCount: 0,
            dataPolicy: 'official sources',
            foundDealCount: 0,
            unavailableSourceCount: 0,
          },
        },
      }),
      {
        expireDealItems: async () => 0,
        purgeExpired: async () => 0,
        readAllStoreCatalogues,
        readDueDiscoveredStores: async () => [],
        refreshDealSites: async () => 0,
        refreshDiscovery: async () => discoveryRun(),
        runCatalogueScout: async () => ({
          dealCount: 0,
          discoveredLeafletCount: 0,
          scannedDocumentCount: 0,
        }),
        runStructuredRetailerFeedScout: async () => ({
          acceptedDealCount: 0,
          catalogueCount: 0,
          catalogues: [],
          checkedSourceCount: 0,
          databaseAvailable: true,
          failedSourceCount: 0,
          physicalRequestCount: 0,
          sources: [],
        }),
        scoutNearbyStores: async () => undefined,
      },
    )

    expect(readAllStoreCatalogues).toHaveBeenCalledTimes(10)
    expect(readAllStoreCatalogues).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(String),
      1000,
      9000,
      'ZA',
    )
  })
})

describe('shouldRefreshDealSources', () => {
  it('opens deal-source lanes on UTC hours divisible by three', () => {
    expect(shouldRefreshDealSources(Date.parse('2026-07-19T00:17:00.000Z'))).toBe(true)
    expect(shouldRefreshDealSources(Date.parse('2026-07-19T01:17:00.000Z'))).toBe(false)
    expect(shouldRefreshDealSources(Date.parse('2026-07-19T03:17:00.000Z'))).toBe(true)
  })
})

describe('catalogueRetailerId', () => {
  it('creates a valid stable retailer slug for an unknown area-scout store', () => {
    const retailerId = catalogueRetailerId({
      placeId: 'area-scout:fresh-market:western-cape',
      storeName: 'Fresh Market & Supermarket',
    })

    expect(retailerId).toMatch(/^independent-[a-z0-9-]+$/)
    expect(retailerId.length).toBeLessThanOrEqual(100)
    expect(catalogueRetailerId({
      placeId: 'area-scout:fresh-market:western-cape',
      storeName: 'Fresh Market & Supermarket',
    })).toBe(retailerId)
  })
})
