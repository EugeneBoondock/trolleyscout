import { describe, expect, test } from 'vitest'
import {
  buildLeafletApiUrl,
  extractBoxerLeaflets,
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
    expect(leaflets[0].name).toBe('Usave specials: July')
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
