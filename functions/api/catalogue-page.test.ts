import { describe, expect, it, vi } from 'vitest'

import {
  handleCataloguePageRequest,
  resolveModernFlippingBookViewerUrl,
} from './catalogue-page'

const viewerUrl = 'https://online.flippingbook.com/view/246249203/index.html'
const contentRoot =
  'https://d17lvj5xn8sco6.cloudfront.net/boxer/006AE431/'

function request(page = 1, viewer = viewerUrl) {
  return new Request(
    `https://trolleyscout.co.za/api/catalogue-page?page=${page}&viewer=${encodeURIComponent(viewer)}`,
  )
}

function viewerHtml() {
  return `
    <script>
      window.FBO.PreloadedPublicationModel = { "Publication": {
        ContentRoot: '${contentRoot}',
        ContentVersion: '006AE431',
        TotalPages: 12
      }};
      var initialPolicies = [{
        "KeyId": "BOXER_KEY",
        "PathPrefix": "://d17lvj5xn8sco6.cloudfront.net/boxer/006AE431/",
        "Policy": "BOXER_POLICY",
        "Signature": "BOXER_SIGNATURE"
      }];
    </script>
  `
}

const pager = JSON.stringify({
  bookSize: { height: 1105, width: 779 },
  pages: {
    defaults: {
      substrateFormat: 'jpg',
      substrateSizes: [650, 960, 1350, 2050],
      substrateSizesReady: 4,
      substrateWebPCount: 3,
    },
    structure: Array.from({ length: 12 }, (_, index) => String(index + 1)),
  },
})

describe('resolveModernFlippingBookViewerUrl', () => {
  it('only accepts the public FlippingBook viewer', () => {
    expect(resolveModernFlippingBookViewerUrl(viewerUrl)?.toString()).toBe(viewerUrl)
    expect(resolveModernFlippingBookViewerUrl('https://localhost/view/1')).toBeUndefined()
    expect(resolveModernFlippingBookViewerUrl(
      'https://online.flippingbook.com.evil.test/view/1',
    )).toBeUndefined()
  })
})

describe('handleCataloguePageRequest', () => {
  it('serves the highest-quality current Boxer page through a stable URL', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === viewerUrl) {
        return new Response(viewerHtml(), {
          headers: { 'content-type': 'text/html' },
        })
      }
      if (url.includes('/common/pager.json?')) {
        return new Response(pager, {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/page0001_4.jpg?')) {
        return new Response('high-resolution-boxer-page', {
          headers: {
            'content-length': '28',
            'content-type': 'image/jpeg',
          },
        })
      }
      return new Response('missing', { status: 404 })
    }) as typeof fetch

    const response = await handleCataloguePageRequest(request(), fetcher)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toContain('max-age=21600')
    expect(await response.text()).toBe('high-resolution-boxer-page')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('rejects pages outside the publication and never fetches an image', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return url === viewerUrl
        ? new Response(viewerHtml())
        : new Response(pager)
    }) as typeof fetch

    const response = await handleCataloguePageRequest(request(13), fetcher)

    expect(response.status).toBe(404)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
