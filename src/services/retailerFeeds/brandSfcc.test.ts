import { describe, expect, it } from 'vitest'
import {
  BRAND_SFCC_SHOPS,
  buildBrandSfccGridUrl,
  parseBrandSfccGrid,
} from './brandSfcc'

const capturedAt = '2026-07-26T08:00:00.000Z'

describe('parseBrandSfccGrid', () => {
  it('reads Adidas sale prices and media', () => {
    const shop = BRAND_SFCC_SHOPS[0]
    const context = { capturedAt, sourceUrl: 'https://www.adidas.co.za/sale' }
    const html = `<div class="product" data-pid="H03472">
      <a href="/H03472.html" aria-label="Adidas Run 70s Shoes">
        <img src="https://assets.adidas.com/images/H03472_00_plp_standard.jpg">
      </a>
      <span class="sales"><span class="value" content="1399.0"></span></span>
      <span class="strike-through list"><span class="value" content="1999.0"></span></span>
    </div>`

    const page = parseBrandSfccGrid(html, context, shop)

    expect(page.totalCount).toBe(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://assets.adidas.com/images/H03472_00_plp_standard.jpg',
      previousPriceCents: 199_900,
      priceCents: 139_900,
      productId: 'H03472',
      productUrl: 'https://www.adidas.co.za/H03472.html',
      retailerId: 'adidas',
      savingText: '30% off',
      title: 'Adidas Run 70s Shoes',
    })
  })

  it('reads New Balance data-style-price safely', () => {
    const shop = BRAND_SFCC_SHOPS[1]
    const context = { capturedAt, sourceUrl: 'https://www.newbalance.co.za/Sale-3/' }
    const prices = JSON.stringify({
      list: { percentage: 20, value: 1999 },
      sales: { value: 1599 },
    }).replace(/"/g, '&quot;')
    const html = `<div class="product w-100" aria-label="DynaSoft Nitrel v6"
      data-pid="MTNTRV6-46540" data-style-price="${prices}">
      <a href="/men/shoes/MTNTRV6-46540.html">
        <img data-src="https://nb.scene7.com/is/image/NB/mtntrv6_nb_02_i?wid=464&amp;hei=464">
      </a>
    </div>`

    const page = parseBrandSfccGrid(html, context, shop)

    expect(page.totalCount).toBe(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://nb.scene7.com/is/image/NB/mtntrv6_nb_02_i?wid=464&hei=464',
      previousPriceCents: 199_900,
      priceCents: 159_900,
      productId: 'MTNTRV6-46540',
      productUrl: 'https://www.newbalance.co.za/men/shoes/MTNTRV6-46540.html',
      retailerId: 'new-balance',
      savingText: '20% off',
      title: 'DynaSoft Nitrel v6',
    })
  })

  it('counts full-price products without publishing them', () => {
    const shop = BRAND_SFCC_SHOPS[0]
    const context = { capturedAt, sourceUrl: 'https://www.adidas.co.za/sale' }
    const html = `<div class="product" data-pid="full-price">
      <a href="/full-price.html" aria-label="Full Price Shoe"></a>
      <span class="sales"><span class="value" content="1999.0"></span></span>
      <span class="list"><span class="value" content="1999.0"></span></span>
    </div>`

    const page = parseBrandSfccGrid(html, context, shop)
    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(1)
  })
})

describe('buildBrandSfccGridUrl', () => {
  it('uses each shop’s public grid endpoint', () => {
    expect(buildBrandSfccGridUrl(BRAND_SFCC_SHOPS[1], 18)).toBe(
      'https://www.newbalance.co.za/on/demandware.store/' +
      'Sites-NBZA-Site/en_ZA/Search-UpdateGrid?cgid=Clearance&start=18&sz=18',
    )
  })
})
