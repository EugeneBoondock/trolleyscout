import { describe, expect, it } from 'vitest'

import { readRetailerCatalogue, sweepClothingRetailers } from './clothingScout'
import type { TrolleyScoutEnv } from './env'
import type { ClothingRetailer } from '../../src/data/clothingRetailers'

function shopifyPage(handles: string[]) {
  return new Response(JSON.stringify({
    products: handles.map((handle, index) => ({
      handle,
      id: `${handle}-${index}`,
      images: [{ src: `https://cdn.test/${handle}-a.jpg` }, { src: `https://cdn.test/${handle}-b.jpg` }],
      product_type: 'Tops',
      title: `${handle} shirt`,
      variants: [{ available: true, price: '199.00' }],
    })),
  }))
}

function makeEnv() {
  const saved: unknown[][] = []
  const runs: unknown[][] = []
  const env = {
    DB: {
      batch: async (statements: unknown[]) => {
        saved.push(statements)
        return []
      },
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => {
            if (sql.includes('clothing_source_runs')) runs.push(args)
            return {}
          },
        }),
      }),
    },
  } as unknown as TrolleyScoutEnv
  return { env, runs, saved }
}

const shopify: ClothingRetailer = {
  id: 'test-shop',
  name: 'Test Shop',
  origin: 'https://shop.test',
  pages: 2,
  platform: 'shopify',
}

describe('readRetailerCatalogue', () => {
  it('walks pages and stops when a page comes back empty', async () => {
    const urls: string[] = []
    const products = await readRetailerCatalogue(shopify, async (url) => {
      urls.push(url)
      return urls.length === 1
        ? shopifyPage(['alpha', 'beta'])
        : new Response(JSON.stringify({ products: [] }))
    })

    expect(urls[0]).toBe('https://shop.test/products.json?limit=250&page=1')
    expect(urls[1]).toBe('https://shop.test/products.json?limit=250&page=2')
    expect(products.map((product) => product.title))
      .toEqual(['alpha shirt', 'beta shirt'])
  })

  it('honours a store that leads with a lifestyle banner', async () => {
    const products = await readRetailerCatalogue(
      { ...shopify, imageIndex: 1, pages: 1 },
      async () => shopifyPage(['gamma']),
    )
    expect(products[0].imageUrl).toBe('https://cdn.test/gamma-b.jpg')
  })

  it('treats a VTEX 206 window as the success it is', async () => {
    const vtex: ClothingRetailer = {
      id: 'bash',
      name: 'Bash',
      origin: 'https://bash.test',
      pages: 1,
      platform: 'vtex',
    }
    const products = await readRetailerCatalogue(vtex, async (url) => {
      expect(url).toBe(
        'https://bash.test/api/catalog_system/pub/products/search?_from=0&_to=49',
      )
      return new Response(
        JSON.stringify([
          {
            brand: 'Foschini',
            categories: ['/Women/Clothing/Dresses/'],
            items: [{
              images: [{ imageUrl: 'https://bash.test/dress.jpg' }],
              sellers: [{
                commertialOffer: { AvailableQuantity: 4, ListPrice: 599, Price: 399 },
              }],
            }],
            link: 'https://bash.test/floral-dress/p',
            productId: 'vt-1',
            productName: 'Floral Dress',
          },
        ]),
        { status: 206 },
      )
    })

    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({
      externalId: 'vt-1',
      previousPriceCents: 59900,
      priceCents: 39900,
      productUrl: 'https://bash.test/floral-dress/p',
      title: 'Floral Dress',
    })
  })

  it('gives up on a store that refuses rather than throwing', async () => {
    const products = await readRetailerCatalogue(
      shopify,
      async () => new Response('nope', { status: 403 }),
    )
    expect(products).toEqual([])
  })
})

describe('sweepClothingRetailers', () => {
  it('sweeps a slice and hands back a cursor that moves on', async () => {
    const { env } = makeEnv()
    const retailers: ClothingRetailer[] = [
      { ...shopify, id: 'one', pages: 1 },
      { ...shopify, id: 'two', pages: 1 },
      { ...shopify, id: 'three', pages: 1 },
    ]
    const swept: string[] = []

    const summary = await sweepClothingRetailers(env, {
      fetcher: async (url) => {
        swept.push(url)
        return shopifyPage(['tee'])
      },
      retailers,
      storesPerRun: 2,
    })

    expect(summary.storesSwept).toBe(2)
    expect(summary.nextCursor).toBe(2)
    expect(swept).toHaveLength(2)

    const second = await sweepClothingRetailers(env, {
      cursor: summary.nextCursor,
      fetcher: async () => shopifyPage(['tee']),
      retailers,
      storesPerRun: 2,
    })
    // Three stores, two per run: the second run wraps back to the start.
    expect(second.nextCursor).toBe(1)
  })

  it('records a failing store instead of losing the whole sweep', async () => {
    const { env, runs } = makeEnv()
    const summary = await sweepClothingRetailers(env, {
      fetcher: async () => {
        throw new Error('connection reset')
      },
      retailers: [{ ...shopify, pages: 1 }],
    })

    expect(summary.failed).toBe(1)
    expect(summary.productsSaved).toBe(0)
    expect(runs.some((args) => args.includes('failed'))).toBe(true)
  })
})
