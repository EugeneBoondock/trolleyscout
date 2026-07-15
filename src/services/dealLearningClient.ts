import type { DealActivityDraft, DealLearningState } from '../types'

interface DealLearningEnvelope {
  data: {
    learning: DealLearningState
    message?: string
  }
}

export function loadDealLearning(signal?: AbortSignal) {
  return requestDealLearning('/api/activity', { signal })
}

export function recordDealLearningActivity(
  activity: DealActivityDraft,
  signal?: AbortSignal,
) {
  return requestDealLearning('/api/activity', {
    body: JSON.stringify(activity),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal,
  })
}

export function setDealLearningEnabled(enabled: boolean, signal?: AbortSignal) {
  return requestDealLearning('/api/activity', {
    body: JSON.stringify({ enabled }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
    signal,
  })
}

export function clearDealLearningHistory(signal?: AbortSignal) {
  return requestDealLearning('/api/activity', {
    method: 'DELETE',
    signal,
  })
}

export function deleteDealLearningActivity(id: string, signal?: AbortSignal) {
  return requestDealLearning(`/api/activity?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal,
  })
}

async function requestDealLearning(path: string, init: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...init.headers,
    },
  })
  const envelope = (await response.json()) as DealLearningEnvelope

  if (!response.ok) {
    throw new Error(envelope.data.message ?? 'Deal learning could not be updated.')
  }

  return envelope.data.learning
}
