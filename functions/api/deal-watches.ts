// Member deal watches. POST searches everything the platform knows first —
// only a genuine miss becomes a watch, exactly as a shopper would expect:
// "not on special anywhere yet, we'll keep looking and tell you."

import { findWatchMatches, isWatchQueryValid, normalizeWatchQuery } from '../../src/services/dealWatch'
import type { TrolleyScoutEnv } from '../_shared/env'
import {
  createDealWatch,
  deleteDealWatch,
  listDealWatches,
  loadWatchCorpus,
  markDealWatchSeen,
} from '../_shared/dealWatchStore'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const accountId = session.account?.id

  if (!accountId) {
    return json(
      { issues: ['Sign in to watch items for deal alerts.'], watches: [] },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (request.method === 'GET') {
    const watches = await listDealWatches(env, accountId)

    return json(
      {
        alertCount: watches.filter((watch) => watch.matchedAt && !watch.seenAt).length,
        watches,
      },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'POST') {
    let body: { query?: string }

    try {
      body = (await request.json()) as { query?: string }
    } catch {
      return json(
        { issues: ['Request body must be valid JSON.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    const queryText = (body.query ?? '').trim()
    const normalized = normalizeWatchQuery(queryText)

    if (!isWatchQueryValid(normalized)) {
      return json(
        { issues: ['Type the item you are looking for, like "peanut butter".'] },
        { headers: privateHeaders, status: 422 },
      )
    }

    // A deal that already exists is an answer, not a watch.
    const matches = findWatchMatches(normalized, await loadWatchCorpus(env))

    if (matches.length > 0) {
      return json(
        {
          matches,
          message: 'Good news: this item already has a deal.',
          watches: await listDealWatches(env, accountId),
        },
        { headers: privateHeaders },
      )
    }

    const created = await createDealWatch(env, accountId, queryText)

    if (!created.watch) {
      return json(
        { issues: [created.issue ?? 'Could not save the watch.'] },
        { headers: privateHeaders, status: 422 },
      )
    }

    return json(
      {
        matches: [],
        message: 'No deal yet. Trolley Scout is watching this item for you.',
        watch: created.watch,
        watches: await listDealWatches(env, accountId),
      },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'PATCH') {
    let body: { id?: string }

    try {
      body = (await request.json()) as { id?: string }
    } catch {
      return json(
        { issues: ['Request body must be valid JSON.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    const seen = body.id ? await markDealWatchSeen(env, accountId, body.id) : false

    return json(
      { seen, watches: await listDealWatches(env, accountId) },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id')?.trim() ?? ''
    const deleted = id ? await deleteDealWatch(env, accountId, id) : false

    return json(
      { deleted, watches: await listDealWatches(env, accountId) },
      { headers: privateHeaders },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST, PATCH, DELETE')
}
