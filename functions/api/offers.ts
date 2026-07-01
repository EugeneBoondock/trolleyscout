import { getStaticOffersPayload } from '../../src/api/staticData'
import type { OfferDraft } from '../../src/types'
import {
  buildStoredSummary,
  deleteStoredOffer,
  hasOfferStore,
  listStoredOffers,
  saveOfferDraft,
} from '../_shared/offerStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method === 'GET') {
    if (!hasOfferStore(env)) {
      return json(getStaticOffersPayload())
    }

    return json({
      offers: await listStoredOffers(env),
      summary: await buildStoredSummary(env),
    })
  }

  if (request.method === 'POST') {
    let draft: OfferDraft

    try {
      draft = (await request.json()) as OfferDraft
    } catch {
      return json(
        {
          accepted: false,
          issues: [
            {
              field: 'source',
              message: 'Request body must be valid JSON.',
              severity: 'error',
            },
          ],
        },
        { status: 400 },
      )
    }

    const saveResult = await saveOfferDraft(env, draft)

    if (!saveResult.storageReady) {
      return json(
        {
          accepted: false,
          issues: [
            {
              field: 'source',
              message: 'Offer storage is not configured.',
              severity: 'error',
            },
          ],
        },
        { status: 503 },
      )
    }

    if (!saveResult.result.accepted || !saveResult.result.normalizedOffer) {
      return json(saveResult.result, { status: 422 })
    }

    return json({
      offer: saveResult.result.normalizedOffer,
      saved: saveResult.saved,
      summary: await buildStoredSummary(env),
    })
  }

  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id')?.trim()

    if (!id) {
      return json(
        {
          deleted: false,
          id: '',
          summary: await buildStoredSummary(env),
        },
        { status: 400 },
      )
    }

    const deleted = await deleteStoredOffer(env, id)

    return json({
      deleted,
      id,
      summary: await buildStoredSummary(env),
    })
  }

  return methodNotAllowed(request.method, 'GET, POST, DELETE')
}
