import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedCursor } from '../../src/services/retailerFeeds/types'
import type { VoucherCandidate } from '../../src/services/vouchers/types'
import { runVoucherScout, type VoucherScoutRepository } from './voucherScout'

describe('voucher scout', () => {
  let cursor: FeedCursor | undefined
  let written: VoucherCandidate[][]
  let repository: VoucherScoutRepository

  beforeEach(() => {
    cursor = undefined
    written = []
    repository = {
      expire: vi.fn().mockResolvedValue(0),
      readCursor: vi.fn(async () => cursor),
      upsert: vi.fn(async (input) => {
        written.push([...input.candidates])
        return { processed: input.candidates.length, rowIds: [], runId: 'run-1' }
      }),
      writeCursor: vi.fn(async (_sourceKey, value) => {
        cursor = value
      }),
    }
  })

  it('writes at most 100 Amazon vouchers and resumes the unchanged response', async () => {
    const html = amazonVoucherHtml(205)
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(html, {
      headers: { 'content-type': 'text/html' },
      status: 200,
    }))

    const first = await runVoucherScout({ DB: {} as D1Database }, {
      fetchImpl,
      repository,
      sources: [{
        parser: 'amazon',
        retailerId: 'amazon-za',
        sourceKey: 'amazon-za::vouchers',
        url: 'https://www.amazon.co.za/coupons',
      }],
    })
    const second = await runVoucherScout({ DB: {} as D1Database }, {
      fetchImpl,
      repository,
      sources: [{
        parser: 'amazon',
        retailerId: 'amazon-za',
        sourceKey: 'amazon-za::vouchers',
        url: 'https://www.amazon.co.za/coupons',
      }],
    })
    const third = await runVoucherScout({ DB: {} as D1Database }, {
      fetchImpl,
      repository,
      sources: [{
        parser: 'amazon',
        retailerId: 'amazon-za',
        sourceKey: 'amazon-za::vouchers',
        url: 'https://www.amazon.co.za/coupons',
      }],
    })

    expect(written.map((batch) => batch.length)).toEqual([100, 100, 5])
    expect(written[0][0].externalId).toBe('PROMO000')
    expect(written[1][0].externalId).toBe('PROMO100')
    expect(written[2][0].externalId).toBe('PROMO200')
    expect(first.sources[0]).toMatchObject({ remaining: 105, status: 'partial', written: 100 })
    expect(second.sources[0]).toMatchObject({ remaining: 5, status: 'partial', written: 100 })
    expect(third.sources[0]).toMatchObject({ remaining: 0, status: 'success', written: 5 })
  })

  it('resets an old offset when the official response changes', async () => {
    const firstHtml = amazonVoucherHtml(150)
    const changedHtml = amazonVoucherHtml(3, 'NEW')
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(firstHtml))
      .mockResolvedValueOnce(new Response(changedHtml))
    const source = {
      parser: 'amazon' as const,
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
      url: 'https://www.amazon.co.za/coupons',
    }

    await runVoucherScout({ DB: {} as D1Database }, { fetchImpl, repository, sources: [source] })
    await runVoucherScout({ DB: {} as D1Database }, { fetchImpl, repository, sources: [source] })

    expect(written[1].map((voucher) => voucher.externalId)).toEqual([
      'NEW000',
      'NEW001',
      'NEW002',
    ])
  })

  it('resets an old offset when voucher content changes under the same identities', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(amazonVoucherHtml(150)))
      .mockResolvedValueOnce(new Response(amazonVoucherHtml(150, 'PROMO', 1_000)))
    const source = {
      parser: 'amazon' as const,
      retailerId: 'amazon-za',
      sourceKey: 'amazon-za::vouchers',
      url: 'https://www.amazon.co.za/coupons',
    }

    await runVoucherScout({ DB: {} as D1Database }, { fetchImpl, repository, sources: [source] })
    await runVoucherScout({ DB: {} as D1Database }, { fetchImpl, repository, sources: [source] })

    expect(written[1][0]).toMatchObject({
      benefitText: 'Save R1001',
      externalId: 'PROMO000',
    })
  })

  it('rejects a non-public source URL before making a request', async () => {
    const fetchImpl = vi.fn()

    const result = await runVoucherScout({ DB: {} as D1Database }, {
      fetchImpl,
      repository,
      sources: [{
        parser: 'public-code',
        retailerId: 'example-market',
        sourceKey: 'example-market::vouchers',
        url: 'http://127.0.0.1/private',
      }],
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.sources[0].status).toBe('failed')
  })

  it('records a failed source run and keeps previously active vouchers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('blocked', { status: 503 }))

    const result = await runVoucherScout({ DB: {} as D1Database }, {
      fetchImpl,
      repository,
      sources: [{
        parser: 'amazon',
        retailerId: 'amazon-za',
        sourceKey: 'amazon-za::vouchers',
        url: 'https://www.amazon.co.za/coupons',
      }],
    })

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      candidates: [],
      status: 'failed',
    }))
    expect(result.sources[0]).toMatchObject({ status: 'failed', written: 0 })
    expect(repository.expire).toHaveBeenCalledTimes(1)
  })

  it('rejects an oversized body before parsing it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x'.repeat(1_001)))

    const result = await runVoucherScout({ DB: {} as D1Database }, {
      fetchImpl,
      maxBodyBytes: 1_000,
      repository,
      sources: [{
        parser: 'public-code',
        retailerId: 'example-market',
        sourceKey: 'example-market::vouchers',
        url: 'https://example.co.za/vouchers',
      }],
    })

    expect(result.sources[0].status).toBe('failed')
    expect(written[0]).toEqual([])
  })

  it('scouts visible reusable codes from an official retailer source', async () => {
    const html = `
      <section data-voucher-id="winter" data-voucher-code="SAVE25">
        <h2>Winter voucher</h2>
        <p>Use promo code SAVE25 for R25 off.</p>
        <a href="/shop">Redeem</a>
      </section>
    `
    const result = await runVoucherScout({ DB: {} as D1Database }, {
      fetchImpl: vi.fn().mockResolvedValue(new Response(html)),
      repository,
      sources: [{
        parser: 'public-code',
        retailerId: 'example-market',
        sourceKey: 'example-market::vouchers',
        url: 'https://example.co.za/vouchers',
      }],
    })

    expect(result.sources[0]).toMatchObject({ status: 'success', written: 1 })
    expect(written[0][0]).toMatchObject({ code: 'SAVE25', publicReusable: true })
  })
})

function amazonVoucherHtml(count: number, prefix = 'PROMO', savingOffset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, '0')
    return `<script>{"asin":"ASIN${suffix}","title":"Product ${suffix}","link":"/item-${suffix}/dp/ASIN${suffix}","coupon":{"label":{"fragments":[{"text":"Save R${index + 1 + savingOffset}"}]},"id":"/promo/${prefix}${suffix}"}}</script>`
  }).join('\n')
}
