import type { DealActivityDraft } from '../../src/types'
import {
  clearDealLearning,
  deleteDealLearningActivity,
  getDealLearningState,
  recordDealActivity,
  setDealLearningEnabled,
} from '../_shared/dealLearningStore'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)

  if (!session.account) {
    return json(
      { learning: { activities: [], enabled: false }, message: 'Sign in to use deal learning.' },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (request.method === 'GET') {
    return json(
      { learning: await getDealLearningState(env, session.account.id) },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'POST') {
    let body: DealActivityDraft

    try {
      body = (await request.json()) as DealActivityDraft
    } catch {
      return json(
        { learning: await getDealLearningState(env, session.account.id), message: 'Activity must be valid JSON.' },
        { headers: privateHeaders, status: 400 },
      )
    }

    const result = await recordDealActivity(env, session.account.id, body)
    const issue = 'issues' in result ? result.issues?.[0] : undefined
    return json(
      {
        learning: 'state' in result ? result.state : await getDealLearningState(env, session.account.id),
        message: issue ?? 'Deal learning updated.',
      },
      { headers: privateHeaders, status: issue ? 400 : 200 },
    )
  }

  if (request.method === 'PATCH') {
    let body: { enabled?: unknown }

    try {
      body = (await request.json()) as { enabled?: unknown }
    } catch {
      body = {}
    }

    if (typeof body.enabled !== 'boolean') {
      return json(
        { learning: await getDealLearningState(env, session.account.id), message: 'Choose whether deal learning is enabled.' },
        { headers: privateHeaders, status: 400 },
      )
    }

    const result = await setDealLearningEnabled(env, session.account.id, body.enabled)
    return json(
      {
        learning: 'state' in result ? result.state : await getDealLearningState(env, session.account.id),
        message: body.enabled ? 'Deal learning enabled.' : 'Deal learning paused.',
      },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'DELETE') {
    const activityId = new URL(request.url).searchParams.get('id')
    const learning = activityId
      ? await deleteDealLearningActivity(env, session.account.id, activityId)
      : await clearDealLearning(env, session.account.id)

    return json(
      { learning, message: activityId ? 'Learning activity removed.' : 'Learning history cleared.' },
      { headers: privateHeaders },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST, PATCH, DELETE')
}
