import { describe, expect, it, vi } from 'vitest'

import { callerIp, turnstileAllows, verifyTurnstile } from './turnstile'
import type { TrolleyScoutEnv } from './env'

const configured = { TURNSTILE_SECRET_KEY: 'secret' } as TrolleyScoutEnv

function respondWith(body: unknown, ok = true) {
  return vi.fn(async () =>
    ({ json: async () => body, ok }) as unknown as Response,
  )
}

describe('turnstile', () => {
  it('passes a token Cloudflare accepts', async () => {
    const fetcher = respondWith({ success: true })

    const result = await verifyTurnstile(configured, 'token', { fetcher })

    expect(result).toBe('passed')
    expect(turnstileAllows(result)).toBe(true)
  })

  it('turns away a token Cloudflare rejects', async () => {
    const result = await verifyTurnstile(configured, 'forged', {
      fetcher: respondWith({ success: false }),
    })

    expect(result).toBe('failed')
    expect(turnstileAllows(result)).toBe(false)
  })

  it('turns away an empty token when protection is switched on', async () => {
    expect(await verifyTurnstile(configured, '')).toBe('failed')
    expect(await verifyTurnstile(configured, undefined)).toBe('failed')
  })

  it('lets everyone through when no secret is configured', async () => {
    // Absent configuration means absent protection, not a closed door.
    // Locking every visitor out over an unset secret is the worse failure.
    const result = await verifyTurnstile({} as TrolleyScoutEnv, 'anything')

    expect(result).toBe('not-configured')
    expect(turnstileAllows(result)).toBe(true)
  })

  it('does not take the form down when Cloudflare is unreachable', async () => {
    const result = await verifyTurnstile(configured, 'token', {
      fetcher: vi.fn(async () => {
        throw new Error('network down')
      }),
    })

    expect(turnstileAllows(result)).toBe(true)
  })

  it('sends the caller IP Cloudflare puts on the request', async () => {
    const fetcher = respondWith({ success: true })
    const request = new Request('https://trolleyscout.co.za/api/support', {
      headers: { 'cf-connecting-ip': '196.25.1.1' },
      method: 'POST',
    })

    expect(callerIp(request)).toBe('196.25.1.1')
    await verifyTurnstile(configured, 'token', {
      fetcher,
      remoteIp: callerIp(request),
    })
    const body = fetcher.mock.calls[0][1]?.body as FormData
    expect(body.get('remoteip')).toBe('196.25.1.1')
  })
})
