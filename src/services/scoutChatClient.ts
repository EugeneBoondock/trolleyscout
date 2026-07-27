import type { ScoutChatAnswer, ScoutChatTurn } from '../types'

export async function sendScoutChatMessage(
  message: string,
  history: ScoutChatTurn[],
  signal?: AbortSignal,
): Promise<ScoutChatAnswer> {
  const response = await fetch('/api/scout-chat', {
    body: JSON.stringify({ message, history }),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    method: 'POST',
    signal,
  })
  const payload = await response.json() as {
    data?: {
      answer?: ScoutChatAnswer
      error?: string
    }
  }

  if (!response.ok || !payload.data?.answer) {
    throw new Error(payload.data?.error || 'Mr Scout could not answer right now.')
  }

  return payload.data.answer
}
