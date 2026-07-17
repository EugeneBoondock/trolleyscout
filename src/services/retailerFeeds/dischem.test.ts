import { describe, expect, it } from 'vitest'
import { parseDischemFeed } from './dischem'

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
