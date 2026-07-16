import { describe, expect, it } from 'vitest'
import {
  createPayFastParameterString,
  createPayFastSignature,
  getPayFastEndpoints,
  resolvePayFastConfig,
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
      processUrl: 'https://sandbox.payfast.co.za/eng/process',
      validationUrl: 'https://sandbox.payfast.co.za/eng/query/validate',
    })
    expect(getPayFastEndpoints('live').onsiteUrl).toBe('https://www.payfast.co.za/onsite/process')
  })

  it('falls back to the public sandbox merchant when no creds are set', () => {
    const config = resolvePayFastConfig({})

    expect(config).toEqual({
      merchantId: '10000100',
      merchantKey: '46f0cd694581a',
      mode: 'sandbox',
      passphrase: 'jt7NOE43FZPn',
    })
  })

  // A terminal can capture the Ctrl+V keystroke (\x16) instead of the pasted
  // text, so a secret can hold one control character. Live mode must refuse
  // that rather than send shoppers to PayFast with a junk merchant id.
  it('refuses live credentials that are not plausible', () => {
    expect(
      resolvePayFastConfig({
        PAYFAST_MODE: 'live',
        PAYFAST_MERCHANT_ID: '\x16',
        PAYFAST_MERCHANT_KEY: '\x16',
      }),
    ).toBeUndefined()

    expect(
      resolvePayFastConfig({
        PAYFAST_MODE: 'live',
        PAYFAST_MERCHANT_ID: 'not-numeric',
        PAYFAST_MERCHANT_KEY: 'y0xyozwvmdwr1',
      }),
    ).toBeUndefined()
  })

  it('accepts and trims real live credentials', () => {
    expect(
      resolvePayFastConfig({
        PAYFAST_MODE: 'live',
        PAYFAST_MERCHANT_ID: ' 34909133 ',
        PAYFAST_MERCHANT_KEY: ' y0xyozwvmdwr1 ',
        PAYFAST_PASSPHRASE: ' secret-phrase ',
      }),
    ).toEqual({
      merchantId: '34909133',
      merchantKey: 'y0xyozwvmdwr1',
      mode: 'live',
      passphrase: 'secret-phrase',
    })
  })

  it('requires real credentials in live mode', () => {
    expect(resolvePayFastConfig({ PAYFAST_MODE: 'live' })).toBeUndefined()
    expect(
      resolvePayFastConfig({
        PAYFAST_MODE: 'live',
        PAYFAST_MERCHANT_ID: '10012345',
        PAYFAST_MERCHANT_KEY: 'abcdef123456',
      }),
    ).toMatchObject({ merchantId: '10012345', mode: 'live' })
  })
})
