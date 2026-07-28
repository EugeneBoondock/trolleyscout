import { describe, expect, test } from 'vitest'
import {
  buildLeafletApiUrl,
  extractBoxerLeaflets,
  extractFlippingBookViewerUrl,
  extractViewerCoverImage,
  extractPdfLeaflets,
  extractOfficialPdfIndexLeaflets,
  extractPnpCmsLeaflets,
  extractSixtyLeaflets,
  extractTmpnpApiCatalogues,
  extractTmpnpCatalogues,
  leafletTargets,
} from './leafletDiscovery'

const shoprite = leafletTargets.find((target) => target.retailerId === 'shoprite')!
const boxer = leafletTargets.find((target) => target.retailerId === 'boxer')!
const usave = leafletTargets.find((target) => target.retailerId === 'usave')!
const pnp = leafletTargets.find((target) => target.kind === 'pnp-cms')!
const tmpnp = leafletTargets.find((target) => target.kind === 'tmpnp-catalogue')!
const edgarsZimbabwe = leafletTargets.find(
  (target) => target.retailerId === 'edgars-zimbabwe',
)!

describe('Zimbabwe official PDF catalogues', () => {
  test('keeps current same-site multi-page documents and rejects stale or foreign files', () => {
    const html = `
      <a href="/images/Edgars%202026%20Winter%20Catalogue_web.pdf">
        OUR CATALOGUE
      </a>
      <a href="/images/2025%20Edgars%20Corporate%20Catalogue.pdf">
        Corporate catalogue
      </a>
      <a href="https://attacker.test/fake-catalogue.pdf">Fake catalogue</a>
      <a href="/terms.pdf">Terms</a>
    `

    expect(extractOfficialPdfIndexLeaflets(
      edgarsZimbabwe,
      html,
      '2026-07-27T12:00:00.000Z',
    )).toEqual([
      expect.objectContaining({
        countryCode: 'ZW',
        documentUrl:
          'https://edgarsstores.co.zw/images/Edgars%202026%20Winter%20Catalogue_web.pdf',
        name: 'OUR CATALOGUE',
        priceScope: { type: 'national' },
        retailerName: 'Edgars Zimbabwe',
      }),
    ])
  })

  test('keeps several evergreen category catalogues from one current index', () => {
    const techAfrica = leafletTargets.find(
      (target) => target.retailerId === 'tech-africa-zimbabwe',
    )!
    const html = `
      <a href="/wp-content/uploads/2025/03/Tech-Africa-Product-Catalogue.pdf">
        Tech Africa Full Catalogue
      </a>
      <a href="/wp-content/uploads/2025/03/Tech-Africa-Generators-Catalogue.pdf">
        Tech Africa Generators Catalogue
      </a>
    `

    expect(extractOfficialPdfIndexLeaflets(
      techAfrica,
      html,
      '2026-07-27T12:00:00.000Z',
    )).toHaveLength(2)
  })

  test('reads official PDF links from a public reader response', () => {
    const techAfrica = leafletTargets.find(
      (target) => target.retailerId === 'tech-africa-zimbabwe',
    )!
    const markdown = `
### [Tech Africa Full Catalogue](https://techafrica.co.zw/wp-content/uploads/2025/03/Tech-Africa-Product-Catalogue.pdf)
[Foreign catalogue](https://attacker.test/catalogue.pdf)
`

    expect(extractOfficialPdfIndexLeaflets(
      techAfrica,
      markdown,
      '2026-07-27T12:00:00.000Z',
    )).toEqual([
      expect.objectContaining({ name: 'Tech Africa Full Catalogue' }),
    ])
  })

  test('registers the live College Press Zimbabwe catalogue index', () => {
    const collegePress = leafletTargets.find(
      (target) => target.retailerId === 'college-press-zimbabwe',
    )!

    expect(collegePress).toMatchObject({
      countryCode: 'ZW',
      kind: 'official-pdf-index',
      pageUrl: 'https://www.collegepress.co.zw/catalogues-and-brochures',
    })
    expect(extractOfficialPdfIndexLeaflets(
      collegePress,
      '[Zimbabwe Catalogue](https://www.collegepress.co.zw/files/Zimbabwe%20Catalogue%20%28005%29.pdf)',
      '2026-07-27T12:00:00.000Z',
    )).toEqual([
      expect.objectContaining({
        countryCode: 'ZW',
        retailerName: 'College Press Zimbabwe',
      }),
    ])
  })
})

describe('TM Pick n Pay Zimbabwe catalogues', () => {
  test('maps the official catalogue API into one multi-page leaflet', () => {
    const payload = [{
      expiry_date: '2026-08-02 23:59:59',
      id: 76,
      image_path:
        'https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_images/cover.jpg',
      locations: [
        {
          file_path:
            'https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/page-two.jpg',
          location_name: 'Page 2',
        },
        {
          file_path:
            'https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/page-one.jpg',
          location_name: 'Page 1',
        },
      ],
      start_date: '2026-07-23 00:00:00',
      title: 'Winter Warmers Promotion',
    }]

    expect(extractTmpnpApiCatalogues(
      tmpnp,
      payload,
      '2026-07-27T12:00:00.000Z',
    )).toEqual([
      expect.objectContaining({
        countryCode: 'ZW',
        name: 'Winter Warmers Promotion',
        pages: [
          expect.objectContaining({ pageNumber: 1 }),
          expect.objectContaining({ pageNumber: 2 }),
        ],
        validFrom: '2026-07-23',
        validTo: '2026-08-02',
      }),
    ])
  })

  test('keeps a current image set together as one multi-page catalogue', () => {
    const content = `
### In-Store Catalogues

![Image 7: Winter Warmers Promotion](https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_images/cover.jpg)

#### Winter Warmers Promotion

Valid: 23 July 2026

Deadline: 2 August 2026

Download the catalogue

[Page 2](https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/page-two.jpg)
[Page 1](https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/page-one.jpg)
[Page 3](https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/page-three.jpg)
`

    expect(extractTmpnpCatalogues(
      tmpnp,
      content,
      '2026-07-27T12:00:00.000Z',
    )).toEqual([
      expect.objectContaining({
        countryCode: 'ZW',
        imageUrl:
          'https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_images/cover.jpg',
        name: 'Winter Warmers Promotion',
        priceScope: { type: 'national' },
        retailerName: 'TM Pick n Pay',
        validFrom: '2026-07-23',
        validTo: '2026-08-02',
        pages: [
          expect.objectContaining({
            imageUrl:
              'https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/page-one.jpg',
            pageNumber: 1,
          }),
          expect.objectContaining({ pageNumber: 2 }),
          expect.objectContaining({ pageNumber: 3 }),
        ],
      }),
    ])
  })

  test('rejects expired, single-page, and foreign-host catalogue images', () => {
    const expired = `
#### Old Catalogue
Valid: 1 June 2026
Deadline: 7 June 2026
[Page 1](https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/one.jpg)
[Page 2](https://cdn-s7m8bx8sebjz.vultrcdn.com/catalog_downloads/two.jpg)`
    const untrusted = `
#### Fake Catalogue
Valid: 23 July 2026
Deadline: 2 August 2026
[Page 1](https://evil.test/catalog_downloads/one.jpg)
[Page 2](https://evil.test/catalog_downloads/two.jpg)`

    expect(extractTmpnpCatalogues(
      tmpnp,
      expired,
      '2026-07-27T12:00:00.000Z',
    )).toEqual([])
    expect(extractTmpnpCatalogues(
      tmpnp,
      untrusted,
      '2026-07-27T12:00:00.000Z',
    )).toEqual([])
  })
})

describe('Pick n Pay catalogue CMS leaflets', () => {
  test('registers the official catalogue CMS as a leaflet source', () => {
    expect(pnp).toMatchObject({
      kind: 'pnp-cms',
      pageUrl: expect.stringContaining('/pnphybris/v2/pnp-spa/cms/pages?'),
      retailerId: 'pick-n-pay',
      retailerName: 'Pick n Pay',
    })
  })

  test('maps current banners into distinct viewer leaflets with regional scope', () => {
    const payload = {
      contentSlots: {
        contentSlot: [{
          components: {
            component: [{
              content: `<h2>Pick n Pay Weekly Specials</h2>
                <p class="cat-validity-date">Valid 13 July - 19 July</p>
                <a href="https://pnpcatalogues.hflip.co/4b5699c20a.html">Gauteng</a>
                <a href="https://pnpcatalogues.hflip.co/4b5699c20a.html">Limpopo</a>
                <a href="https://pnpcatalogues.hflip.co/4b5699c20a.html">KwaZulu-Natal</a>
                <a href="https://pnpcatalogues.hflip.co/1c6a13cea9.html">Western Cape</a>
                <a href="https://www.pnp.co.za/c/weekly-deals">Shop now</a>`,
              media: { url: 'https://cdn-prd-02.pnp.co.za/catalogues/weekly.jpg' },
              name: 'wk20_weekly specials_13-19July',
              typeCode: 'BannerComponent',
              uid: 'comp_weekly',
            }, {
              content: `<h2>Pick n Pay Back To School Specials</h2>
                <p class="cat-validity-date">Valid 13 July - 26 July 2026</p>
                <a href="https://pnpcatalogues.hflip.co/2a5875f9a3.html">National</a>`,
              media: { url: 'https://cdn-prd-02.pnp.co.za/catalogues/school.jpg' },
              typeCode: 'BannerComponent',
              uid: 'comp_school',
            }, {
              content: '<a href="https://pnpcatalogues.hflip.co.evil.test/bad.html">Gauteng</a>',
              typeCode: 'BannerComponent',
              uid: 'comp_bad',
            }],
          },
        }],
      },
    }

    const leaflets = extractPnpCmsLeaflets(pnp, payload, '2026-07-15T10:00:00.000Z')

    expect(leaflets).toHaveLength(3)
    expect(leaflets[0]).toMatchObject({
      imageUrl: 'https://cdn-prd-02.pnp.co.za/catalogues/weekly.jpg',
      name: 'Pick n Pay Weekly Specials (Gauteng, Limpopo, KwaZulu-Natal)',
      priceScope: {
        regionIds: ['Gauteng', 'Limpopo', 'KwaZulu-Natal'],
        type: 'province',
      },
      retailerId: 'pick-n-pay',
      url: 'https://pnpcatalogues.hflip.co/4b5699c20a.html',
      validFrom: '2026-07-13',
      validTo: '2026-07-19',
    })
    expect(leaflets[1]).toMatchObject({
      name: 'Pick n Pay Weekly Specials (Western Cape)',
      priceScope: { regionIds: ['Western Cape'], type: 'province' },
      url: 'https://pnpcatalogues.hflip.co/1c6a13cea9.html',
    })
    expect(leaflets[2]).toMatchObject({
      name: 'Pick n Pay Back To School Specials (National)',
      priceScope: { type: 'national' },
      url: 'https://pnpcatalogues.hflip.co/2a5875f9a3.html',
      validFrom: '2026-07-13',
      validTo: '2026-07-26',
    })
  })

  test('returns empty for malformed CMS data', () => {
    expect(extractPnpCmsLeaflets(pnp, { contentSlots: null }, '2026-07-15T10:00:00.000Z'))
      .toEqual([])
  })

  test('skips a malformed banner without hiding later catalogue banners', () => {
    const payload = {
      contentSlots: {
        contentSlot: [{
          components: {
            component: [{ typeCode: 'BannerComponent' }, {
              content: `<h2>Pick n Pay National Specials</h2>
                <p>Valid 1 July - 31 July 2026</p>
                <a href="https://pnpcatalogues.hflip.co/abcdef1234.html">National</a>`,
              typeCode: 'BannerComponent',
            }],
          },
        }],
      },
    }

    expect(extractPnpCmsLeaflets(pnp, payload, '2026-07-15T10:00:00.000Z'))
      .toHaveLength(1)
  })
})

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
      <img src="/content/dam/usave/specials/2026/july/ECFOUSDWEE_CP.pdf/_jcr_content/renditions/cq5dam.web.1280.1280.jpeg">
      <span data-valid-until-timestamp="1786399140000">10 August 2026</span>
      <button data-leaflet-external-url="https://specials.shoprite.co.za/deals/ecusave/index.html">
        View catalogue
      </button>
      <a href="/content/dam/ShopriteGroup/Terms/PDFS/Voucher-Product-Terms.pdf">Terms</a>
      <a href="/content/dam/shp/docs/shoprite-group-paia-manual.pdf">PAIA</a>`

    const leaflets = extractPdfLeaflets(usave, html, '2026-07-15T10:00:00.000Z')

    expect(leaflets).toHaveLength(1)
    expect(leaflets[0].documentUrl).toBe(
      'https://www.usave.co.za/content/dam/usave/specials/2026/july/ECFOUSDWEE_CP.pdf',
    )
    expect(leaflets[0]).toMatchObject({
      imageUrl:
        'https://www.usave.co.za/content/dam/usave/specials/2026/july/' +
        'ECFOUSDWEE_CP.pdf/_jcr_content/renditions/cq5dam.web.1280.1280.jpeg',
      name: 'Usave specials (July)',
      retailerId: 'usave',
      url: 'https://specials.shoprite.co.za/deals/ecusave/index.html',
      validTo: '2026-08-10',
    })
  })

  test('surfaces every regional OK Foods leaflet with a readable region name', () => {
    const okFoods = leafletTargets.find((target) => target.retailerId === 'ok-foods')!
    // Live shape: one PDF per region/section for the current week.
    const codes = [
      'WC-urban',
      'KZN-urban',
      'CEN-Foods',
      'RSA-Liquor',
      'EC-urban',
      'NOR-urban',
      'RSA-Foods',
      'CEN-Grocer',
    ]
    const html = codes.map((code) => `
      <div class="card">
        <img src="/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/${code}.pdf/_jcr_content/renditions/cq5dam.thumbnail.319.319.png">
        <p class="offerValidDate">Valid 24/07/2026 - 10/08/2026</p>
      </div>
    `).join('') + `
      <div data-asset-path="/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/WC-urban.pdf"></div>`

    const leaflets = extractPdfLeaflets(okFoods, html, '2026-07-17T10:00:00.000Z')

    expect(leaflets).toHaveLength(8)
    expect(leaflets.slice(0, 4).map((leaflet) => leaflet.name)).toEqual([
      'OK Foods specials: Western Cape (July)',
      'OK Foods specials: KwaZulu-Natal (July)',
      'OK Foods specials: Central Foods (July)',
      'OK Foods specials: National Liquor (July)',
    ])
    expect(leaflets[0].url).toBe(
      'https://www.okfoods.co.za/content/dam/okfoods/ok-food-leaflets/south-africa/2026/july/week-29/WC-urban.pdf',
    )
    expect(leaflets[0]).toMatchObject({
      imageUrl:
        'https://www.okfoods.co.za/content/dam/okfoods/ok-food-leaflets/' +
        'south-africa/2026/july/week-29/WC-urban.pdf/_jcr_content/' +
        'renditions/cq5dam.thumbnail.319.319.png',
      validFrom: '2026-07-24',
      validTo: '2026-08-10',
    })
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
