import { describe, expect, it } from 'vitest'

import { parseFairPricePromotionPage } from './fairPrice'

const context = {
  capturedAt: '2026-07-22T08:00:00.000Z',
  sourceUrl: 'https://www.fairprice.co.za/promotions',
}

function productCard({
  currentPrice = '400',
  imageUrl = 'https://www.fairprice.co.za/media/catalog/product/h.jpg',
  oldPrice = '500',
  productId = '4834',
  productUrl = 'https://www.fairprice.co.za/heater-homestar-10-bar-54-170',
  title = 'Heater &amp; Homestar - 10 Bar',
} = {}) {
  return `
    <li class="item product product-item">
      <a data-product-id="${productId}" href="${productUrl}" class="product photo product-item-photo">
        <img class="product-image-photo" src="${imageUrl}" alt="${title}">
      </a>
      <h2 class="product name product-item-name">
        <a class="product-item-link" href="${productUrl}">${title}</a>
      </h2>
      <div class="price-box" data-product-id="${productId}">
        <span id="product-price-${productId}" data-price-amount="${currentPrice}"
          data-price-type="finalPrice" class="price-wrapper"></span>
        <span id="old-price-${productId}" data-price-amount="${oldPrice}"
          data-price-type="oldPrice" class="price-wrapper"></span>
      </div>
    </li>`
}

describe('parseFairPricePromotionPage', () => {
  it('keeps official promotion cards with both prices and a product link', () => {
    const page = parseFairPricePromotionPage(
      `<ul class="products-grid">${productCard()}</ul>`,
      context,
    )

    expect(page.candidates).toEqual([expect.objectContaining({
      imageUrl: 'https://www.fairprice.co.za/media/catalog/product/h.jpg',
      priceCents: 40_000,
      previousPriceCents: 50_000,
      productId: 'fair-price-4834',
      productUrl: 'https://www.fairprice.co.za/heater-homestar-10-bar-54-170',
      retailerId: 'fair-price',
      savingText: 'Save R100.00',
      scope: { type: 'national' },
      sourceKind: 'structured',
      title: 'Heater & Homestar - 10 Bar',
    })])
    expect(page.catalogues).toEqual([])
    expect(page.nextCursor).toBeUndefined()
    expect(page.totalCount).toBe(1)
  })

  it('skips full-price and incomplete cards', () => {
    const page = parseFairPricePromotionPage(`
      <ul class="products-grid">
        ${productCard({ currentPrice: '500', oldPrice: '500' })}
        ${productCard({ productId: '', productUrl: '' })}
        ${productCard({ productId: '99', title: '' })}
      </ul>
    `, context)

    expect(page.candidates).toEqual([])
  })

  it('supports reordered attributes and numeric HTML entities', () => {
    const page = parseFairPricePromotionPage(`
      <li data-test="deal" class="product-item item product">
        <img src="/media/catalog/product/tv.jpg" class="product-image-photo">
        <a href="/imperial-tv-stand-1-245" class="name product-item-link">
          Imperial &#x54;V Stand
        </a>
        <span data-price-type="finalPrice" class="price-wrapper" data-price-amount="8000"></span>
        <span data-price-type="oldPrice" data-price-amount="9000"></span>
        <form data-role="tocart-form"><input name="product" value="245"></form>
      </li>
    `, context)

    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://www.fairprice.co.za/media/catalog/product/tv.jpg',
      priceCents: 800_000,
      previousPriceCents: 900_000,
      productId: 'fair-price-245',
      productUrl: 'https://www.fairprice.co.za/imperial-tv-stand-1-245',
      title: 'Imperial TV Stand',
    })
  })

  it('rejects a response without product markup', () => {
    expect(() => parseFairPricePromotionPage(
      '<html><title>Access denied</title></html>',
      context,
    )).toThrow('Invalid Fair Price promotions response')
  })
})
