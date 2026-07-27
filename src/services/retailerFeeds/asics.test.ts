import { describe, expect, it } from 'vitest'
import {
  buildAsicsCatalogueUrl,
  parseAsicsCatalogue,
} from './asics'

const context = {
  capturedAt: '2026-07-26T18:00:00.000Z',
  sourceUrl: 'https://www.asics.com/za/en-za/sports',
}

describe('parseAsicsCatalogue', () => {
  it('publishes only a price drop stated by ASICS', () => {
    const html = `<strong>121 products found</strong>
      <li class="product-item">
        <a href="/za/en-za/gel-kayano/p/0020010001-100"
          title="GEL-KAYANO 32" class="productMainLink">
          <img class="primary-image"
            src="https://images.asics.com/is/image/asics/1011C052_100_SR_RT_GLB?$prodctResponsive$">
        </a>
        <div class="product-intro">
          <span class="previous-price"><meta itemprop="price" content="3200">R 3,200</span>
          <span class="price"><meta itemprop="price" content="2400">R 2,400</span>
        </div>
      </li>`

    const page = parseAsicsCatalogue(html, context)

    expect(page.totalCount).toBe(121)
    expect(page.nextCursor).toEqual({ kind: 'page', page: 2 })
    expect(page.candidates[0]).toMatchObject({
      imageUrl:
        'https://images.asics.com/is/image/asics/1011C052_100_SR_RT_GLB?$prodctResponsive$',
      previousPriceCents: 320_000,
      priceCents: 240_000,
      productId: '0020010001-100',
      productUrl: 'https://www.asics.com/za/en-za/gel-kayano/p/0020010001-100',
      retailerId: 'asics',
      savingText: '25% off',
      title: 'GEL-KAYANO 32',
    })
  })

  it('checks full-price catalogue rows without calling them deals', () => {
    const html = `<strong>1 product found</strong>
      <li class="product-item">
        <a href="/za/en-za/japan-s/p/0020010515-100"
          title="JAPAN S" class="productMainLink"></a>
        <span class="price"><meta itemprop="price" content="1600">R 1,600</span>
      </li>`

    expect(parseAsicsCatalogue(html, context)).toMatchObject({
      candidates: [],
      catalogues: [],
      totalCount: 1,
    })
  })
})

describe('buildAsicsCatalogueUrl', () => {
  it('uses the public national catalogue with a bounded page size', () => {
    expect(buildAsicsCatalogueUrl(2)).toBe(
      'https://www.asics.com/za/en-za/sports?page=2&perpage=120',
    )
  })
})
