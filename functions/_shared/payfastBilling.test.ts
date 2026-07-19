import { describe, expect, it, vi } from 'vitest'
import { getPlanBillingOption } from '../../src/data/memberPlans'
import { createPayFastSignature, verifyPayFastSignature } from './payfast'
import {
  confirmPayFastItn,
  createPayFastCheckoutFields,
  requestPayFastOnsitePayment,
  validatePayFastItn,
} from './payfastBilling'

describe('payfastBilling', () => {
  it('builds a signed recurring Onsite request from the trusted plan option', () => {
    const option = getPlanBillingOption('scout', 'monthly')

    if (!option) {
      throw new Error('Expected Scout billing option')
    }

    const fields = createPayFastCheckoutFields({
      account: {
        displayName: 'Sam Shopper',
        email: 'sam@example.com',
        id: 'member-test',
      },
      attemptId: 'billing-test',
      cancelUrl: 'https://trolleyscout.co.za/Subscription?payfast=cancelled',
      merchantId: '10000100',
      merchantKey: 'merchant-key',
      notifyUrl: 'https://trolleyscout.co.za/api/payfast-itn',
      option,
      passphrase: 'secret phrase',
      returnUrl: 'https://trolleyscout.co.za/Subscription?payfast=success',
    })

    expect(Object.fromEntries(fields)).toMatchObject({
      amount: '29.00',
      cancel_url: 'https://trolleyscout.co.za/Subscription?payfast=cancelled',
      custom_str1: 'member-test',
      custom_str2: 'scout',
      custom_str3: 'monthly',
      cycles: '0',
      email_address: 'sam@example.com',
      frequency: '3',
      item_name: 'Trolley Scout Scout monthly',
      m_payment_id: 'billing-test',
      merchant_id: '10000100',
      merchant_key: 'merchant-key',
      notify_url: 'https://trolleyscout.co.za/api/payfast-itn',
      recurring_amount: '29.00',
      return_url: 'https://trolleyscout.co.za/Subscription?payfast=success',
      subscription_type: '1',
    })
    expect(verifyPayFastSignature(fields, 'secret phrase')).toBe(true)
  })

  it('requests a sandbox Onsite UUID using form encoding', async () => {
    const fields = new URLSearchParams({ amount: '29.00', signature: 'signature-test' })
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ uuid: 'onsite-test' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )

    await expect(requestPayFastOnsitePayment(fields, 'sandbox', fetcher)).resolves.toBe('onsite-test')
    expect(fetcher).toHaveBeenCalledWith(
      'https://sandbox.payfast.co.za/onsite/process',
      expect.objectContaining({
        body: fields,
        method: 'POST',
      }),
    )
  })

  it('accepts a signed completed ITN that matches the stored attempt', () => {
    const fields = new URLSearchParams()
    fields.append('m_payment_id', 'billing-test')
    fields.append('pf_payment_id', 'pf-test')
    fields.append('payment_status', 'COMPLETE')
    fields.append('item_name', 'Trolley Scout Scout monthly')
    fields.append('amount_gross', '29.00')
    fields.append('custom_str1', 'member-test')
    fields.append('custom_str2', 'scout')
    fields.append('custom_str3', 'monthly')
    fields.append('merchant_id', '10000100')
    fields.append('token', 'subscription-test')
    fields.append('signature', createPayFastSignature(fields, 'secret phrase'))

    expect(
      validatePayFastItn(fields, {
        amountCents: 2900,
        attemptId: 'billing-test',
        merchantId: '10000100',
        passphrase: 'secret phrase',
      }),
    ).toEqual({
      amountCents: 2900,
      paymentId: 'pf-test',
      status: 'COMPLETE',
      token: 'subscription-test',
      valid: true,
    })
  })

  it('rejects a signed ITN whose amount differs from the stored attempt', () => {
    const fields = new URLSearchParams()
    fields.append('m_payment_id', 'billing-test')
    fields.append('pf_payment_id', 'pf-test')
    fields.append('payment_status', 'COMPLETE')
    fields.append('amount_gross', '59.00')
    fields.append('merchant_id', '10000100')
    fields.append('signature', createPayFastSignature(fields, 'secret phrase'))

    expect(
      validatePayFastItn(fields, {
        amountCents: 2900,
        attemptId: 'billing-test',
        merchantId: '10000100',
        passphrase: 'secret phrase',
      }),
    ).toEqual({ issue: 'Payment amount does not match.', valid: false })
  })

  it('confirms an ITN against the matching PayFast validation endpoint', async () => {
    const fields = new URLSearchParams()
    fields.append('m_payment_id', 'billing-test')
    fields.append('payment_status', 'COMPLETE')
    fields.append('signature', 'signature-test')
    const fetcher = vi.fn().mockResolvedValue(new Response('VALID', { status: 200 }))

    await expect(confirmPayFastItn(fields, 'live', fetcher)).resolves.toBe(true)
    expect(fetcher).toHaveBeenCalledWith(
      'https://www.payfast.co.za/eng/query/validate',
      expect.objectContaining({
        body: 'm_payment_id=billing-test&payment_status=COMPLETE',
        method: 'POST',
      }),
    )
  })
})
