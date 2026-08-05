import { describe, expect, it } from 'vitest'

import { fetchProductReviews } from './product-reviews'

const jsonResponse = (payload: unknown) => new Response(JSON.stringify(payload))

describe('fetchProductReviews', () => {
  it('reads Takealot summary and newest comments by PLID', async () => {
    const requested: string[] = []
    const summary = await fetchProductReviews(
      'https://www.takealot.com/some-kettle/PLID91234567',
      async (input, init) => {
        requested.push(input)
        expect((init?.headers as Record<string, string>)['user-agent'])
          .toContain('Mozilla')
        if (input.includes('product-details')) {
          return jsonResponse({ core: { reviews: 42, star_rating: 4.6 } })
        }
        return jsonResponse({
          items: [{
            customer_name: 'Thandi',
            date: '2026-07-01',
            review: 'Boils fast, feels solid.',
            star_rating: 5,
            title: 'Great kettle',
          }],
        })
      })

    expect(requested[0]).toContain('PLID91234567')
    expect(summary).toMatchObject({
      available: true,
      rating: 4.6,
      reviewCount: 42,
      source: 'takealot',
    })
    expect(summary.reviews[0]).toMatchObject({
      author: 'Thandi',
      body: 'Boils fast, feels solid.',
      rating: 5,
    })
  })

  it('reads WooCommerce store ratings and comments by slug', async () => {
    const summary = await fetchProductReviews(
      'https://everythingzimbabwean.com/product/beifa-packing-tape-48mm/',
      async (input) => {
        if (input.includes('/products?slug=')) {
          expect(input).toContain('slug=beifa-packing-tape-48mm')
          return jsonResponse([{ average_rating: '4.5', id: 88, review_count: 2 }])
        }
        expect(input).toContain('product_id=88')
        return jsonResponse([{
          date_created: '2026-06-20T10:00:00',
          rating: 4,
          review: '<p>Sticks well &amp; arrived fast.</p>',
          reviewer: 'Rufaro',
        }])
      })

    expect(summary).toMatchObject({
      available: true,
      rating: 4.5,
      reviewCount: 2,
      source: 'woocommerce',
    })
    expect(summary.reviews[0]).toMatchObject({
      author: 'Rufaro',
      body: 'Sticks well & arrived fast.',
      rating: 4,
    })
  })

  it('parses the Clicks server-rendered review fragment', async () => {
    const summary = await fetchProductReviews(
      'https://clicks.co.za/some-serum/p/123456',
      async (input) => {
        expect(input).toBe('https://clicks.co.za/some-serum/p/123456/reviewhtml/all')
        return new Response(`
          <div class="reviewsOuter">
            <span itemprop="ratingValue">5</span>
            <span itemprop="name">Lovely product</span>
            <p itemprop="reviewBody">Works wonders on my skin.</p>
            <span itemprop="ratingValue">3</span>
            <span itemprop="name">Okay</span>
            <p itemprop="reviewBody">Decent but pricey.</p>
          </div>`)
      })

    expect(summary).toMatchObject({
      available: true,
      rating: 4,
      reviewCount: 2,
      source: 'clicks',
    })
    expect(summary.reviews.map((review) => review.title))
      .toEqual(['Lovely product', 'Okay'])
  })

  it('says unavailable rather than inventing data', async () => {
    expect(await fetchProductReviews('not a url')).toMatchObject({
      available: false,
    })
    expect(await fetchProductReviews(
      'https://www.takealot.com/no-plid-here',
      async () => jsonResponse({}),
    )).toMatchObject({ available: false })
    expect(await fetchProductReviews(
      'https://shop.example/product/thing',
      async () => new Response('down', { status: 500 }),
    )).toMatchObject({ available: false })
    expect(await fetchProductReviews(
      'https://shop.example/product/thing',
      async () => jsonResponse([{ average_rating: '0', id: 5, review_count: 0 }]),
    )).toMatchObject({ available: false })
  })
})
