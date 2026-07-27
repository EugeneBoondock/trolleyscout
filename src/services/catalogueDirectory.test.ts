import { describe, expect, it } from 'vitest'

import {
  catalogueSpecialsDirectoryPageCount,
  extractCatalogueSpecialsLeaflets,
  extractCatalogueSpecialsPages,
} from './catalogueDirectory'

const CAPTURED_AT = '2026-07-27T10:00:00.000Z'

describe('Catalogue Specials directory', () => {
  it('reads only flyer cards and ignores ordinary images and advertisements', () => {
    const html = `
      <a href="/ads"><img src="https://ads.test/banner.jpg"></a>
      <a href="/stores/boxer/catalogues-specials">
        <div class="flyer" data-flyer-id="3703321" data-flyer-name="Boxer">
          <img alt="Boxer (valid until 29-07)"
            src="https://img.offers-cdn.net/assets/uploads/flyers/3703321/thumbnailFixedWidth/boxer-catalogue-week-30-h400WebP-6a61d49b83337.webp">
        </div>
      </a>`

    expect(extractCatalogueSpecialsLeaflets(html, CAPTURED_AT)).toEqual([
      expect.objectContaining({
        countryCode: 'ZA',
        id: 'catalogue-specials-3703321',
        name: 'Boxer catalogue week 30',
        pagesUrl:
          'https://trolleyscout.co.za/api/catalogue-pages?flyer=3703321&store=boxer',
        retailerId: 'boxer',
        retailerName: 'Boxer',
        validTo: '2026-07-29',
      }),
    ])
  })

  it('uses the last visible pagination link as the bounded page count', () => {
    expect(catalogueSpecialsDirectoryPageCount(`
      <a href="/latest-catalogues?page=1">1</a>
      <a href="/latest-catalogues?page=22">22</a>
    `)).toBe(22)
  })

  it('turns every ordered thumbnail into a high-resolution readable page', () => {
    const html = `
      <img src="https://img.offers-cdn.net/assets/uploads/flyers/3703321/260x270WebP/boxer-2-1-6a61d49b91297.webp">
      <img src="https://img.offers-cdn.net/assets/uploads/flyers/3703321/260x270/boxer-1-1-6a61d49b83337.jpeg">
      <img src="https://img.offers-cdn.net/assets/uploads/flyers/9999999/260x270WebP/other-1.webp">
    `

    const pages = extractCatalogueSpecialsPages(html, '3703321')

    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(pages[0].imageUrl).toBe(
      'https://img.offers-cdn.net/assets/uploads/flyers/3703321/largeWebP/boxer-1-1-6a61d49b83337.webp',
    )
    expect(pages[0].fallbacks).toEqual([
      'https://img.offers-cdn.net/assets/uploads/flyers/3703321/260x270/boxer-1-1-6a61d49b83337.jpeg',
    ])
  })
})
