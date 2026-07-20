import { describe, expect, test } from 'vitest'
import { resolvePayFastNotifyUrl } from './payfastNotifyUrl'

const origin = 'https://trolleyscout.co.za'

describe('resolvePayFastNotifyUrl', () => {
  test('notifies our own origin when no override is configured', () => {
    expect(resolvePayFastNotifyUrl({}, origin, '/api/payfast-itn')).toBe(
      'https://trolleyscout.co.za/api/payfast-itn',
    )
  })

  test('keeps subscription and ad notifications on separate endpoints', () => {
    const subscription = resolvePayFastNotifyUrl({}, origin, '/api/payfast-itn')
    const ad = resolvePayFastNotifyUrl({}, origin, '/api/payfast-ad-itn')

    expect(subscription).not.toBe(ad)
  })

  test('routes through a configured gateway host while keeping each path', () => {
    const env = { PAYFAST_NOTIFY_ORIGIN: 'https://www.boondocklabs.co.za' }

    expect(resolvePayFastNotifyUrl(env, origin, '/api/payfast-itn')).toBe(
      'https://www.boondocklabs.co.za/api/payfast-itn',
    )
    expect(resolvePayFastNotifyUrl(env, origin, '/api/payfast-ad-itn')).toBe(
      'https://www.boondocklabs.co.za/api/payfast-ad-itn',
    )
  })

  // A gateway URL is often pasted in with the path still attached. Honouring
  // that path would send both flows to one endpoint, which is the failure this
  // helper exists to prevent.
  test('discards a path on the override and keeps the purpose-specific one', () => {
    const env = { PAYFAST_NOTIFY_ORIGIN: 'https://www.boondocklabs.co.za/api/payfast/notify' }

    expect(resolvePayFastNotifyUrl(env, origin, '/api/payfast-itn')).toBe(
      'https://www.boondocklabs.co.za/api/payfast-itn',
    )
  })

  test('falls back to our own origin when the override is not a usable URL', () => {
    const env = { PAYFAST_NOTIFY_ORIGIN: 'notify.example.com' }

    expect(resolvePayFastNotifyUrl(env, origin, '/api/payfast-itn')).toBe(
      'https://trolleyscout.co.za/api/payfast-itn',
    )
  })

  test('ignores a blank override', () => {
    const env = { PAYFAST_NOTIFY_ORIGIN: '   ' }

    expect(resolvePayFastNotifyUrl(env, origin, '/api/payfast-itn')).toBe(
      'https://trolleyscout.co.za/api/payfast-itn',
    )
  })
})
