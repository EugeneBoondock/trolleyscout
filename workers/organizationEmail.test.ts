// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import worker from './organizationEmail'

describe('organization email worker', () => {
  it('sends an approved workspace email from the fixed access address', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'email-1' })
    const response = await worker.fetch(
      new Request('https://organization-email.internal/send', {
        body: JSON.stringify({
          html: '<p>Your workspace is ready.</p>',
          subject: 'Your Trolley Scout business workspace is ready',
          text: 'Your workspace is ready.',
          to: 'owner@example.co.za',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      { EMAIL: { send } as never },
    )

    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: {
          email: 'access@trolleyscout.co.za',
          name: 'Trolley Scout for Business',
        },
        to: 'owner@example.co.za',
      }),
    )
  })

  it('rejects public-style requests that do not match the private endpoint', async () => {
    const send = vi.fn()
    const response = await worker.fetch(
      new Request('https://organization-email.internal/', { method: 'GET' }),
      { EMAIL: { send } as never },
    )

    expect(response.status).toBe(404)
    expect(send).not.toHaveBeenCalled()
  })
})
