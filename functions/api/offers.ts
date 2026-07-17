import { getStaticOffersPayload } from '../../src/api/staticData'
import { extractPageImage } from '../../src/services/pageImage'
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

    // Scanner entries rarely include a picture, so pull the product image
    // straight from the offer's own source page (og:image) before saving.
    if (!draft.imageUrl && typeof draft.sourceUrl === 'string') {
      draft = { ...draft, imageUrl: await fetchSourcePageImage(draft.sourceUrl) }
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

async function fetchSourcePageImage(sourceUrl: string): Promise<string | undefined> {
  try {
    const url = new URL(sourceUrl)

    if (url.protocol !== 'https:') {
      return undefined
    }

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'text/html',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      return undefined
    }

    // og:image lives in <head>; the first chunk of the page is enough.
    const html = (await response.text()).slice(0, 300_000)
    return extractPageImage(html, url.toString())
  } catch {
    return undefined
  }
}
