import { describe, expect, it } from 'vitest'
import { createStripeWebhookSignature, verifyStripeWebhookSignature } from './stripeWebhook'

describe('stripeWebhook', () => {
  it('accepts a matching Stripe signature', async () => {
    const payload = '{"id":"evt_test","type":"checkout.session.completed"}'
    const secret = 'whsec_test_secret'
    const timestamp = 1782939000
    const signature = await createStripeWebhookSignature({
      payload,
      secret,
      timestamp,
    })

    await expect(
      verifyStripeWebhookSignature({
        header: `t=${timestamp},v1=${signature}`,
        nowSeconds: timestamp + 10,
        payload,
        secret,
      }),
    ).resolves.toBe(true)
  })

  it('rejects a mismatched Stripe signature', async () => {
    await expect(
      verifyStripeWebhookSignature({
        header: 't=1782939000,v1=bad',
        nowSeconds: 1782939000,
        payload: '{"id":"evt_test"}',
        secret: 'whsec_test_secret',
      }),
    ).resolves.toBe(false)
  })

  it('rejects a stale Stripe signature', async () => {
    const payload = '{"id":"evt_test"}'
    const secret = 'whsec_test_secret'
    const timestamp = 1782939000
    const signature = await createStripeWebhookSignature({
      payload,
      secret,
      timestamp,
    })

    await expect(
      verifyStripeWebhookSignature({
        header: `t=${timestamp},v1=${signature}`,
        nowSeconds: timestamp + 1000,
        payload,
        secret,
      }),
    ).resolves.toBe(false)
  })
})
