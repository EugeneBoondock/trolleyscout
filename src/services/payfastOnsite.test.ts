import { afterEach, describe, expect, it, vi } from 'vitest'
import { openPayFastOnsite } from './payfastOnsite'

describe('openPayFastOnsite', () => {
  afterEach(() => {
    delete window.payfast_do_onsite_payment
    document.querySelectorAll('script[data-payfast-onsite-engine]').forEach((script) => script.remove())
  })

  it('resolves completed when the PayFast callback returns true', async () => {
    window.payfast_do_onsite_payment = vi.fn((options, callback) => {
      expect(options).toEqual({ uuid: 'onsite-test' })
      callback(true)
    })

    await expect(
      openPayFastOnsite({
        engineUrl: 'https://sandbox.payfast.co.za/onsite/engine.js',
        onsiteUuid: 'onsite-test',
      }),
    ).resolves.toBe('completed')
  })

  it('resolves closed when the customer closes the PayFast window', async () => {
    window.payfast_do_onsite_payment = vi.fn((_options, callback) => callback(false))

    await expect(
      openPayFastOnsite({
        engineUrl: 'https://www.payfast.co.za/onsite/engine.js',
        onsiteUuid: 'onsite-test',
      }),
    ).resolves.toBe('closed')
  })

  it('loads the requested engine once before opening the modal', async () => {
    const paymentPromise = openPayFastOnsite({
      engineUrl: 'https://sandbox.payfast.co.za/onsite/engine.js',
      onsiteUuid: 'onsite-test',
    })
    const script = document.querySelector<HTMLScriptElement>('script[data-payfast-onsite-engine]')

    expect(script?.src).toBe('https://sandbox.payfast.co.za/onsite/engine.js')
    window.payfast_do_onsite_payment = vi.fn((_options, callback) => callback(true))
    script?.dispatchEvent(new Event('load'))

    await expect(paymentPromise).resolves.toBe('completed')
    expect(document.querySelectorAll('script[data-payfast-onsite-engine]')).toHaveLength(1)
  })
})
