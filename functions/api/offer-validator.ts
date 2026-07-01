import { validateOfferDraft } from '../../src/services/offerValidation'
import type { OfferDraft } from '../../src/types'
import { json, methodNotAllowed } from '../_shared/respond'

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method)
  }

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

  const result = validateOfferDraft(draft)
  const status = result.accepted ? 200 : 422

  return json(result, { status })
}
