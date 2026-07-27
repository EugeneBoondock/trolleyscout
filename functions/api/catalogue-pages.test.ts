import { describe, expect, it, vi } from 'vitest'

import {
  cataloguePagesCacheKey,
  collapseCataloguePageLoad,
  handleCataloguePagesRequest,
  resolveCataloguePagesRequest,
  resolveCatalogueSpecialsRequest,
} from './catalogue-pages'

function request(query = 'flyer=3703321&store=boxer') {
  return new Request(`https://trolleyscout.co.za/api/catalogue-pages?${query}`)
}

describe('resolveCatalogueSpecialsRequest', () => {
  it('accepts only a numeric flyer and safe store slug', () => {
    expect(resolveCatalogueSpecialsRequest(request().url)).toEqual({
      flyerId: '3703321',
      source: 'catalogue-specials',
      storeSlug: 'boxer',
      url:
        'https://www.cataloguespecials.co.za/view/specials/boxer-catalogue-3703321',
    })
    expect(resolveCatalogueSpecialsRequest(
      request('flyer=3703321&store=https://internal.test').url,
    )).toBeUndefined()
  })
})

describe('resolveCataloguePagesRequest', () => {
  it('accepts fixed upstream identifiers and rejects arbitrary paths', () => {
    expect(resolveCataloguePagesRequest(request(
      'source=guzzle&catalogue=104213&store=buco',
    ).url)).toEqual({
      catalogueId: '104213',
      source: 'guzzle',
      storeSlug: 'buco',
      url: 'https://www.guzzle.co.za/specials/catalogue/104213/buco/',
    })
    expect(resolveCataloguePagesRequest(request(
      'source=latest-specials&flyer=123130&path=%2Ffood-lovers-market%2Ffood-lovers-market-winter-123130%2F',
    ).url)).toEqual(expect.objectContaining({
      flyerId: '123130',
      source: 'latest-specials',
    }))
    expect(resolveCataloguePagesRequest(request(
      'source=latest-specials&flyer=123130&path=https%3A%2F%2Finternal.test%2F',
    ).url)).toBeUndefined()
  })

  it('accepts only an exact numeric FlippingBook viewer URL', () => {
    const viewer =
      'https://online.flippingbook.com/view/246249203/index.html'
    expect(resolveCataloguePagesRequest(request(
      `source=flippingbook&viewer=${encodeURIComponent(viewer)}`,
    ).url)).toEqual({
      source: 'flippingbook',
      url: viewer,
      viewerUrl: viewer,
    })

    for (const unsafeViewer of [
      'http://online.flippingbook.com/view/246249203/index.html',
      'https://online.flippingbook.com.evil.test/view/246249203/index.html',
      'https://online.flippingbook.com/view/letters/index.html',
      'https://online.flippingbook.com/view/246249203/other.html',
      'https://online.flippingbook.com/view/246249203/index.html?next=https://internal.test',
    ]) {
      expect(resolveCataloguePagesRequest(request(
        `source=flippingbook&viewer=${encodeURIComponent(unsafeViewer)}`,
      ).url)).toBeUndefined()
    }
  })
})

describe('handleCataloguePagesRequest', () => {
  it('returns every ordered high-resolution catalogue page', async () => {
    const fetcher = vi.fn(async () => new Response(`
      <img src="https://img.offers-cdn.net/assets/uploads/flyers/3703321/260x270WebP/boxer-2-1-6a61d49b91297.webp">
      <img src="https://img.offers-cdn.net/assets/uploads/flyers/3703321/260x270WebP/boxer-1-1-6a61d49b83337.webp">
    `)) as typeof fetch

    const response = await handleCataloguePagesRequest(request(), fetcher)
    const body = await response.json() as {
      data: { pages: Array<{ imageUrl: string; pageNumber: number }> }
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('max-age=21600')
    expect(response.headers.get('cache-control'))
      .toContain('stale-while-revalidate=86400')
    expect(body.data.pages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(body.data.pages[0].imageUrl).toContain('/largeWebP/')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('finds the exact detail link from the store page if a vanity slug differs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/laduma-hardware-catalogue-catalogue-3700000')) {
        return new Response('missing', { status: 404 })
      }
      if (url.endsWith('/stores/laduma-hardware-catalogue/catalogues-specials')) {
        return new Response(
          '<a href="/view/specials/laduma-hardware-catalogue-3700000">Read</a>',
        )
      }
      return new Response(
        '<img src="https://img.offers-cdn.net/assets/uploads/flyers/3700000/260x270WebP/laduma-1-abc123.webp">',
      )
    }) as typeof fetch

    const response = await handleCataloguePagesRequest(
      request('flyer=3700000&store=laduma-hardware-catalogue'),
      fetcher,
    )

    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('rejects invalid requests without any upstream call', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch
    const response = await handleCataloguePagesRequest(
      request('flyer=not-a-number&store=boxer'),
      fetcher,
    )

    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('loads Guzzle pages through its session-bound reader endpoint', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/specials/catalogue/104213/buco/')) {
        return new Response(
          '<div data-initial_url="/specials/initial-catalogue/104213/"></div>',
          { headers: { 'set-cookie': 'sessionid=abc123; Path=/; HttpOnly' } },
        )
      }
      expect(new Headers(init?.headers).get('cookie')).toBe('sessionid=abc123')
      expect(new Headers(init?.headers).get('x-requested-with'))
        .toBe('XMLHttpRequest')
      return new Response(`
        <img src="//guzzle.akamaized.net/media/a.jpg.900x10000_q76.jpg.webp">
        <img src="//guzzle.akamaized.net/media/b.jpg.900x10000_q76.jpg.webp">
      `)
    }) as typeof fetch

    const response = await handleCataloguePagesRequest(
      request('source=guzzle&catalogue=104213&store=buco'),
      fetcher,
    )
    const body = await response.json() as {
      data: { pages: Array<{ imageUrl: string; pageNumber: number }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.pages).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('loads every Latest Specials page at its published full size', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const page = Number(url.searchParams.get('page') ?? '1')
      return new Response(`
        <img id="pageZoom" class="lazyloadBrochure"
          width="1550" height="2310"
          data-src="https://eu.leafletscdn.com/thumbor/token${page}=/0x0/filters:format(webp):quality(65)/co.za/data/106/123130/${page - 1}.jpg?t=1">
        <a href="/food-lovers/?page=3">3</a>
      `)
    }) as typeof fetch

    const response = await handleCataloguePagesRequest(
      request(
        'source=latest-specials&flyer=123130&path=%2Ffood-lovers-market%2Ffood-lovers-market-winter-123130%2F',
      ),
      fetcher,
    )
    const body = await response.json() as {
      data: { pages: Array<{ width: number; pageNumber: number }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    expect(body.data.pages.every((page) => page.width === 1550)).toBe(true)
  })

  it('resolves the current My Catalogue detail and returns all pages', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/boxer-specials')) {
        return new Response(
          '<a href="/boxer-specials/boxer-catalogue">Open</a>',
        )
      }
      return new Response(`
        <img id="page_1" class="leaflet-pages"
          src="/public/gimg/2/9/1-350-580.jpg" width="900" height="1773">
        <img id="page_2" class="leaflet-pages"
          src="/public/gimg/2/9/2-350-580.jpg" width="900" height="1773">
      `)
    }) as typeof fetch

    const response = await handleCataloguePagesRequest(
      request('source=my-catalogue&store=boxer'),
      fetcher,
    )
    const body = await response.json() as {
      data: { pages: Array<{ pageNumber: number }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.pages.map((page) => page.pageNumber)).toEqual([1, 2])
  })

  it('turns modern FlippingBook metadata into every stable page URL', async () => {
    const viewer =
      'https://online.flippingbook.com/view/246249203/index.html'
    const fetcher = vi.fn(async () => new Response(`
      <script>
        window.FBO.PreloadedPublicationModel = { "Publication": {
          ContentRoot: 'https://d17lvj5xn8sco6.cloudfront.net/boxer/006AE431/',
          TotalPages: 12
        }};
        var initialPolicies = [{
          "KeyId": "BOXER_KEY",
          "PathPrefix": "://d17lvj5xn8sco6.cloudfront.net/boxer/006AE431/",
          "Policy": "BOXER_POLICY",
          "Signature": "BOXER_SIGNATURE"
        }];
      </script>
    `)) as typeof fetch

    const response = await handleCataloguePagesRequest(
      request(`source=flippingbook&viewer=${encodeURIComponent(viewer)}`),
      fetcher,
    )
    const body = await response.json() as {
      data: { pages: Array<{ imageUrl: string; pageNumber: number }> }
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('max-age=21600')
    expect(body.data.pages).toHaveLength(12)
    expect(body.data.pages[0]).toEqual(expect.objectContaining({
      imageUrl:
        'https://trolleyscout.co.za/api/catalogue-page?page=1&viewer=https%3A%2F%2Fonline.flippingbook.com%2Fview%2F246249203%2Findex.html',
      pageNumber: 1,
    }))
    expect(body.data.pages[11].pageNumber).toBe(12)
    expect(fetcher).toHaveBeenCalledWith(
      viewer,
      expect.objectContaining({ redirect: 'follow' }),
    )
  })

  it('treats a challenge response as unavailable', async () => {
    const fetcher = vi.fn(async () =>
      new Response('', { status: 202 })) as typeof fetch
    const response = await handleCataloguePagesRequest(request(), fetcher)

    expect(response.status).toBe(502)
  })
})

describe('cataloguePagesCacheKey', () => {
  it('normalizes a safe FlippingBook viewer and refuses unsafe requests', () => {
    const viewer =
      'https://online.flippingbook.com/view/246249203/index.html'
    expect(cataloguePagesCacheKey(request(
      `viewer=${encodeURIComponent(viewer)}&source=flippingbook`,
    ))).toBe(
      `https://edge-cache.trolleyscout.co.za/api/catalogue-pages?source=flippingbook&viewer=${encodeURIComponent(viewer)}`,
    )
    expect(cataloguePagesCacheKey(request(
      'source=flippingbook&viewer=https%3A%2F%2Finternal.test%2Fbook',
    ))).toBeUndefined()
  })
})

describe('collapseCataloguePageLoad', () => {
  it('shares one in-flight upstream response across concurrent readers', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const loader = vi.fn(async () => {
      await gate
      return new Response('page list')
    })

    const first = collapseCataloguePageLoad('flyer-1', loader)
    const second = collapseCataloguePageLoad('flyer-1', loader)
    await Promise.resolve()

    expect(loader).toHaveBeenCalledOnce()
    release()
    expect(await (await first).text()).toBe('page list')
    expect(await (await second).text()).toBe('page list')

    expect(await (await collapseCataloguePageLoad(
      'flyer-1',
      loader,
    )).text()).toBe('page list')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
