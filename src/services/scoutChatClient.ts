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
      retrievalId?: string
    }
  }

  if (!response.ok || !payload.data?.answer) {
    throw new Error(payload.data?.error || 'Mr Scout could not answer right now.')
  }

  // The retrieval id ties a thumbs rating back to the search that produced
  // the answer, which is what makes relevance tunable.
  return { ...payload.data.answer, retrievalId: payload.data.retrievalId }
}

export async function rateScoutAnswer(
  retrievalId: string,
  feedback: 'down' | 'up',
): Promise<boolean> {
  try {
    const response = await fetch('/api/scout-feedback', {
      body: JSON.stringify({ feedback, retrievalId }),
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      method: 'POST',
    })
    return response.ok
  } catch {
    return false
  }
}
