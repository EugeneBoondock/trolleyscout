import type { MemberSessionDraft } from '../../src/types'
import {
  clearMemberCookie,
  createMemberSession,
  deleteMemberSession,
  getMemberSession,
  setMemberCookie,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method === 'GET') {
    return json(
      {
        session: await getMemberSession(env, request),
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'POST') {
    let draft: MemberSessionDraft

    try {
      draft = (await request.json()) as MemberSessionDraft
    } catch {
      return json(
        {
          session: {
            isAuthenticated: false,
          },
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const result = await createMemberSession(env, draft)

    if (!result.account || !result.token) {
      return json(
        {
          issues: result.issues ?? ['Member session could not be started.'],
          session: {
            isAuthenticated: false,
          },
        },
        {
          headers: privateHeaders,
          status: 422,
        },
      )
    }

    return json(
      {
        session: {
          account: result.account,
          isAuthenticated: true,
        },
      },
      {
        headers: {
          ...privateHeaders,
          'set-cookie': setMemberCookie(result.token),
        },
      },
    )
  }

  if (request.method === 'DELETE') {
    await deleteMemberSession(env, request)

    return json(
      {
        session: {
          isAuthenticated: false,
        },
      },
      {
        headers: {
          ...privateHeaders,
          'set-cookie': clearMemberCookie(),
        },
      },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST, DELETE')
}
