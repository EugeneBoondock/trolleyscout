import { describe, expect, test } from 'vitest'
import {
  buildLeafletApiUrl,
  extractBoxerLeaflets,
  extractFlippingBookViewerUrl,
  extractViewerCoverImage,
  extractPdfLeaflets,
  extractSixtyLeaflets,
  leafletTargets,
} from './leafletDiscovery'

const shoprite = leafletTargets.find((target) => target.retailerId === 'shoprite')!
const boxer = leafletTargets.find((target) => target.retailerId === 'boxer')!
const usave = leafletTargets.find((target) => target.retailerId === 'usave')!

describe('buildLeafletApiUrl', () => {
  test('builds the get-store-leaflets endpoint', () => {
    expect(buildLeafletApiUrl('https://www.shoprite.co.za')).toBe(
      'https://www.shoprite.co.za/api/stores/get-store-leaflets',
    )
  })
})

describe('extractSixtyLeaflets', () => {
  test('maps the live get-store-leaflets payload to leaflets with iso dates', () => {
    const payload = [
      {
        imageUrl: '/medias/GN-Checkers.jpg',
        name: 'Shoprite Low Price Lowduuuma Gauteng 13 July - 22 July',
        url: 'https://specials.shoprite.co.za/deals/gnlowprice13jul/index.html',
        startDate: '2026-07-12T22:00:00.000+0000',
        endDate: '2026-07-22T21:59:00.000+0000',
      },
      {
        name: 'Duplicate link should be dropped',
        url: 'https://specials.shoprite.co.za/deals/gnlowprice13jul/index.html',
      },
      { name: 'No URL', url: '' },
    ]

    const leaflets = extractSixtyLeaflets(shoprite, payload, '2026-07-15T10:00:00.000Z')

    expect(leaflets).toHaveLength(1)
    expect(leaflets[0]).toMatchObject({
      imageUrl: 'https://www.shoprite.co.za/medias/GN-Checkers.jpg',
      name: 'Shoprite Low Price Lowduuuma Gauteng 13 July - 22 July',
      priceScope: { storeIds: ['1080'], type: 'store' },
      retailerId: 'shoprite',
      url: 'https://specials.shoprite.co.za/deals/gnlowprice13jul/index.html',
      validFrom: '2026-07-12',
      validTo: '2026-07-22',
    })
  })

  test('returns empty for a non-array payload', () => {
    expect(extractSixtyLeaflets(shoprite, { error: 'nope' }, '2026-07-15T10:00:00.000Z')).toEqual([])
  })
})

describe('extractPdfLeaflets', () => {
  test('extracts specials PDFs with readable names and skips terms docs', () => {
    const html = `
      <a href="/content/dam/usave/specials/2026/july/ECFOUSDWEE_CP.pdf">July specials</a>
      <a href="/content/dam/ShopriteGroup/Terms/PDFS/Voucher-Product-Terms.pdf">Terms</a>
      <a href="/content/dam/shp/docs/shoprite-group-paia-manual.pdf">PAIA</a>`

    const leaflets = extractPdfLeaflets(usave, html, '2026-07-15T10:00:00.000Z')

    expect(leaflets).toHaveLength(1)
    expect(leaflets[0].url).toBe(
      'https://www.usave.co.za/content/dam/usave/specials/2026/july/ECFOUSDWEE_CP.pdf',
    )
    expect(leaflets[0].retailerId).toBe('usave')
    expect(leaflets[0].name).toBe('Usave specials (July)')
    // Readers open documentUrl; without it the leaflet cannot be viewed.
    expect(leaflets[0].documentUrl).toBe(leaflets[0].url)
  })

  test('surfaces every regional OK Foods leaflet with a readable region name', () => {
    const okFoods = leafletTargets.find((target) => target.retailerId === 'ok-foods')!
    // Live shape: one PDF per region/section for the current week.
    const html = `
      <div data-asset-path="/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/WC-urban.pdf"></div>
      <div data-asset-path="/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/KZN-urban.pdf"></div>
      <div data-asset-path="/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/CEN-Foods.pdf"></div>
      <div data-asset-path="/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/RSA-Liquor.pdf"></div>
      <div data-asset-path="/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/WC-urban.pdf"></div>`

    const leaflets = extractPdfLeaflets(okFoods, html, '2026-07-17T10:00:00.000Z')

    expect(leaflets).toHaveLength(4)
    expect(leaflets.map((leaflet) => leaflet.name)).toEqual([
      'OK Foods specials: Western Cape (July)',
      'OK Foods specials: KwaZulu-Natal (July)',
      'OK Foods specials: Central Foods (July)',
      'OK Foods specials: National Liquor (July)',
    ])
    expect(leaflets[0].url).toBe(
      'https://www.okfoods.co.za/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/WC-urban.pdf',
    )
  })
})

describe('extractFlippingBookViewerUrl', () => {
  test('turns an embedded hosted viewer into a pager-resolvable index.html', () => {
    // Boxer's promotion page embeds the viewer via an EmbedScriptUrl redirect.
    const html = `
      <script src="https://online.flippingbook.com/EmbedScriptUrl.aspx?m=redir&hid=53977247"></script>
      <a href="https://online.flippingbook.com/view/53977247/">Open</a>`

    expect(extractFlippingBookViewerUrl(html)).toBe(
      'https://online.flippingbook.com/view/53977247/index.html',
    )
  })

  test('returns undefined when no viewer is embedded', () => {
    expect(extractFlippingBookViewerUrl('<p>No catalogue here</p>')).toBeUndefined()
  })
})

describe('frontline sitebuilder leaflets', () => {
  test('is registered to fetch the home page and every branch page', () => {
    const frontline = leafletTargets.find((target) => target.retailerId === 'frontline')!

    expect(frontline.kind).toBe('sitebuilder-pdf')
    // The weekly leaflet is linked from the nav on the home page; Springs is a
    // separate branch page that carries its own copy.
    expect(frontline.pageUrls).toEqual([
      'https://frontlinesa.co.za/',
      'https://frontlinesa.co.za/springs',
    ])
  })
})

describe('extractBoxerLeaflets', () => {
  test('reads promotion name, valid dates, and absolute leaflet URL', () => {
    const html = `
      <div class="promo">
        <h3>GP July Mega Month</h3>
        <span>Valid: 09/07/2026 - 22/07/2026</span>
        <a href="/post/promotion_details/GPMM09.07.2026">View Leaflet</a>
        <a href="/?view=promotion_details&amp;article_id=8390">Download</a>
      </div>`

    const leaflets = extractBoxerLeaflets(boxer, html, '2026-07-15T10:00:00.000Z')

    expect(leaflets).toHaveLength(1)
    expect(leaflets[0]).toMatchObject({
      retailerId: 'boxer',
      url: 'https://www.boxer.co.za/post/promotion_details/GPMM09.07.2026',
      validFrom: '2026-07-09',
      validTo: '2026-07-22',
    })
    expect(leaflets[0].name).toContain('Mega Month')
  })
})

describe('extractViewerCoverImage', () => {
  test('prefers the public cloudfront cover the hosted viewer publishes', () => {
    const html = `<img src="https://d17lvj5xn8sco6.cloudfront.net/89/41/61/98/006A1443/cover300.jpg">
      <meta property="og:image" content="https://fbo-b.flippingbook.com/Thumb.aspx?hid=1&amp;v=x">`

    expect(extractViewerCoverImage(html)).toBe(
      'https://d17lvj5xn8sco6.cloudfront.net/89/41/61/98/006A1443/cover300.jpg',
    )
  })

  test('falls back to og:image with entities decoded', () => {
    const html = `<meta property="og:image" content="https://fbo-b.flippingbook.com/Thumb.aspx?hid=1&amp;v=x">`

    expect(extractViewerCoverImage(html)).toBe('https://fbo-b.flippingbook.com/Thumb.aspx?hid=1&v=x')
  })

  test('returns undefined when the page publishes no cover', () => {
    expect(extractViewerCoverImage('<p>nothing</p>')).toBeUndefined()
  })
})
