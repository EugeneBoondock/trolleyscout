import { describe, expect, it } from 'vitest'
import { parseFoodLoversFeed } from './foodLovers'

describe('parseFoodLoversFeed', () => {
  it('decodes direct special records', () => {
    const payload = htmlEncodeJson([
      {
        id: { ID: 28263, post_title: 'Fillet Friday 17 July 2026' },
        type: 'Data',
        image: 'https://flm-cdn.test/beef-fillet.webp',
        noise: 'x'.repeat(5_000),
        price: '299.99',
        scope: 'National',
        units: 'per kg',
        country: 'ZA',
        end_date: '20260717',
        start_date: '20260717',
        description: 'Beef Fillet',
        small_print: 'Valid at select SA stores only.',
        exclude_stores: [4794, 4848],
      },
    ])

    const page = parseFoodLoversFeed(payload, {
      capturedAt: '2026-07-17T08:00:00.000Z',
      sourceUrl: 'https://foodloversmarket.co.za/specials/',
    })

    expect(page.candidates).toHaveLength(1)
    expect(page.catalogues).toEqual([])
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://flm-cdn.test/beef-fillet.webp',
      priceCents: 29_999,
      productId: '28263',
      productUrl: 'https://foodloversmarket.co.za/specials/',
      promotionId: '28263',
      retailerId: 'food-lovers',
      scope: {
        excludedStoreIds: ['4794', '4848'],
        type: 'national',
      },
      sourceKind: 'structured',
      termsText: 'Valid at select SA stores only.',
      title: 'Beef Fillet',
      unitText: 'per kg',
      validFrom: '2026-07-17',
      validTo: '2026-07-17',
    })
    expect(page.candidates[0].evidenceText.length).toBeLessThanOrEqual(512)
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 29_999,
      promotionMarker: '28263',
      sourceId: '28263',
      validFrom: '2026-07-17',
      validTo: '2026-07-17',
    })
    expect(JSON.parse(page.candidates[0].evidenceText).scope).toContain('national')
  })

  it('keeps regional and store catalogue scope', () => {
    const payload = htmlEncodeJson([
      {
        id: { ID: 26151 },
        pdf: 28943,
        noise: 'x'.repeat(5_000),
        type: 'PDF',
        scope: 'Regional',
        title: 'KwaZulu-Natal 13 to 19 July 2026',
        pdf_url: 'https://flm-cdn.test/kzn.pdf',
        pdf_thumb: 'https://flm-cdn.test/kzn-pdf.webp',
        regions: ['KwaZulu-Natal'],
        exclude_stores: [25088],
        end_date: '20260719',
        start_date: '20260713',
        small_print: 'Select KwaZulu-Natal stores only.',
      },
      {
        id: { ID: 29001 },
        type: 'PDF',
        scope: 'Store',
        title: 'Selected Gauteng stores',
        pdf_url: 'https://flm-cdn.test/selected-stores.pdf',
        stores: [101, 102, 103],
        exclude_stores: [102],
        end_date: '20260726',
        start_date: '20260720',
      },
    ])

    const page = parseFoodLoversFeed(payload, {
      capturedAt: '2026-07-16T08:00:00.000Z',
      sourceUrl: 'https://foodloversmarket.co.za/specials/',
    })

    expect(page.candidates).toEqual([])
    expect(page.catalogues).toHaveLength(2)
    expect(page.catalogues[0]).toMatchObject({
      catalogueId: '26151',
      documentUrl: 'https://flm-cdn.test/kzn.pdf',
      imageUrl: 'https://flm-cdn.test/kzn-pdf.webp',
      retailerId: 'food-lovers',
      scope: {
        excludedStoreIds: ['25088'],
        regionIds: ['KwaZulu-Natal'],
        type: 'province',
      },
      title: 'KwaZulu-Natal 13 to 19 July 2026',
      validFrom: '2026-07-13',
      validTo: '2026-07-19',
    })
    expect(page.catalogues[1].scope).toMatchObject({
      excludedStoreIds: ['102'],
      storeIds: ['101', '102', '103'],
      type: 'store',
    })
    expect(page.catalogues[0].evidenceText.length).toBeLessThanOrEqual(512)
    expect(JSON.parse(page.catalogues[0].evidenceText)).toMatchObject({
      promotionMarker: 'PDF',
      sourceId: '26151',
      validFrom: '2026-07-13',
      validTo: '2026-07-19',
    })
    expect(JSON.parse(page.catalogues[1].evidenceText).scope).toContain('store')
  })

  it('throws for malformed encoded records', () => {
    const context = foodLoversContext()

    expect(() => parseFoodLoversFeed('{bad json', context)).toThrow(
      'Invalid Food Lovers feed payload',
    )
    expect(() => parseFoodLoversFeed({ records: [] }, context)).toThrow(
      'Invalid Food Lovers feed payload',
    )
  })

  it('rejects inactive direct specials', () => {
    const records = [
      foodLoversData('active', '20260716', '20260716'),
      foodLoversData('expired', '20260710', '20260715'),
      foodLoversData('future', '20260717', '20260718'),
      foodLoversData('invalid', 'invalid', '20260718'),
    ]
    const page = parseFoodLoversFeed(htmlEncodeJson(records), foodLoversContext())

    expect(page.candidates.map((candidate) => candidate.productId)).toEqual(['active'])
  })

  it('rejects empty regional and store scope IDs', () => {
    const page = parseFoodLoversFeed(htmlEncodeJson([
      { ...foodLoversData('regional', '20260716', '20260716'), scope: 'Regional', regions: [] },
      {
        id: { ID: 'store-pdf' },
        type: 'PDF',
        scope: 'Store',
        stores: [],
        title: 'Missing store scope',
        pdf_url: 'https://flm-cdn.test/missing-scope.pdf',
        start_date: '20260720',
        end_date: '20260726',
      },
    ]), foodLoversContext())

    expect(page.candidates).toEqual([])
    expect(page.catalogues).toEqual([])
  })
})

function foodLoversContext() {
  return {
    capturedAt: '2026-07-16T08:00:00.000Z',
    sourceUrl: 'https://foodloversmarket.co.za/specials/',
  }
}

function foodLoversData(id: string, startDate: string, endDate: string) {
  return {
    id: { ID: id },
    type: 'Data',
    scope: 'National',
    description: `Product ${id}`,
    price: '10.00',
    start_date: startDate,
    end_date: endDate,
  }
}

function htmlEncodeJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
