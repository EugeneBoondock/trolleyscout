import { describe, expect, it } from 'vitest'

import {
  catalogueDirectoryProvider,
  extractGuzzleLeaflets,
  extractGuzzlePages,
  extractLatestSpecialsLeaflets,
  extractLatestSpecialsHtmlLeaflets,
  extractLatestSpecialsPage,
  extractMyCatalogueDetailPath,
  extractMyCatalogueLeaflets,
  extractMyCataloguePages,
  latestSpecialsPageCount,
} from './catalogueSources'

const CAPTURED_AT = '2026-07-27T10:00:00.000Z'

describe('catalogue source adapters', () => {
  it('identifies the supported directory from its fixed host', () => {
    expect(catalogueDirectoryProvider(
      'https://www.guzzle.co.za/specials/latest-online-catalogues/',
    )).toBe('guzzle')
    expect(catalogueDirectoryProvider('https://attacker.test/catalogues'))
      .toBeUndefined()
  })

  it('reads current Guzzle cards with a full-size cover and exact dates', () => {
    const html = `
      <div class="catalogue-wrap">
        <meta itemprop="name" content="BUCO : Orange Square Sale (27 July - 09 August 2026) - Merchant">
        <meta itemprop="startDate" content="July 27, 2026">
        <meta itemprop="endDate" content="Aug. 9, 2026">
        <a href="/specials/catalogue/104213/buco/">
          <img src="//guzzle.akamaized.net/media/thumbnails/824968.jpg.218x284_q76.jpg.webp">
        </a>
        <div class="supplier">
          <img src="//guzzle.akamaized.net/media/suppliers/BUCO-1.png">
        </div>
      </div>`

    expect(extractGuzzleLeaflets(html, CAPTURED_AT)).toEqual([
      expect.objectContaining({
        countryCode: 'ZA',
        id: 'guzzle-104213',
        imageUrl:
          'https://guzzle.akamaized.net/media/thumbnails/824968.jpg.900x10000_q76.jpg.webp',
        pagesUrl:
          'https://trolleyscout.co.za/api/catalogue-pages?source=guzzle&catalogue=104213&store=buco',
        retailerId: 'buco',
        retailerName: 'BUCO',
        sourceId: 'guzzle-za',
        validFrom: '2026-07-27',
        validTo: '2026-08-09',
      }),
    ])
  })

  it('reads every Guzzle full-page image once', () => {
    const pages = extractGuzzlePages(`
      <img src="//guzzle.akamaized.net/media/a.jpg.900x10000_q76.jpg.webp">
      <img src="//guzzle.akamaized.net/media/b.jpg.900x10000_q76.jpg.webp">
      <img src="//guzzle.akamaized.net/media/a.jpg.900x10000_q76.jpg.webp">
    `)
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(pages[0].width).toBe(900)
  })

  it('reads the Latest Specials RSS validity, full cover, and safe page path', () => {
    const rss = `
      <rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
        <title><![CDATA[🔝 Saverite specials (from 27/07/2026) – The best deals are just a click away! 🛒]]></title>
        <link>https://www.latestspecials.co.za/saverite/saverite-specials-from-monday-27-07-2026-123478/</link>
        <guid isPermaLink="false">flyer:saverite:123478</guid>
        <category><![CDATA[Groceries]]></category>
        <category><![CDATA[Saverite]]></category>
        <description><![CDATA[Valid 27/07/2026 - 02/08/2026]]></description>
        <media:content
          url="https://eu.leafletscdn.com/thumbor/token=/0x0/filters:format(webp):quality(65)/co.za/data/261/123478/0.jpg?t=1785090311"
          width="1550" height="1938"/>
      </item></channel></rss>`

    expect(extractLatestSpecialsLeaflets(rss, CAPTURED_AT)).toEqual([
      expect.objectContaining({
        id: 'latest-specials-123478',
        name: 'Saverite specials (from 27/07/2026)',
        pagesUrl: expect.stringContaining(
          'source=latest-specials&flyer=123478&path=',
        ),
        retailerName: 'Saverite',
        sourceId: 'latest-specials-za',
        validFrom: '2026-07-27',
        validTo: '2026-08-02',
      }),
    ])
  })

  it('reads a signed full-size Latest Specials page and the last page link', () => {
    const html = `
      <img id="pageZoom" class="zoom lazyloadBrochure"
        width="1550" height="2310"
        data-src="https://eu.leafletscdn.com/thumbor/token=/0x0/filters:format(webp):quality(65)/co.za/data/106/123130/5.jpg?t=1784711832">
      <a href="/food-lovers/?page=2">2</a>
      <a href="/food-lovers/?page=17">17</a>`
    expect(latestSpecialsPageCount(html)).toBe(17)
    expect(extractLatestSpecialsPage(html, '123130', 6)).toEqual({
      height: 2310,
      imageUrl:
        'https://eu.leafletscdn.com/thumbor/token=/0x0/filters:format(webp):quality(65)/co.za/data/106/123130/5.jpg?t=1784711832',
      pageNumber: 6,
      width: 1550,
    })
  })

  it('reads every real flyer card from a Latest Specials category page', () => {
    const html = `
      <div class="brochure-thumb grid-item" data-brochure-id="123478">
        <article>
          <a href="/saverite/saverite-specials-from-monday-27-07-2026-123478/">
            <img src="https://eu.leafletscdn.com/thumbor/token=/full-fit-in/240x240/filters:format(webp):quality(65)/co.za/data/261/123478/0.jpg?t=1">
            <h3>Saverite Specials</h3>
            <span class="hidden-sm">27/07/2026 - 02/08/2026</span>
          </a>
          <a href="/saverite/" class="shop">
            <img data-src="https://eu.leafletscdn.com/thumbor/logo=/full-fit-in/0x50/filters:format(webp):quality(65)/co.za/data/261/logo.png?t=1">
            <span class="shop-name">Saverite</span>
          </a>
        </article>
      </div>
      <img src="https://ads.test/banner.jpg">`

    expect(extractLatestSpecialsHtmlLeaflets(html, CAPTURED_AT)).toEqual([
      expect.objectContaining({
        id: 'latest-specials-123478',
        name: 'Saverite Specials',
        retailerName: 'Saverite',
        validFrom: '2026-07-27',
        validTo: '2026-08-02',
      }),
    ])
  })

  it('reads My Catalogue cards and every page from the current detail', () => {
    const home = `
      <div class="item-wrapper"><div class="item">
        <a href="/clicks-specials" title="Clicks catalogue">
          <img src="/public/gimg/2/9/clicks-catalogue-2973048-350-580.jpg">
        </a>
        <small class="name-mobile">23/07 - 10/08/2026</small>
      </div></div>`
    expect(extractMyCatalogueLeaflets(home, CAPTURED_AT)).toEqual([
      expect.objectContaining({
        id: 'my-catalogue-clicks-2026-08-10',
        pagesUrl:
          'https://trolleyscout.co.za/api/catalogue-pages?source=my-catalogue&store=clicks',
        retailerId: 'clicks',
        sourceId: 'my-catalogue-za',
        validFrom: '2026-07-23',
        validTo: '2026-08-10',
      }),
    ])
    expect(extractMyCatalogueDetailPath(
      '<a href="https://my-catalogue.co.za/clicks-specials/clicks-catalogue">Open</a>',
      'clicks',
    )).toBe('/clicks-specials/clicks-catalogue')

    const pages = extractMyCataloguePages(`
      <img id="page_2" class="leaflet-pages"
        src="/public/gimg/2/9/2-350-580.jpg" width="900" height="1773">
      <img id="page_1" class="leaflet-pages"
        src="/public/gimg/2/9/1-350-580.jpg" width="900" height="1773">
    `)
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(pages[0].imageUrl).toContain('-900-100000.jpg')
  })
})
