import { describe, expect, it } from 'vitest'
import type { DealSiteItem } from '../../src/services/dealSites'
import {
  enrichMyRunwayProducts,
  filterCurrentDealSiteItems,
  isDealSiteCacheRowUsable,
  readDealSiteFeed,
  readDealSiteFeedStrict,
} from './dealSiteScout'

function deal(id: string, expiresAt?: string): DealSiteItem {
  return {
    expiresAt,
    id,
    productUrl: `https://example.test/${id}`,
    retailerName: 'OneDayOnly',
    source: 'onedayonly',
    sourceLabel: 'OneDayOnly',
    title: id,
  }
}

describe('filterCurrentDealSiteItems', () => {
  it('drops cached daily deals after their South African expiry time', () => {
    const now = Date.parse('2026-07-19T22:00:00.000Z')
    const items = [
      deal('expired', '2026-07-19 23:59:59'),
      deal('current', '2026-07-20 23:59:59'),
      deal('no-expiry'),
      deal('unknown-expiry', 'not-a-date'),
    ]

    expect(filterCurrentDealSiteItems(items, now).map((item) => item.id)).toEqual([
      'current',
      'no-expiry',
      'unknown-expiry',
    ])
  })

  it('keeps a MyRunway row usable beyond the three-hour scout interval', () => {
    const withinGrace = Date.parse('2026-07-19T15:30:00.000Z')
    const beyondGrace = Date.parse('2026-07-19T16:01:00.000Z')

    expect(isDealSiteCacheRowUsable(
      'myrunway',
      '2026-07-19T12:00:00.000Z',
      withinGrace,
    )).toBe(true)
    expect(isDealSiteCacheRowUsable(
      'myrunway',
      '2026-07-19T12:00:00.000Z',
      beyondGrace,
    )).toBe(false)
    expect(isDealSiteCacheRowUsable(
      'onedayonly',
      '2026-07-19T12:00:00.000Z',
      beyondGrace,
    )).toBe(true)
  })

  it('does not advertise a source whose cached payload is unreadable', async () => {
    const env = {
      DB: {
        prepare() {
          return {
            async all() {
              return {
                results: [{
                  source_key: 'onedayonly',
                  payload_json: '{broken',
                  item_count: 1,
                  fetched_at: '2026-07-19T12:00:00.000Z',
                }],
              }
            },
          }
        },
      },
    }

    await expect(readDealSiteFeed(env as never)).resolves.toMatchObject({
      deals: [],
      sources: [],
    })
    await expect(readDealSiteFeedStrict(env as never)).rejects.toThrow(
      'Deal-site cache payload for onedayonly is not valid JSON.',
    )
  })

  it('enriches MyRunway list rows by SKU and keeps partial failures usable', async () => {
    const requested: string[] = []
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      if (url.endsWith('/SKU_A')) {
        return new Response(JSON.stringify({
          product_images: [
            { image_url: 'https://myrunway.test/a-2.jpg', position: 2 },
            { image_url: 'https://myrunway.test/a-1.jpg', position: 1 },
          ],
        }), { headers: { 'content-type': 'application/json' } })
      }
      throw new Error('detail unavailable')
    }) as typeof fetch

    const products = await enrichMyRunwayProducts([
      { sku: 'SKU_A', image_url: 'https://myrunway.test/a.jpg' },
      { sku: 'SKU_B', image_url: 'https://myrunway.test/b.jpg' },
      { id: 3, image_url: 'https://myrunway.test/c.jpg' },
    ], fetcher, { 'x-session-token': 'test-token' }, {
      concurrency: 2,
      deadlineMs: 1_000,
      maxProducts: 30,
    })

    expect(requested).toEqual([
      'https://api.myrunway.co.za/v1/products/SKU_A',
      'https://api.myrunway.co.za/v1/products/SKU_B',
    ])
    expect(products[0]).toMatchObject({
      sku: 'SKU_A',
      product_images: [
        { image_url: 'https://myrunway.test/a-2.jpg', position: 2 },
        { image_url: 'https://myrunway.test/a-1.jpg', position: 1 },
      ],
    })
    expect(products[1]).toEqual({
      sku: 'SKU_B',
      image_url: 'https://myrunway.test/b.jpg',
    })
    expect(products[2]).toEqual({
      id: 3,
      image_url: 'https://myrunway.test/c.jpg',
    })
  })
})
