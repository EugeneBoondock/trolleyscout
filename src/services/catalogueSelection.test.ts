import { describe, expect, it } from 'vitest'

import type { StoreLeaflet } from '../types'
import { selectCatalogueInventory, selectCurrentCatalogues } from './catalogueSelection'

const NOW = new Date('2026-07-27T12:00:00.000Z')

function leaflet(overrides: Partial<StoreLeaflet> = {}): StoreLeaflet {
  return {
    capturedAt: '2026-07-27T08:00:00.000Z',
    documentUrl: 'https://example.test/catalogues/current-week.pdf',
    id: 'catalogue',
    name: 'Weekly specials catalogue',
    retailerId: 'example-store',
    retailerName: 'Example Store',
    url: 'https://example.test/promotions',
    validFrom: '2026-07-21',
    validTo: '2026-08-02',
    ...overrides,
  }
}

describe('selectCurrentCatalogues', () => {
  it('drops a named prior-year PDF but keeps an evergreen current index PDF', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: 'https://edgars.test/images/2025-Edgars-Catalogue.pdf',
        id: 'old-edgars',
        name: 'Edgars 2025 Catalogue',
        validFrom: undefined,
        validTo: undefined,
      }),
      leaflet({
        documentUrl:
          'https://tech.test/wp-content/uploads/2025/03/Tech-Africa-Product-Catalogue.pdf',
        id: 'tech-africa',
        name: 'Tech Africa Product Catalogue',
        retailerId: 'tech-africa',
        retailerName: 'Tech Africa',
        validFrom: undefined,
        validTo: undefined,
      }),
    ], NOW)

    expect(result.map((item) => item.id)).toEqual(['tech-africa'])
  })

  it('deduplicates the same PDF across www and apex hosts', () => {
    const first = leaflet({
      documentUrl: 'https://www.store.test/catalogues/current.pdf',
      id: 'www-copy',
    })
    const second = leaflet({
      documentUrl: 'https://store.test/catalogues/current.pdf',
      id: 'apex-copy',
    })

    expect(selectCurrentCatalogues([first, second], NOW)).toHaveLength(1)
  })

  it('removes expired catalogues', () => {
    expect(selectCurrentCatalogues([
      leaflet({ id: 'expired', validTo: '2026-07-26' }),
      leaflet({ id: 'current', validTo: '2026-07-27' }),
    ], NOW).map((item) => item.id)).toEqual(['current'])
  })

  it('uses a validity range in the title when structured dates are missing', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        id: 'weekend',
        name: 'Weekend special promo 24th - 26th July 2026',
        validFrom: undefined,
        validTo: undefined,
      }),
      leaflet({
        id: 'month-end',
        name: 'July month end promo 24th July - 09th August 2026',
        validFrom: undefined,
        validTo: undefined,
      }),
    ], NOW)

    expect(result.map((item) => item.id)).toEqual(['month-end'])
    expect(result[0].validTo).toBe('2026-08-09')
  })

  it('keeps a real ordered image catalogue and removes loose promotional images', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        id: 'pages',
        pages: [
          { height: 1600, imageUrl: 'https://cdn.test/catalogues/page-2.webp', pageNumber: 2, width: 1100 },
          { height: 1600, imageUrl: 'https://cdn.test/catalogues/page-1.webp', pageNumber: 1, width: 1100 },
        ],
      }),
      leaflet({
        documentUrl: undefined,
        id: 'hero',
        imageUrl: 'https://cdn.test/images/summer-hero.jpg',
        name: 'Summer hero',
        url: 'https://example.test/',
        validFrom: undefined,
        validTo: undefined,
      }),
    ], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('pages')
    expect(result[0].pages?.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(result[0].imageUrl).toBe('https://cdn.test/catalogues/page-1.webp')
  })

  it('keeps query-distinct pages from a proxied catalogue viewer', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: undefined,
        id: 'boxer-viewer',
        name: 'Boxer month-end catalogue',
        pages: [
          {
            height: 1773,
            imageUrl:
              'https://trolleyscout.co.za/api/catalogue-page?viewer=https%3A%2F%2Fviewer.example%2Fboxer&file=page&extension=jpg&page=2',
            pageNumber: 2,
            width: 1250,
          },
          {
            height: 1773,
            imageUrl:
              'https://trolleyscout.co.za/api/catalogue-page?viewer=https%3A%2F%2Fviewer.example%2Fboxer&file=page&extension=jpg&page=1',
            pageNumber: 1,
            width: 1250,
          },
        ],
        url: 'https://www.boxer.co.za/promotions',
      }),
    ], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].pages?.map((page) => page.pageNumber)).toEqual([1, 2])
  })

  it('removes HTML source pages that do not expose pages or a catalogue document', () => {
    expect(selectCurrentCatalogues([
      leaflet({
        documentUrl: undefined,
        imageUrl: 'https://example.test/assets/catalogue-cover.jpg',
        name: 'Current catalogue',
        url: 'https://example.test/catalogues',
        validFrom: undefined,
        validTo: undefined,
      }),
    ], NOW)).toEqual([])
  })

  it('rejects informational PDFs that are not retail promotions', () => {
    expect(selectCurrentCatalogues([
      leaflet({
        documentUrl: 'https://provider.test/docs/consumer-information-document.pdf',
        name: 'Consumer information document',
        retailerId: 'network-provider',
        retailerName: 'Network Provider',
        validFrom: undefined,
        validTo: undefined,
      }),
      leaflet({
        documentUrl: 'https://provider.test/terms-regulations/special-numbering.pdf',
        name: 'Special numbering for complementary services',
        retailerId: 'other-network',
        retailerName: 'Other Network',
        url: 'https://provider.test/mobile',
        validFrom: undefined,
        validTo: undefined,
      }),
    ], NOW)).toEqual([])
  })

  it('drops stale undated assets using dates embedded in their paths', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: 'https://frontline.test/uploads/1740_Frontline_SOCIAL_260420_121546.pdf',
        id: 'april',
        name: 'Promotions',
        retailerId: 'frontline-hyper',
        retailerName: 'Frontline Hyper',
        validFrom: undefined,
        validTo: undefined,
      }),
      leaflet({
        documentUrl: 'https://frontline.test/uploads/1928_Frontline_SOCIAL_260720_100108.pdf',
        id: 'july',
        name: 'Promotions',
        retailerId: 'frontline-hyper',
        retailerName: 'Frontline Hyper',
        validFrom: undefined,
        validTo: undefined,
      }),
    ], NOW)

    expect(result.map((item) => item.id)).toEqual(['july'])
    expect(result[0].name).toBe('Frontline Hyper catalogue')
  })

  it('rejects a catalogue title paired with a PDF from another year', () => {
    expect(selectCurrentCatalogues([
      leaflet({
        documentUrl: 'https://cdn.test/wp-content/uploads/2025/11/winter.pdf',
        name: 'Winter Carnival 23 July to 2 August 2026',
        validFrom: '2026-07-23',
        validTo: '2026-08-02',
      }),
    ], NOW)).toEqual([])
  })

  it('cleans HTML titles and removes homepage URLs used as cover images', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: 'https://example.test/catalogues/week-31.pdf',
        imageUrl: 'https://example.test/',
        name: '<strong>Weekly &amp; fresh</strong> catalogue',
      }),
    ], NOW)

    expect(result[0].name).toBe('Weekly & fresh catalogue')
    expect(result[0].imageUrl).toBeUndefined()
  })

  it('keeps the richer PDF when an image-only duplicate is present', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: 'https://cdn.test/catalogues/week-31.pdf',
        id: 'pdf',
        imageUrl: 'https://cdn.test/catalogues/week-31-cover.webp',
      }),
      leaflet({
        documentUrl: undefined,
        id: 'image',
        imageUrl: 'https://cdn.test/catalogues/week-31-cover.webp',
        pages: [
          { height: 1600, imageUrl: 'https://cdn.test/catalogues/week-31-cover.webp', pageNumber: 1, width: 1100 },
        ],
      }),
    ], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('pdf')
  })

  it('keeps a validated directory catalogue whose pages load on demand', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: undefined,
        id: 'directory-catalogue',
        imageUrl: 'https://img.offers-cdn.net/flyers/current-cover.webp',
        name: 'Example Store catalogue week 30',
        pagesUrl: 'https://trolleyscout.co.za/api/catalogue-pages?flyer=12345&store=example',
        url: 'https://www.cataloguespecials.co.za/view/specials/example-catalogue-12345',
      }),
    ], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].pagesUrl).toContain('/api/catalogue-pages')
  })

  it('adds a full-page loader when FlippingBook supplied only its cover', () => {
    const viewer =
      'https://online.flippingbook.com/view/246249203/index.html'
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: undefined,
        id: 'boxer-modern-viewer',
        imageUrl: 'https://cdn.test/boxer-cover.webp',
        pages: [{
          height: 2900,
          imageUrl: 'https://cdn.test/boxer-cover.webp',
          pageNumber: 1,
          width: 2050,
        }],
        retailerId: 'boxer',
        retailerName: 'Boxer',
        url: viewer,
      }),
    ], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].pagesUrl).toBe(
      `https://trolleyscout.co.za/api/catalogue-pages?source=flippingbook&viewer=${encodeURIComponent(viewer)}`,
    )
  })

  it('adds a stable PDF proxy when an HFlip catalogue supplied only its cover', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: undefined,
        id: 'pnp-heyzine',
        imageUrl: 'https://cdn.test/pnp-cover.webp',
        pages: [{
          height: 1600,
          imageUrl: 'https://cdn.test/pnp-cover.webp',
          pageNumber: 1,
          width: 1100,
        }],
        retailerId: 'pick-n-pay',
        retailerName: 'Pick n Pay',
        url: 'https://pnpcatalogues.hflip.co/9744ed8319.html',
      }),
    ], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].documentUrl).toBe(
      'https://trolleyscout.co.za/api/catalogue-document.pdf?source=heyzine&book=9744ed8319',
    )
  })

  it('does not create reader endpoints for lookalike or malformed viewers', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: undefined,
        id: 'flippingbook-lookalike',
        pages: [{
          height: 1600,
          imageUrl: 'https://cdn.test/cover-one.webp',
          pageNumber: 1,
          width: 1100,
        }],
        url:
          'https://online.flippingbook.com.evil.test/view/246249203/index.html',
      }),
      leaflet({
        documentUrl: undefined,
        id: 'hflip-malformed',
        pages: [{
          height: 1600,
          imageUrl: 'https://cdn.test/cover-two.webp',
          pageNumber: 1,
          width: 1100,
        }],
        url: 'https://pnpcatalogues.hflip.co/not-a-book.html',
      }),
    ], NOW)

    expect(result.every((item) =>
      item.pagesUrl === undefined && item.documentUrl === undefined)).toBe(true)
  })

  it('keeps the best full-page provider when two sources publish one campaign', () => {
    const result = selectCurrentCatalogues([
      leaflet({
        documentUrl: undefined,
        id: 'guzzle-weekly',
        imageUrl: 'https://guzzle.test/cover.webp',
        name: 'Boxer weekly specials',
        pagesUrl:
          'https://trolleyscout.co.za/api/catalogue-pages?source=guzzle&catalogue=1&store=boxer',
        retailerId: 'boxer',
        retailerName: 'Boxer',
        sourceLabel: 'Guzzle',
        validFrom: '2026-07-27',
        validTo: '2026-08-02',
      }),
      leaflet({
        documentUrl: undefined,
        id: 'latest-weekly',
        imageUrl: 'https://latest.test/cover.webp',
        name: 'Boxer weekly catalogue',
        pagesUrl:
          'https://trolleyscout.co.za/api/catalogue-pages?source=latest-specials&flyer=2&path=%2Fboxer%2Fweekly-2%2F',
        retailerId: 'boxer',
        retailerName: 'Boxer',
        sourceLabel: 'Latest Specials',
        validFrom: '2026-07-27',
        validTo: '2026-08-02',
      }),
    ], NOW)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('latest-weekly')
  })

  it('does not count the Pick n Pay directory beside its readable viewer', () => {
    const result = selectCatalogueInventory([
      leaflet({
        documentUrl: undefined,
        id: 'pnp-directory',
        name: 'Pick n Pay catalogues',
        pagesUrl: 'https://trolleyscout.co.za/api/catalogue-pages?source=pnp-directory',
        retailerId: 'pick-n-pay',
        retailerName: 'Pick n Pay',
        url: 'https://www.pnp.co.za/catalogues',
        validFrom: undefined,
        validTo: undefined,
      }),
      leaflet({
        documentUrl: undefined,
        id: 'pnp-viewer',
        name: 'Pick n Pay weekly catalogue',
        pages: [{
          height: 1600,
          imageUrl: 'https://cdn.test/pnp-cover.webp',
          pageNumber: 1,
          width: 1100,
        }],
        retailerId: 'pick-n-pay',
        retailerName: 'Pick n Pay',
        url: 'https://pnpcatalogues.hflip.co/9744ed8319.html',
        validFrom: undefined,
        validTo: undefined,
      }),
    ], NOW)

    expect(result.map((item) => item.id)).toEqual(['pnp-viewer'])
  })
})
