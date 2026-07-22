import { describe, expect, it } from 'vitest'
import {
  extractAmazonVoucherCandidates,
  extractPublicVoucherCandidates,
} from './voucherDiscovery'

describe('voucher discovery', () => {
  const capturedAt = '2026-07-16T10:00:00.000Z'

  it('preserves Amazon coupon identity, product identity, benefit, image, and redemption URL', () => {
    const html = `
      <script>
        {"asin":"B0H3LWJJBR","title":"USB C Hub 8 in 1 Adapter","link":"/USB-Hub-Adapter/dp/B0H3LWJJBR","image":{"hiRes":{"baseUrl":"https://m.media-amazon.com/images/I/71hub","extension":"jpg"}},"price":{"priceToPay":{"label":"Price:","price":"125.0"}},"coupon":{"label":{"fragments":[{"text":"You pay "},{"money":{"amount":"112.50","currencyCode":"ZAR"}}]},"messaging":{"text":" with voucher"},"id":"/promo/A13E9H0R6NENRV"}}
      </script>
    `

    expect(extractAmazonVoucherCandidates(html, capturedAt)).toEqual([
      expect.objectContaining({
        accountRequired: true,
        benefitText: 'You pay R112.50 with voucher',
        externalId: 'A13E9H0R6NENRV',
        imageUrl: 'https://m.media-amazon.com/images/I/71hub.jpg',
        productId: 'B0H3LWJJBR',
        productTitle: 'USB C Hub 8 in 1 Adapter',
        redemptionMode: 'clip',
        redemptionUrl: 'https://www.amazon.co.za/USB-Hub-Adapter/dp/B0H3LWJJBR',
        retailerId: 'amazon-za',
        sourceUrl: 'https://www.amazon.co.za/coupons',
        voucherKind: 'product_coupon',
      }),
    ])
  })

  it('keeps multiple Amazon vouchers for the same product when coupon IDs differ', () => {
    const html = `
      <script>{"asin":"B0TEST","title":"Test item","link":"/item/dp/B0TEST","price":{"priceToPay":{"price":"100"}},"coupon":{"label":{"fragments":[{"text":"Save 10%"}]},"id":"/promo/ONE"}}</script>
      <script>{"asin":"B0TEST","title":"Test item","link":"/item/dp/B0TEST","price":{"priceToPay":{"price":"100"}},"coupon":{"label":{"fragments":[{"text":"Save R20"}]},"id":"/promo/TWO"}}</script>
    `

    const vouchers = extractAmazonVoucherCandidates(html, capturedAt)

    expect(vouchers.map((voucher) => voucher.externalId)).toEqual(['ONE', 'TWO'])
  })

  it('rejects off-site Amazon redemption links and strips off-site images', () => {
    const html = `
      <script>{"asin":"EVIL1","title":"Off-site item","link":"https://evil.example/redeem","coupon":{"label":{"fragments":[{"text":"Save R10"}]},"id":"/promo/EVIL"}}</script>
      <script>{"asin":"SAFE1","title":"On-site item","link":"/item/dp/SAFE1","image":{"hiRes":{"baseUrl":"https://tracker.example/pixel","extension":"gif"}},"coupon":{"label":{"fragments":[{"text":"Save R20"}]},"id":"/promo/SAFE"}}</script>
    `

    expect(extractAmazonVoucherCandidates(html, capturedAt)).toEqual([
      expect.objectContaining({
        externalId: 'SAFE',
        imageUrl: undefined,
        redemptionUrl: 'https://www.amazon.co.za/item/dp/SAFE1',
      }),
    ])
  })

  it('finds prose-announced promo codes without any voucher markup', () => {
    // Real retailer pages announce codes in plain copy, not data attributes.
    const html = `
      <main>
        <h1>July specials</h1>
        <p>This week only: use promo code WINTER15 for 15% off all heaters.</p>
        <p>Delivery is free on orders over R450.</p>
      </main>
    `

    const vouchers = extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'builders',
      sourceUrl: 'https://www.builders.co.za/builders-plus',
    })

    expect(vouchers).toEqual([
      expect.objectContaining({
        code: 'WINTER15',
        publicReusable: true,
        redemptionMode: 'code',
        retailerId: 'builders',
        title: 'Promo code WINTER15',
        voucherKind: 'public_code',
      }),
    ])
    expect(vouchers[0].benefitText).toContain('15% off')
  })

  it('ignores prose codes with no benefit nearby and personalised codes', () => {
    const html = `
      <p>Track your order: enter code ABC123X in the tracking box.</p>
      <p>Your personal voucher: use code JUSTYOU9 for R50 off. Do not share.</p>
    `

    expect(extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'builders',
      sourceUrl: 'https://www.builders.co.za/builders-plus',
    })).toEqual([])
  })

  it('extracts a visibly published reusable code from an official page', () => {
    const html = `
      <section class="voucher-card" data-voucher-id="winter-25" data-voucher-code="SAVE25">
        <h2>Winter grocery voucher</h2>
        <p>Use promo code SAVE25 for R25 off orders over R250.</p>
        <time datetime="2026-07-31">Valid until 31 July 2026</time>
        <a href="/shop">Shop and redeem</a>
      </section>
    `

    expect(extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'example-market',
      sourceUrl: 'https://example.co.za/vouchers',
    })).toEqual([
      expect.objectContaining({
        accountRequired: false,
        benefitText: 'Use promo code SAVE25 for R25 off orders over R250.',
        code: 'SAVE25',
        externalId: 'winter-25',
        publicReusable: true,
        redemptionMode: 'code',
        redemptionUrl: 'https://example.co.za/shop',
        validTo: '2026-07-31',
        voucherKind: 'public_code',
      }),
    ])
  })

  it('does not expose personalized or single-use codes', () => {
    const html = `
      <section class="voucher-card" data-voucher-id="private" data-voucher-code="UNIQUE123">
        <h2>Your personal voucher</h2>
        <p>This single-use code is personalized for your account.</p>
      </section>
    `

    expect(extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'example-market',
      sourceUrl: 'https://example.co.za/account/vouchers',
    })).toEqual([])
  })

  it('does not expose a code described as only for the current visitor', () => {
    const html = `
      <section data-voucher-id="private-for-you" data-voucher-code="ONLYYOU">
        <h2>Member voucher</h2>
        <p>This voucher code is for you only. Save R50 today.</p>
      </section>
    `

    expect(extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'example-market',
      sourceUrl: 'https://example.co.za/vouchers',
    })).toEqual([])
  })

  it('does not expose a personal non-transferable code', () => {
    const html = `
      <section data-voucher-id="private-personal" data-voucher-code="PERSONAL20">
        <h2>Personal voucher</h2>
        <p>Use personal promo code PERSONAL20 for R20 off. This code is non-transferable.</p>
      </section>
    `

    expect(extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'example-market',
      sourceUrl: 'https://example.co.za/vouchers',
    })).toEqual([])
  })

  it('rejects a private-network public-code source URL', () => {
    const html = `
      <section data-voucher-id="local-code" data-voucher-code="LOCAL20">
        <h2>Local voucher</h2>
        <p>Use promo code LOCAL20 for R20 off.</p>
        <a href="/redeem">Redeem</a>
      </section>
    `

    expect(extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'example-market',
      sourceUrl: 'https://127.0.0.1/vouchers',
    })).toEqual([])
  })

  it('rejects ordinary offers that have no voucher proof', () => {
    const html = `
      <section class="special-card">
        <h2>Milk 2L</h2>
        <p>Now R29.99</p>
        <a href="/milk">Shop now</a>
      </section>
    `

    expect(extractPublicVoucherCandidates({
      capturedAt,
      html,
      retailerId: 'example-market',
      sourceUrl: 'https://example.co.za/specials',
    })).toEqual([])
  })
})
