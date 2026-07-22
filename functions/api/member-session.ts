import type { MemberSessionDraft } from '../../src/types'
import {
  clearMemberCookie,
  deleteMemberSession,
  getMemberSession,
  logInMember,
  setMemberCookie,
  signUpMember,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'
import { detectRequestCountry } from '../_shared/countryContext'

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

    // "signup" creates the account with a password; "login" verifies one.
    const country = detectRequestCountry(request)
    const result =
      draft.intent === 'signup'
        ? await signUpMember(env, {
            country,
            displayName: draft.displayName ?? '',
            email: draft.email ?? '',
            password: draft.password ?? '',
          })
        : await logInMember(env, {
            country,
            email: draft.email ?? '',
            password: draft.password ?? '',
          })

    if (!('account' in result)) {
      return json(
        {
          issues: result.issues,
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
