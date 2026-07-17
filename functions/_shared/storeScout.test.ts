// @vitest-environment node

import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NearbyStore } from '../../src/services/nearbyStores'
import type { TrolleyScoutEnv } from './env'
import { extractPublicStoreDeals, scoutNearbyStores } from './storeScout'

describe('extractPublicStoreDeals', () => {
  it('reads source-backed JSON-LD Product and Offer records with images', () => {
    const html = `
      <script type="application/ld+json">
        {
          "@type": "Product",
          "name": "Tastic Rice 2kg",
          "image": ["https://store.test/rice.jpg"],
          "url": "/products/rice",
          "offers": {
            "@type": "Offer",
            "price": "29.99",
            "priceCurrency": "ZAR",
            "priceValidUntil": "2026-07-31"
          }
        }
      </script>`

    expect(
      extractPublicStoreDeals(
        {
          lat: -26.1,
          lon: 28.05,
          name: 'Example Market',
          placeId: 'example-market',
          website: 'https://store.test/',
        },
        html,
        'https://store.test/specials',
        Date.parse('2026-07-16T10:00:00.000Z'),
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://store.test/rice.jpg',
        kind: 'deal',
        priceText: 'R29.99',
        productUrl: 'https://store.test/products/rice',
        sourceUrl: 'https://store.test/specials',
        title: 'Tastic Rice 2kg',
        validTo: '2026-07-31',
      }),
    ])
  })

  it('removes duplicate public offers from repeated structured data', () => {
    const product = {
      '@type': 'Product',
      name: 'Milk 2L',
      offers: {
        '@type': 'Offer',
        price: 34.99,
        priceCurrency: 'ZAR',
        priceValidUntil: '2026-07-31',
      },
      url: 'https://store.test/milk',
    }
    const html = `<script type="application/ld+json">${JSON.stringify([product, product])}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
        html,
        'https://store.test/deals',
        0,
      ),
    ).toHaveLength(1)
  })

  it('reads bounded embedded product state and keeps explicit promotion evidence', () => {
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"items":[{
          "name":"Sunfoil Oil 2L",
          "currentPrice":49.99,
          "regularPrice":69.99,
          "promotionId":"promo-123",
          "image":"/oil.jpg",
          "url":"/products/oil",
          "validFrom":"2026-07-15",
          "validTo":"2026-07-21"
        }]}}}
      </script>
      <script>
        window.__INITIAL_STATE__ = {"promotions":[{
          "title":"Five Roses Tea 100s",
          "salePrice":79.99,
          "listPrice":99.99,
          "discountAmount":20,
          "imageUrl":"/tea.jpg",
          "productUrl":"/products/tea"
        }]};
      </script>`

    const deals = extractPublicStoreDeals(
      {
        lat: -26.1,
        lon: 28.05,
        name: 'Example Market',
        placeId: 'example-market',
        retailerId: 'spar',
      },
      html,
      'https://store.test/products',
      Date.parse('2026-07-16T10:00:00.000Z'),
    )

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          imageUrl: 'https://store.test/oil.jpg',
          previousPriceText: 'R69.99',
          priceText: 'R49.99',
          retailerId: 'spar',
          savingText: 'Save R20.00',
          title: 'Sunfoil Oil 2L',
          validFrom: '2026-07-15',
          validTo: '2026-07-21',
        }),
        expect.objectContaining({
          previousPriceText: 'R99.99',
          priceText: 'R79.99',
          savingText: 'Save R20.00',
          title: 'Five Roses Tea 100s',
        }),
      ]),
    )
  })

  it('reads Nuxt state and generic JSON scripts recursively', () => {
    const html = `
      <script>window.__NUXT__={"data":[{"offers":[{
        "name":"Cremora 750g","price":64.99,"oldPrice":84.99,"promotionText":"Weekly deal"
      }]}]};</script>
      <script type="application/json">{"payload":{"products":[{
        "name":"Nola Mayo 750g","specialPrice":39.99,"wasPrice":54.99,"promoId":"nola-weekly"
      }]}}</script>`

    const deals = extractPublicStoreDeals(
      { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
      html,
      'https://store.test/products',
      0,
    )

    expect(deals.map((deal) => deal.title)).toEqual(['Cremora 750g', 'Nola Mayo 750g'])
  })

  it('reads visible schema product cards when a supermarket has no JSON feed', () => {
    const html = `
      <article itemtype="https://schema.org/Product" itemscope>
        <a href="/products/maize" itemprop="url">
          <img itemprop="image" src="/images/maize.jpg" alt="Iwisa Maize Meal 5kg">
          <h3 itemprop="name">Iwisa Maize Meal 5kg</h3>
        </a>
        <span class="was-price">Was R89.99</span>
        <meta itemprop="priceCurrency" content="ZAR">
        <span class="sale-price" itemprop="price" content="69.99">R69.99</span>
        <strong class="promo-badge">Save R20</strong>
      </article>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/specials',
        Date.parse('2026-07-16T10:00:00.000Z'),
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: 'https://local.test/images/maize.jpg',
        previousPriceText: 'R89.99',
        priceText: 'R69.99',
        productUrl: 'https://local.test/products/maize',
        title: 'Iwisa Maize Meal 5kg',
      }),
    ])
  })

  it('does not treat a visible ordinary-price card as a deal on a general page', () => {
    const html = `
      <article itemtype="https://schema.org/Product" itemscope>
        <h3 itemprop="name">Everyday Sugar 2kg</h3>
        <span itemprop="price" content="44.99">R44.99</span>
      </article>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/products',
        0,
      ),
    ).toEqual([])
  })

  it('drops unsafe product and image URLs from public store markup', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      image: 'data:image/svg+xml,unsafe',
      name: 'Safe title',
      offers: { '@type': 'Offer', price: 20, priceValidUntil: '2026-07-31' },
      url: 'javascript:alert(1)',
    })}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Local Supermarket', placeId: 'local-market' },
        html,
        'https://local.test/specials',
        0,
      ),
    ).toEqual([
      expect.objectContaining({
        imageUrl: undefined,
        productUrl: 'https://local.test/specials',
      }),
    ])
  })

  it('rejects an ordinary product record without promotional proof', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Everyday Bread',
      offers: { '@type': 'Offer', price: 19.99, priceCurrency: 'ZAR' },
      url: '/products/bread',
    })}</script>`

    expect(
      extractPublicStoreDeals(
        { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
        html,
        'https://store.test/products/bread',
        0,
      ),
    ).toEqual([])
  })

  it.each(['/specials', '/promotions'])(
    'rejects ordinary product rows on the promotional path %s',
    (path) => {
      const html = `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Everyday Long Life Milk 1L',
        offers: { '@type': 'Offer', price: 18.99, priceCurrency: 'ZAR' },
        url: '/products/milk',
      })}</script>`

      expect(
        extractPublicStoreDeals(
          { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
          html,
          `https://store.test${path}`,
          0,
        ),
      ).toEqual([])
    },
  )

  it('keeps a stable product identity when its promotional price changes', () => {
    const dealAt = (price: number) => extractPublicStoreDeals(
      { lat: 0, lon: 0, name: 'Example', placeId: 'example' },
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Stable Rice 2kg',
        offers: {
          '@type': 'Offer',
          price,
          priceCurrency: 'ZAR',
          priceValidUntil: '2026-07-31',
        },
        url: '/products/stable-rice',
      })}</script>`,
      'https://store.test/specials',
      0,
    )[0]

    expect(dealAt(29.99).id).toBe(dealAt(24.99).id)
  })
})

describe('scheduled discovered-store scouting', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'store-scout-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    await createScoutTables(db)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await miniflare.dispose()
  })

  it('checks a discovered branch page before generic specials paths', async () => {
    const requestedPaths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedPaths.push(url.pathname)
      if (url.hostname === 'market.test' && url.pathname === '/stores/branch-1') {
        return htmlResponse(`<script type="application/json">${JSON.stringify({
          business: { '@type': 'LocalBusiness', name: 'Market Place' },
          product: {
            name: 'Branch-only chicken portions 2kg',
            oldPrice: 99.99,
            promotionId: 'branch-weekly',
            salePrice: 79.99,
          },
        })}</script>`)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/stores/branch-1' })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requestedPaths[0]).toBe('/stores/branch-1')
    const row = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{ title: string }>()
    expect(row?.title).toBe('Branch-only chicken portions 2kg')
  })

  it('continues through every official specials path across runs and resets after the root', async () => {
    const store = discoveredStore({ website: 'https://market.test/' })
    const pathsByRun: string[][] = []

    for (let run = 0; run < 4; run += 1) {
      const paths: string[] = []
      pathsByRun.push(paths)
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'market.test') {
          paths.push(url.pathname)
        }
        return htmlResponse('')
      }))

      await scoutNearbyStores(env, [store], run * 86_400_000 + run, 1)
    }

    expect(pathsByRun).toEqual([
      ['/specials', '/specials.html', '/promotions', '/promotions.php'],
      ['/deals', '/catalogue', '/catalogues', '/weekly-specials'],
      ['/'],
      ['/specials', '/specials.html', '/promotions', '/promotions.php'],
    ])
  })

  it('does not overwrite a native token cursor with the store path cursor', async () => {
    await db.prepare(
      `INSERT INTO deal_source_cursors (source_key, cursor_kind, cursor_value, updated_at)
       VALUES (?, 'token', 'native-secret-token', ?)`,
    ).bind('store-paths::jg1xhm', '2026-07-16T10:00:00.000Z').run()
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('')))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], 0, 1)

    const cursor = await db.prepare(
      `SELECT cursor_kind, cursor_value FROM deal_source_cursors
       WHERE source_key = 'store-paths::jg1xhm'`,
    ).first<{ cursor_kind: string; cursor_value: string }>()
    expect(cursor).toEqual({ cursor_kind: 'token', cursor_value: 'native-secret-token' })
  })

  it('attempts a due discovered store even when a stale scout log says it is not due', async () => {
    await db.prepare(
      `INSERT INTO store_scout_log
       (place_id, store_name, scouted_at, next_scout_at, promotion_count)
       VALUES (?, ?, ?, ?, 0)`,
    ).bind(
      'market-place',
      'Market Place',
      '2026-07-15T10:00:00.000Z',
      '2026-07-20T10:00:00.000Z',
    ).run()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ nextScoutAt: '2026-07-16T09:00:00.000Z', website: 'https://market.test/' })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requests.some((url) => url.startsWith('https://market.test/'))).toBe(true)
  })

  it('continues to a later store after one store throws unexpectedly', async () => {
    const broken = discoveredStore({ name: 'Broken Market', placeId: 'broken' }) as NearbyStore
    Object.defineProperty(broken, 'address', {
      get() {
        throw new Error('malformed provider address')
      },
    })
    const healthy = discoveredStore({
      name: 'Healthy Market',
      placeId: 'healthy',
      website: 'https://healthy.test/',
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'healthy.test' && url.pathname === '/specials') {
        return htmlResponse(jsonLdDeal('Healthy Milk 2L', 'Healthy Market'))
      }
      return htmlResponse('')
    }))

    await expect(scoutNearbyStores(env, [broken, healthy], 0, 2)).resolves.toBeUndefined()
    const row = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'healthy'`,
    ).first<{ title: string }>()
    expect(row?.title).toBe('Healthy Milk 2L')
  })

  it('keeps only same-origin catalogue PDFs from a verified official website', async () => {
    const html = `
      <h2>Market Place weekly specials</h2>
      <address>10 Main Road, Edenvale</address>
      <a href="https://market.test/files/weekly-specials.pdf">Official catalogue</a>
      <a href="https://files.example/copied-specials.pdf">Copied catalogue</a>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' && url.pathname === '/specials'
        ? htmlResponse(html)
        : htmlResponse('')
    }))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], 0, 1)

    const rows = await db.prepare(
      `SELECT product_url FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ product_url: string }>()
    expect(rows.results.map((row) => row.product_url)).toEqual([
      'https://market.test/files/weekly-specials.pdf',
    ])
  })

  it('rejects supplied website promotions when the page has no store identity evidence', async () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Unrelated promoted cereal',
        offers: {
          '@type': 'Offer',
          price: 39.99,
          priceCurrency: 'ZAR',
          priceValidUntil: '2026-07-31',
        },
      })}</script>
      <a href="https://market.test/files/unrelated-specials.pdf">Weekly catalogue</a>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' ? htmlResponse(html) : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/' })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    const rows = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ title: string }>()
    expect(rows.results).toEqual([])
  })

  it('rejects a known retailer website when its host is not the known official host', async () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify([
        { '@type': 'LocalBusiness', name: 'Woolworths Edenvale' },
        {
          '@type': 'Product',
          name: 'Promoted apples 1kg',
          offers: {
            '@type': 'Offer',
            price: 34.99,
            priceCurrency: 'ZAR',
            priceValidUntil: '2026-07-31',
          },
        },
      ])}</script>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'lookalike-market.test' ? htmlResponse(html) : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        name: 'Woolworths Edenvale',
        retailerId: 'woolworths',
        website: 'https://lookalike-market.test/',
      })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    const rows = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).all<{ title: string }>()
    expect(rows.results).toEqual([])
  })

  it('verifies a newly discovered official domain from LocalBusiness structured data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'html.duckduckgo.com') {
        const target = encodeURIComponent('https://freshbasket.co.za/specials')
        return htmlResponse(
          `<a class="result__a" href="//duckduckgo.com/l/?uddg=${target}&amp;rut=x">Fresh Basket specials</a>`,
        )
      }
      if (url.hostname === 'freshbasket.co.za') {
        return htmlResponse(`
          <script type="application/ld+json">${JSON.stringify([
            {
              '@type': 'https://schema.org/LocalBusiness',
              name: 'Fresh Basket',
            },
            {
              '@type': 'Product',
              name: 'Albany Bread 700g',
              offers: {
                '@type': 'Offer',
                price: 17.99,
                priceCurrency: 'ZAR',
                priceValidUntil: '2026-07-20',
              },
            },
          ])}</script>`)
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ name: 'Fresh Basket', placeId: 'fresh-basket', website: undefined })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    const row = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'fresh-basket'`,
    ).first<{ title: string }>()
    expect(row?.title).toBe('Albany Bread 700g')
  })

  it('uses the anonymous SPAR branch flow before a generic website probe', async () => {
    const requests: Array<{ cookie?: string; url: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ cookie: requestHeader(init?.headers, 'cookie'), url: url.toString() })

      if (url.pathname === '/stores/search') {
        return htmlResponse(`
          <a href="/stores/101017/select?back=/specials">SUPERSPAR Kempton</a>
          <a href="/stores/102646/select?back=/specials">KWIKSPAR Dowerglen</a>`)
      }
      if (url.pathname === '/stores/102646/select') {
        const headers = new Headers({
          'content-type': 'text/html',
          location: '/specials',
        })
        headers.append('set-cookie', 'spar-session=abc123; Path=/; HttpOnly; SameSite=Lax')
        headers.append('set-cookie', 'selected-store=102646; Path=/; Secure')
        return new Response(null, { headers, status: 302 })
      }
      if (url.pathname === '/specials') {
        return htmlResponse(`
          <a href="/specials/11111111-1111-1111-1111-111111111111/show">July groceries</a>
          <a href="/specials/22222222-2222-2222-2222-222222222222/show">Fresh deals</a>`)
      }
      if (/^\/specials\/[a-f0-9-]+\/show$/.test(url.pathname)) {
        return htmlResponse('<p>Valid 16 July to 22 July</p>')
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [
        discoveredStore({
          address: 'Dowerglen, Edenvale, Gauteng',
          name: 'KWIKSPAR Dowerglen',
          retailerId: 'spar',
          website: 'https://wrong-generic-site.test/',
        }),
      ],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requests.some((request) => request.url.includes('/stores/102646/select'))).toBe(true)
    expect(requests.some((request) => request.url.startsWith('https://wrong-generic-site.test')))
      .toBe(false)
    const authenticatedRequests = requests.filter((request) =>
      request.url.includes('/specials') && request.cookie,
    )
    expect(authenticatedRequests.length).toBeGreaterThan(0)
    for (const request of authenticatedRequests) {
      expect(new Set(request.cookie?.split('; '))).toEqual(
        new Set(['spar-session=abc123', 'selected-store=102646']),
      )
      expect(request.cookie).not.toMatch(/Path=|HttpOnly|SameSite|Secure/i)
    }

    const rows = await db.prepare(
      `SELECT retailer_id, store_name, source_url, image_url
       FROM store_promotions WHERE place_id = 'market-place' ORDER BY image_url`,
    ).all<{
      image_url: string
      retailer_id: string
      source_url: string
      store_name: string
    }>()
    expect(rows.results).toEqual([
      {
        image_url: 'https://www.spar.co.za/getattachment/11111111-1111-1111-1111-111111111111/img',
        retailer_id: 'spar',
        source_url: 'https://mobile.spar.co.za/specials/11111111-1111-1111-1111-111111111111/show',
        store_name: 'KWIKSPAR Dowerglen',
      },
      {
        image_url: 'https://www.spar.co.za/getattachment/22222222-2222-2222-2222-222222222222/img',
        retailer_id: 'spar',
        source_url: 'https://mobile.spar.co.za/specials/22222222-2222-2222-2222-222222222222/show',
        store_name: 'KWIKSPAR Dowerglen',
      },
    ])
  })

  it('continues to the official website when the preferred SPAR branch method is unavailable', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requestedUrls.push(url.toString())
      if (url.hostname === 'mobile.spar.co.za' && url.pathname === '/stores/search') {
        return new Response('', { status: 503 })
      }
      if (url.hostname === 'mobile.spar.co.za' && url.pathname === '/branch-specials') {
        return htmlResponse(jsonLdDeal('Branch maize meal 5kg', 'SPAR Branch Market'))
      }
      return htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({
        name: 'SPAR Branch Market',
        retailerId: 'spar',
        website: 'https://mobile.spar.co.za/branch-specials',
      })],
      Date.parse('2026-07-16T10:00:00.000Z'),
      1,
    )

    expect(requestedUrls.some((url) => new URL(url).pathname === '/stores/search')).toBe(true)
    expect(requestedUrls.some((url) => new URL(url).pathname === '/branch-specials')).toBe(true)
    const row = await db.prepare(
      `SELECT title FROM store_promotions WHERE place_id = 'market-place'`,
    ).first<{ title: string }>()
    expect(row?.title).toBe('Branch maize meal 5kg')
  })

  it('retires missing rows after a certain non-empty refresh from the same source', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    await db.prepare(
      `INSERT INTO store_promotions
       (id, place_id, store_name, kind, title, source_url, captured_at, expires_at)
       VALUES ('old-promo', 'market-place', 'Market Place', 'deal', 'Old weekly item',
         'https://market.test/specials/old', ?, ?)`,
    ).bind(
      new Date(nowMs - 86_400_000).toISOString(),
      new Date(nowMs + 86_400_000).toISOString(),
    ).run()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test' && url.pathname === '/specials'
        ? htmlResponse(jsonLdDeal('Current weekly item', 'Market Place'))
        : htmlResponse('')
    }))

    await scoutNearbyStores(
      env,
      [discoveredStore({ website: 'https://market.test/' })],
      nowMs,
      1,
    )

    const rows = await db.prepare(
      `SELECT id, title FROM store_promotions WHERE place_id = 'market-place' ORDER BY title`,
    ).all<{ id: string; title: string }>()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]?.title).toBe('Current weekly item')
    expect(rows.results[0]?.id).not.toBe('old-promo')
  })

  it('uses a short retry for a transient failure and preserves old promotions', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    await db.prepare(
      `INSERT INTO store_promotions
       (id, place_id, store_name, kind, title, source_url, captured_at, expires_at)
       VALUES ('old-promo', 'market-place', 'Market Place', 'deal', 'Still valid',
         'https://market.test/deal', ?, ?)`,
    ).bind(
      new Date(nowMs - 86_400_000).toISOString(),
      new Date(nowMs + 86_400_000).toISOString(),
    ).run()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.hostname === 'market.test'
        ? new Response('', { status: 503 })
        : htmlResponse('')
    }))

    await scoutNearbyStores(env, [discoveredStore({ website: 'https://market.test/' })], nowMs, 1)

    const old = await db.prepare(
      `SELECT title FROM store_promotions WHERE id = 'old-promo'`,
    ).first<{ title: string }>()
    const log = await db.prepare(
      `SELECT next_scout_at FROM store_scout_log WHERE place_id = 'market-place'`,
    ).first<{ next_scout_at: string }>()
    expect(old?.title).toBe('Still valid')
    expect(log?.next_scout_at).toBe('2026-07-16T11:00:00.000Z')
  })
})

function discoveredStore(overrides: Partial<NearbyStore & { nextScoutAt: string }> = {}) {
  return {
    address: '10 Main Road, Edenvale, Gauteng',
    firstSeenAt: '2026-07-15T10:00:00.000Z',
    lastSeenAt: '2026-07-16T09:00:00.000Z',
    lat: -26.1,
    lon: 28.05,
    name: 'Market Place',
    nextScoutAt: '1970-01-01T00:00:00.000Z',
    placeId: 'market-place',
    ...overrides,
  }
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    status,
  })
}

function jsonLdDeal(title: string, storeName: string) {
  return `<script type="application/ld+json">${JSON.stringify([
    { '@type': 'LocalBusiness', name: storeName },
    {
      '@type': 'Product',
      name: title,
      offers: {
        '@type': 'Offer',
        price: 34.99,
        priceCurrency: 'ZAR',
        priceValidUntil: '2026-07-31',
      },
    },
  ])}</script>`
}

function requestHeader(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined
  }
  return new Headers(headers).get(name) ?? undefined
}

async function createScoutTables(db: D1Database) {
  const statements = [
    `CREATE TABLE store_promotions (
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, store_name TEXT NOT NULL,
      retailer_id TEXT, kind TEXT NOT NULL DEFAULT 'deal', title TEXT NOT NULL,
      price_text TEXT, previous_price_text TEXT, saving_text TEXT, source_url TEXT NOT NULL,
      product_url TEXT, image_url TEXT, valid_from TEXT, valid_to TEXT,
      captured_at TEXT NOT NULL, expires_at TEXT NOT NULL
    )`,
    `CREATE TABLE store_scout_log (
      place_id TEXT PRIMARY KEY, store_name TEXT NOT NULL, website TEXT, retailer_id TEXT,
      scouted_at TEXT NOT NULL, next_scout_at TEXT NOT NULL, promotion_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE discovered_stores (
      place_id TEXT PRIMARY KEY, store_name TEXT NOT NULL, address TEXT, website TEXT,
      lat REAL NOT NULL, lon REAL NOT NULL, retailer_id TEXT, first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL, last_source_tile TEXT, last_scout_at TEXT,
      next_scout_at TEXT NOT NULL, promotion_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE deal_source_cursors (
      source_key TEXT PRIMARY KEY, cursor_kind TEXT NOT NULL,
      cursor_value TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
  ]

  for (const statement of statements) {
    await db.prepare(statement).run()
  }
}
