import type { SavedSourceDraft } from '../../src/types'
import {
  deleteMemberSource,
  getMemberSession,
  listSavedSources,
  saveMemberSource,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const accountId = session.account?.id

  if (request.method === 'GET') {
    return json(
      {
        savedSources: await listSavedSources(env, accountId),
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'POST') {
    let draft: SavedSourceDraft

    try {
      draft = (await request.json()) as SavedSourceDraft
    } catch {
      return json(
        {
          issues: ['Request body must be valid JSON.'],
          savedSources: await listSavedSources(env, accountId),
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const result = await saveMemberSource(env, accountId, draft)
    const savedSources = await listSavedSources(env, accountId)

    if (!result.savedSource) {
      return json(
        {
          issues: result.issues ?? ['Source could not be saved.'],
          savedSources,
        },
        {
          headers: privateHeaders,
          status: 422,
        },
      )
    }

    return json(
      {
        savedSource: result.savedSource,
        savedSources,
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id')?.trim()

    if (!id) {
      return json(
        {
          deleted: false,
          id: '',
          savedSources: await listSavedSources(env, accountId),
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const deleted = await deleteMemberSource(env, accountId, id)

    return json(
      {
        deleted,
        id,
        savedSources: await listSavedSources(env, accountId),
      },
      {
        headers: privateHeaders,
      },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST, DELETE')
}
