import { describe, expect, it } from 'vitest'
import {
  createPayFastParameterString,
  createPayFastSignature,
  getPayFastEndpoints,
  verifyPayFastSignature,
} from './payfast'

describe('payfast', () => {
  it('encodes payment fields in insertion order using PayFast form rules', () => {
    const fields = new URLSearchParams()
    fields.append('merchant_id', '10000100')
    fields.append('item_name', ' Scout monthly ')
    fields.append('amount', '29.00')

    expect(createPayFastParameterString(fields, 'test phrase')).toBe(
      'merchant_id=10000100&item_name=Scout+monthly&amount=29.00&passphrase=test+phrase',
    )
  })

  it('creates the documented lowercase MD5 payment signature', () => {
    const fields = new URLSearchParams()
    fields.append('merchant_id', '10000100')
    fields.append('item_name', 'Scout monthly')
    fields.append('amount', '29.00')

    expect(createPayFastSignature(fields, 'test phrase')).toBe('954af0b739b01a4648e9d4e524fb9713')
  })

  it('verifies an ITN signature without signing the signature field itself', () => {
    const fields = new URLSearchParams()
    fields.append('m_payment_id', 'billing-test')
    fields.append('payment_status', 'COMPLETE')
    fields.append('amount_gross', '59.00')
    fields.append('signature', createPayFastSignature(fields, 'secret phrase'))

    expect(verifyPayFastSignature(fields, 'secret phrase')).toBe(true)
    fields.set('amount_gross', '29.00')
    expect(verifyPayFastSignature(fields, 'secret phrase')).toBe(false)
  })

  it('selects matching sandbox and live Onsite endpoints', () => {
    expect(getPayFastEndpoints('sandbox')).toEqual({
      engineUrl: 'https://sandbox.payfast.co.za/onsite/engine.js',
      onsiteUrl: 'https://sandbox.payfast.co.za/onsite/process',
      validationUrl: 'https://sandbox.payfast.co.za/eng/query/validate',
    })
    expect(getPayFastEndpoints('live').onsiteUrl).toBe('https://www.payfast.co.za/onsite/process')
  })
})
