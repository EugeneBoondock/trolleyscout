import { describe, expect, it, vi } from 'vitest'
import { createPayFastSignature, verifyPayFastSignature } from './payfast'
import {
  createPayFastAdCheckoutFields,
  requestPayFastAdOnsitePayment,
  validatePayFastAdItn,
} from './payfastAds'

describe('payfastAds', () => {
  it('builds a signed once-off checkout with no subscription fields', () => {
    const fields = createPayFastAdCheckoutFields({
      account: { displayName: 'Sam Store', email: 'sam@shop.co.za', id: 'member-test' },
      adId: 'ad-test',
      amountCents: 15_000,
      itemName: 'Trolley Scout ad: Fresh bread daily',
      merchantId: '10000100',
      merchantKey: 'merchant-key',
      notifyUrl: 'https://trolleyscout.co.za/api/payfast-ad-itn',
      passphrase: 'secret phrase',
    })

    const entries = Object.fromEntries(fields)
    expect(entries).toMatchObject({
      amount: '150.00',
      custom_str1: 'member-test',
      custom_str2: 'ad-test',
      email_address: 'sam@shop.co.za',
      item_name: 'Trolley Scout ad: Fresh bread daily',
      m_payment_id: 'ad-test',
      merchant_id: '10000100',
      notify_url: 'https://trolleyscout.co.za/api/payfast-ad-itn',
    })
    // A one-off payment carries none of the recurring subscription fields.
    expect(fields.has('subscription_type')).toBe(false)
    expect(fields.has('recurring_amount')).toBe(false)
    expect(fields.has('frequency')).toBe(false)
    expect(verifyPayFastSignature(fields, 'secret phrase')).toBe(true)
  })

  it('accepts a signed completed ad ITN with no token required', () => {
    const fields = new URLSearchParams()
    fields.append('m_payment_id', 'ad-test')
    fields.append('pf_payment_id', 'pf-ad-1')
    fields.append('payment_status', 'COMPLETE')
    fields.append('amount_gross', '150.00')
    fields.append('merchant_id', '10000100')
    fields.append('signature', createPayFastSignature(fields, 'secret phrase'))

    expect(
      validatePayFastAdItn(fields, {
        adId: 'ad-test',
        amountCents: 15_000,
        merchantId: '10000100',
        passphrase: 'secret phrase',
      }),
    ).toEqual({
      amountCents: 15_000,
      paymentId: 'pf-ad-1',
      status: 'COMPLETE',
      valid: true,
    })
  })

  it('rejects an ad ITN whose amount differs from the stored ad', () => {
    const fields = new URLSearchParams()
    fields.append('m_payment_id', 'ad-test')
    fields.append('pf_payment_id', 'pf-ad-1')
    fields.append('payment_status', 'COMPLETE')
    fields.append('amount_gross', '999.00')
    fields.append('merchant_id', '10000100')
    fields.append('signature', createPayFastSignature(fields, 'secret phrase'))

    expect(
      validatePayFastAdItn(fields, {
        adId: 'ad-test',
        amountCents: 15_000,
        merchantId: '10000100',
        passphrase: 'secret phrase',
      }),
    ).toEqual({ issue: 'Payment amount does not match.', valid: false })
  })

  it('rejects an ad ITN for a different ad reference', () => {
    const fields = new URLSearchParams()
    fields.append('m_payment_id', 'ad-other')
    fields.append('pf_payment_id', 'pf-ad-1')
    fields.append('payment_status', 'COMPLETE')
    fields.append('amount_gross', '150.00')
    fields.append('merchant_id', '10000100')
    fields.append('signature', createPayFastSignature(fields, 'secret phrase'))

    expect(
      validatePayFastAdItn(fields, {
        adId: 'ad-test',
        amountCents: 15_000,
        merchantId: '10000100',
        passphrase: 'secret phrase',
      }),
    ).toEqual({ issue: 'Payment reference does not match.', valid: false })
  })

  it('requests a sandbox Onsite UUID for an ad', async () => {
    const fields = new URLSearchParams({ amount: '150.00', signature: 'sig' })
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ uuid: 'onsite-ad' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )

    await expect(requestPayFastAdOnsitePayment(fields, 'sandbox', fetcher)).resolves.toBe('onsite-ad')
    expect(fetcher).toHaveBeenCalledWith(
      'https://sandbox.payfast.co.za/onsite/process',
      expect.objectContaining({ body: fields, method: 'POST' }),
    )
  })
})
