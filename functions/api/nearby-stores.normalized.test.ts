// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { NearbyStore } from '../../src/services/nearbyStores'
import type { StoreLeaflet } from '../../src/types'
import type { StoredDealItem } from '../_shared/dealItemStore'
import {
  buildNearMeDealQueries,
  normalizedItemsForStore,
  persistAndScoutNearbyStores,
  selectStoresForAutomaticScouting,
  selectLeafletsForStore,
  selectNormalizedDealsForStore,
} from './nearby-stores'

describe('Near Me normalized deal selection', () => {
  it('uses branch prices before province and national fallbacks', () => {
    const store: NearbyStore = {
      address: '10 Main Road, Cape Town, Western Cape, South Africa',
      lat: -33.9,
      lon: 18.4,
      name: 'Example Market Cape Town',
      placeId: 'geo-branch-1',
      retailerId: 'woolworths',
    }
    const items = [
      item('rice-national', 'rice', 5_000, { type: 'national' }),
      item('rice-province', 'rice', 4_500, {
        regionIds: ['western-cape'],
        type: 'province',
      }),
      item('rice-store', 'rice', 4_000, {
        storeIds: ['geo-branch-1'],
        type: 'store',
      }),
      item('milk-national', 'milk', 3_000, { type: 'national' }),
      item('milk-wrong-province', 'milk', 2_500, {
        regionIds: ['gauteng'],
        type: 'province',
      }),
      item('bread-excluded', 'bread', 2_000, {
        excludedStoreIds: ['geo-branch-1'],
        type: 'national',
      }),
      item('online-only', 'coffee', 8_000, { type: 'online' }),
    ]

    expect(selectNormalizedDealsForStore(items, store).map((deal) => deal.id)).toEqual([
      'rice-store',
      'milk-national',
    ])
  })

  it('persists a new supermarket before its immediate fallback scout runs', async () => {
    const order: string[] = []
    const store: NearbyStore = {
      lat: -26.1,
      lon: 28.05,
      name: 'New Supermarket',
      placeId: 'new-supermarket',
    }

    await persistAndScoutNearbyStores(
      {},
      [store],
      [store],
      Date.parse('2026-07-16T10:00:00.000Z'),
      '-522:561',
      'live',
      {
        scoutNearbyStores: async () => { order.push('scout') },
        writeCachedStores: async () => { order.push('cache'); return true },
        writeDiscoveredStores: async () => { order.push('directory'); return true },
      },
    )

    expect(order).toEqual(['cache', 'directory', 'scout'])
  })

  it('does not scout a supermarket whose directory write failed', async () => {
    const order: string[] = []
    const store: NearbyStore = {
      lat: -26.1,
      lon: 28.05,
      name: 'Unpersisted Supermarket',
      placeId: 'unpersisted-supermarket',
    }

    await persistAndScoutNearbyStores(
      {},
      [store],
      [store],
      Date.parse('2026-07-16T10:00:00.000Z'),
      '-522:561',
      'live',
      {
        scoutNearbyStores: async () => { order.push('scout') },
        writeCachedStores: async () => { order.push('cache'); return true },
        writeDiscoveredStores: async () => { order.push('directory'); return false },
      },
    )

    expect(order).toEqual(['cache', 'directory'])
  })

  it('queues a discovered branch even when national deals are already available', () => {
    const store: NearbyStore = {
      lat: -26.1,
      lon: 28.05,
      name: 'Known Chain Branch',
      placeId: 'known-chain-branch',
      retailerId: 'woolworths',
    }

    expect(selectStoresForAutomaticScouting([{
      ...store,
      deals: [{ id: 'national-deal' }],
      leaflets: [],
      promotions: [],
    }])).toEqual([store])
  })

  it('queries branch and province scopes directly before the national fallback', () => {
    const queries = buildNearMeDealQueries([{
      address: '10 Main Road, Cape Town, Western Cape, South Africa',
      lat: -33.9,
      lon: 18.4,
      name: 'Example Market Cape Town',
      placeId: 'geo-branch-1',
      retailerId: 'woolworths',
    }])

    expect(queries).toEqual(expect.arrayContaining([
      { retailerId: 'woolworths', scope: { storeIds: ['geo-branch-1'], type: 'store' } },
      { retailerId: 'woolworths', scope: { type: 'national' } },
      expect.objectContaining({
        retailerId: 'woolworths',
        scope: expect.objectContaining({
          regionIds: expect.arrayContaining(['western-cape', 'Western Cape']),
          type: 'province',
        }),
      }),
    ]))
  })

  it('loads synthetic store-scoped catalogue deals for an unknown supermarket', () => {
    const store: NearbyStore = {
      lat: -26.1,
      lon: 28.05,
      name: 'Fresh Market',
      placeId: 'area-scout:fresh-market:gauteng',
    }
    const scoped = item(
      'fresh-catalogue-deal',
      'fresh-rice',
      2_999,
      { storeIds: ['area-scout:fresh-market:gauteng'], type: 'store' },
    )
    const unrelated = item(
      'other-catalogue-deal',
      'other-rice',
      3_999,
      { storeIds: ['area-scout:other:gauteng'], type: 'store' },
    )

    expect(buildNearMeDealQueries([store])).toEqual([{
      scope: { storeIds: ['area-scout:fresh-market:gauteng'], type: 'store' },
    }])
    expect(normalizedItemsForStore([scoped, unrelated], store)).toEqual([scoped])
  })

  it('does not present a representative branch catalogue as national', () => {
    const store: NearbyStore = {
      address: 'Cape Town, Western Cape, South Africa',
      lat: -33.9,
      lon: 18.4,
      name: 'Shoprite Cape Town',
      placeId: 'geo-shoprite-cape-town',
      retailerId: 'shoprite',
    }
    const leaflets = [
      leaflet('representative', { storeIds: ['1080'], type: 'store' }),
      leaflet('matching-branch', { storeIds: ['geo-shoprite-cape-town'], type: 'store' }),
      leaflet('province', { regionIds: ['western-cape'], type: 'province' }),
      leaflet('national', { type: 'national' }),
    ]

    expect(selectLeafletsForStore(leaflets, store).map((row) => row.id)).toEqual([
      'matching-branch',
      'province',
      'national',
    ])
  })
})

function leaflet(id: string, priceScope: NonNullable<StoreLeaflet['priceScope']>): StoreLeaflet {
  return {
    capturedAt: '2026-07-16T10:00:00.000Z',
    id,
    name: id,
    priceScope,
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    url: `https://official.test/${id}.pdf`,
  }
}

function item(
  id: string,
  productId: string,
  priceCents: number,
  scope: StoredDealItem['scope'],
): StoredDealItem {
  return {
    capturedAt: '2026-07-16T10:00:00.000Z',
    contentFingerprint: id.padEnd(64, 'a').slice(0, 64),
    createdAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Official source.',
    expiresAt: '2026-07-17T10:00:00.000Z',
    id,
    lastSeenAt: '2026-07-16T10:00:00.000Z',
    priceCents,
    productId,
    productUrl: `https://official.test/products/${productId}`,
    promotionId: `${productId}-promo`,
    retailerId: 'woolworths',
    scope,
    sourceKey: 'woolworths::all-savings',
    sourceKind: 'structured',
    sourceUrl: 'https://official.test/specials',
    status: 'active',
    title: productId,
    updatedAt: '2026-07-16T10:00:00.000Z',
  }
}
