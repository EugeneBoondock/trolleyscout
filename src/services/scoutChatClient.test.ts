import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendScoutChatMessage } from './scoutChatClient'

afterEach(() => vi.unstubAllGlobals())

describe('sendScoutChatMessage', () => {
  it('posts bounded conversation history and reads the structured answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        answer: {
          reply: 'Try this coffee deal.',
          deals: [],
          catalogues: [],
          followUps: [],
        },
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const answer = await sendScoutChatMessage('Find coffee', [
      { role: 'assistant', text: 'What type?' },
    ])

    expect(answer.reply).toBe('Try this coffee deal.')
    expect(fetchMock).toHaveBeenCalledWith('/api/scout-chat', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        message: 'Find coffee',
        history: [{ role: 'assistant', text: 'What type?' }],
      }),
    }))
  })

  it('surfaces the server message on an unsuccessful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { error: 'Mr Scout is busy.' },
    }), { status: 429 })))

    await expect(sendScoutChatMessage('Hello', [])).rejects.toThrow('Mr Scout is busy.')
  })
})
