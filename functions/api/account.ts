import {
  changeMemberPassword,
  getMemberSession,
  updateMemberProfile,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

interface AccountUpdateBody {
  action?: 'profile' | 'password'
  currentPassword?: string
  displayName?: string
  newPassword?: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const session = await getMemberSession(env, request)

  if (!session.account) {
    return json({ issues: ['Sign in first.'] }, { headers: privateHeaders, status: 401 })
  }

  let body: AccountUpdateBody

  try {
    body = (await request.json()) as AccountUpdateBody
  } catch {
    return json(
      { issues: ['Request body must be valid JSON.'] },
      { headers: privateHeaders, status: 400 },
    )
  }

  if (body.action === 'password') {
    const result = await changeMemberPassword(env, session.account.id, {
      currentPassword: body.currentPassword ?? '',
      newPassword: body.newPassword ?? '',
    })

    return json(
      result.changed ? { changed: true, message: 'Password updated.' } : { issues: result.issues },
      { headers: privateHeaders, status: result.changed ? 200 : 422 },
    )
  }

  const result = await updateMemberProfile(env, session.account.id, {
    displayName: body.displayName ?? '',
  })

  return json(
    result.account ? { account: result.account, message: 'Profile updated.' } : { issues: result.issues },
    { headers: privateHeaders, status: result.account ? 200 : 422 },
  )
}
