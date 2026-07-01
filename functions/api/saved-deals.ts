import type { SavedDealDraft } from '../../src/types'
import {
  deleteMemberDeal,
  getMemberSession,
  listSavedDeals,
  saveMemberDeal,
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
        savedDeals: await listSavedDeals(env, accountId),
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'POST') {
    let draft: SavedDealDraft

    try {
      draft = (await request.json()) as SavedDealDraft
    } catch {
      return json(
        {
          issues: ['Request body must be valid JSON.'],
          savedDeals: await listSavedDeals(env, accountId),
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const result = await saveMemberDeal(env, accountId, draft)
    const savedDeals = await listSavedDeals(env, accountId)

    if (!result.savedDeal) {
      return json(
        {
          issues: result.issues ?? ['Deal could not be saved.'],
          savedDeals,
        },
        {
          headers: privateHeaders,
          status: 422,
        },
      )
    }

    return json(
      {
        savedDeal: result.savedDeal,
        savedDeals,
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
          savedDeals: await listSavedDeals(env, accountId),
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const deleted = await deleteMemberDeal(env, accountId, id)

    return json(
      {
        deleted,
        id,
        savedDeals: await listSavedDeals(env, accountId),
      },
      {
        headers: privateHeaders,
      },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST, DELETE')
}
