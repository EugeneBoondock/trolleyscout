// Member notification opt-ins. GET reads the current choice; PUT saves it. Kept
// deliberately small — today the only channel is "new deals".

import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import {
  getNotificationPreferences,
  setNotificationPreferences,
} from '../_shared/notificationStore'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const account = session.account

  if (!account) {
    return json(
      { issues: ['Sign in to manage your notifications.'], preferences: { newDeals: false } },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (request.method === 'GET') {
    return json(
      { preferences: await getNotificationPreferences(env, account.id) },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    let body: { newDeals?: unknown }

    try {
      body = (await request.json()) as { newDeals?: unknown }
    } catch {
      return json(
        { issues: ['Request body must be valid JSON.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    const preferences = await setNotificationPreferences(env, account.id, {
      newDeals: body.newDeals === true,
    })

    return json({ preferences }, { headers: privateHeaders })
  }

  return methodNotAllowed(request.method, 'GET, PUT')
}
