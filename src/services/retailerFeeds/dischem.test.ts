import { describe, expect, it } from 'vitest'
import {
  buildDischemKlevuUrl,
  parseDischemFeed,
  parseDischemKlevuCursor,
  parseDischemKlevuFeed,
} from './dischem'

const context = {
  capturedAt: '2026-07-17T08:00:00.000Z',
  page: 0,
  sourceUrl: 'https://www.dischem.co.za/on-promotion',
}

describe('parseDischemFeed', () => {
  it('accepts only named old-price and special-price evidence from official product cards', () => {
    const html = `
      <ol class="products list items product-items">
        ${card({
          body: `
            <span class="old-price"><span class="price">R 2,065.00</span></span>
            <span class="special-price special-red"><span class="price">R 1,032.50</span></span>
          `,
        })}
        ${card({
          body: '<span class="price">R 99.00</span>',
          href: 'https://www.dischem.co.za/ordinary-product-10',
          title: 'Ordinary product',
        })}
        ${card({
          body: `
            <span class="old-price"><span class="price">R 100.00</span></span>
            <span class="special-price"><span class="price">R 100.00</span></span>
          `,
          href: 'https://www.dischem.co.za/same-price-11',
          title: 'Same price product',
        })}
        ${card({
          body: `
            <span class="old-price"><span class="price">R 200.00</span></span>
            <span class="special-price"><span class="price">R 100.00</span></span>
          `,
          href: 'https://example.com/pretend-deal',
          title: 'External product',
        })}
      </ol>
      <li class="pages-item-next"><a href="?p=2">Next</a></li>
    `

    const page = parseDischemFeed(html, context)

    expect(page.totalCount).toBe(4)
    expect(page.nextCursor).toEqual({ kind: 'page', page: 1 })
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://www.dischem.co.za/media/fame.jpg',
      priceCents: 103_250,
      previousPriceCents: 206_500,
      productId: 'paco-rabanne-fame-eau-de-parfum-50ml-381',
      productUrl: 'https://www.dischem.co.za/paco-rabanne-fame-eau-de-parfum-50ml-381',
      retailerId: 'dis-chem',
      savingText: 'Save R1,032.50',
      sourceUrl: context.sourceUrl,
      title: 'Paco Rabanne Fame Eau De Parfum 50ml',
    })
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 103_250,
      previousPriceCents: 206_500,
      promotionMarker: 'old-price>special-price',
      sourceId: 'paco-rabanne-fame-eau-de-parfum-50ml-381',
    })
  })

  it('preserves valid card windows and rejects expired cards', () => {
    const html = [
      card({ attributes: 'data-valid-to="2026-07-31"' }),
      card({
        attributes: 'data-valid-to="2026-07-16"',
        href: 'https://www.dischem.co.za/expired-product-20',
        title: 'Expired product',
      }),
    ].join('')

    const page = parseDischemFeed(html, context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0].validTo).toBe('2026-07-31')
    expect(page.nextCursor).toBeUndefined()
  })

  it('reads the nested Magento price markup used by the live promotion page', () => {
    const html = card({
      body: `
        <span class="old-price">
          <span class="price-container price-final_price tax weee">
            <div data-price-amount="2835" data-price-type="oldPrice" class="price-wrapper">
              <span class="price">R 2,835.00</span>
            </div>
          </span>
        </span>
        <span class="special-price special-red">
          <span class="price-container price-final_price tax weee">
            <span class="price-label">Special Price</span>
            <div data-price-amount="1417.5" data-price-type="finalPrice" class="price-wrapper">
              <span class="price">R 1,417.50</span>
            </div>
          </span>
        </span>
      `,
    })

    expect(parseDischemFeed(html, context).candidates[0]).toMatchObject({
      priceCents: 141_750,
      previousPriceCents: 283_500,
      savingText: 'Save R1,417.50',
    })
  })

  it('rejects non-HTML payloads', () => {
    expect(() => parseDischemFeed({}, context)).toThrow(/Dis-Chem/)
  })
})

function card(options: {
  attributes?: string
  body?: string
  href?: string
  title?: string
} = {}) {
  const title = options.title ?? 'Paco Rabanne Fame Eau De Parfum 50ml'
  const href = options.href ??
    'https://www.dischem.co.za/paco-rabanne-fame-eau-de-parfum-50ml-381'
  const body = options.body ?? `
    <span class="old-price"><span class="price">R 2,065.00</span></span>
    <span class="special-price"><span class="price">R 1,032.50</span></span>
  `

  return `
    <li data-content-type="slide" class="keen-slider__slide product-item" ${options.attributes ?? ''}>
      <div class="product-item-info">
        <img alt="Fame" src="https://www.dischem.co.za/media/fame.jpg" class="product-image-photo">
        <div class="price-box-wrapper-listing simple-from">${body}</div>
        <strong class="product-item-name">
          <a href="${href}" class="product-item-link" title="${title}">${title}</a>
        </strong>
      </div>
    </li>
  `
}

describe('Dis-Chem Klevu lane', () => {
  it('discovers promo discount buckets and hands off a page cursor', () => {
    const { parseDischemKlevuFeed } = klevuApi()
    const page = parseDischemKlevuFeed(
      {
        filters: [
          {
            key: 'promo_discount_sap',
            options: [
              { name: '0', count: 15254 },
              { name: '20', count: 524 },
              { name: '89.99000', count: 172 },
            ],
          },
        ],
        meta: { totalResultsFound: 40814 },
        result: [],
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        cursorToken: '{"phase":"discover"}',
        sourceUrl: 'https://www.dischem.co.za/on-promotion',
      },
    )

    expect(page.candidates).toHaveLength(0)
    expect(page.nextCursor?.kind).toBe('token')
    const state = JSON.parse((page.nextCursor as { token: string }).token)
    expect(state).toMatchObject({ phase: 'page', values: ['20', '89.99000'], valueIndex: 0, offset: 0 })
  })

  it('maps promoted rows with SAP validity windows and paginates buckets', () => {
    const { parseDischemKlevuFeed } = klevuApi()
    const token = JSON.stringify({ phase: 'page', values: ['20'], valueIndex: 0, offset: 0 })
    const page = parseDischemKlevuFeed(
      {
        meta: { totalResultsFound: 443 },
        result: [
          {
            name: 'Dermopal Sunscreen Spf30 100ml',
            sku: '0060505',
            url: 'https://www.dischem.co.za/dermopal-sunscreen-spf-30.html',
            imageUrl: 'https://www.dischem.co.za/api/klevu_images/200X200/derm.jpg',
            salePrice: '91.12',
            oldPrice: '113.90',
            basePrice: '113.90',
            promo_number_sap: '100039531',
            promo_category_sap: 'bsheet july health 14/07/26-09/08/26 s',
            promo_discount_sap: '20',
          },
        ],
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        cursorToken: token,
        sourceUrl: 'https://www.dischem.co.za/on-promotion',
      },
    )

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      priceCents: 9112,
      previousPriceCents: 11390,
      promotionId: '100039531',
      retailerId: 'dis-chem',
      savingText: '20% off',
      title: 'Dermopal Sunscreen Spf30 100ml',
      validFrom: '2026-07-14',
      validTo: '2026-08-09',
    })
    const state = JSON.parse((page.nextCursor as { token: string }).token)
    expect(state).toMatchObject({ phase: 'page', valueIndex: 0, offset: 1 })
  })

  it('drops rows whose SAP window has expired and ends after the last bucket', () => {
    const { parseDischemKlevuFeed } = klevuApi()
    const token = JSON.stringify({ phase: 'page', values: ['20'], valueIndex: 0, offset: 440 })
    const page = parseDischemKlevuFeed(
      {
        meta: { totalResultsFound: 441 },
        result: [
          {
            name: 'Expired Promo Item',
            sku: 'x1',
            url: 'https://www.dischem.co.za/expired.html',
            salePrice: '50.00',
            promo_category_sap: 'bsheet june 01/06/26-30/06/26 s',
            promo_discount_sap: '20',
          },
        ],
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        cursorToken: token,
        sourceUrl: 'https://www.dischem.co.za/on-promotion',
      },
    )

    expect(page.candidates).toHaveLength(0)
    expect(page.nextCursor).toBeUndefined()
  })

  it('builds discover and filtered page URLs', () => {
    const { buildDischemKlevuUrl, parseDischemKlevuCursor } = klevuApi()
    const discover = buildDischemKlevuUrl(parseDischemKlevuCursor(undefined))
    expect(discover).toContain('enableFilters=true')
    expect(discover).toContain('ksearchnet.com')

    const paged = buildDischemKlevuUrl(
      parseDischemKlevuCursor('{"phase":"page","values":["20"],"valueIndex":0,"offset":100}'),
    )
    expect(paged).toContain('filterResults=promo_discount_sap%3A20')
    expect(paged).toContain('paginationStartsFrom=100')
  })
})

function klevuApi() {
  return {
    buildDischemKlevuUrl,
    parseDischemKlevuCursor,
    parseDischemKlevuFeed,
  }
}
