// Runs the clothing scout on demand and reports what it actually did. The
// cursor is returned so an admin pressing again continues through the
// registry instead of re-reading the same shops.

import { sweepClothingRetailers } from '../../_shared/clothingScout'
import { listClothingRetailers } from '../../_shared/clothingStore'
import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import { hasTrustedMutationOrigin } from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowed(request.method, 'POST')

  const session = await getMemberSession(env, request)
  if (session.account?.role !== 'admin') {
    return json({ issues: ['Admins only.'] }, { headers: privateHeaders, status: 403 })
  }
  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { issues: ['Request origin is not allowed.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  let body: { cursor?: number } = {}
  try {
    body = (await request.json()) as { cursor?: number }
  } catch {
    // A bare press with no body is the normal case.
  }

  const summary = await sweepClothingRetailers(env, { cursor: body.cursor })
  const retailers = await listClothingRetailers(env)
  const total = retailers.reduce((sum, retailer) => sum + retailer.count, 0)

  return json(
    {
      message: summary.productsSaved > 0
        ? `${summary.storesSwept} shops swept, ${summary.productsSaved} garments shelved.`
        : `${summary.storesSwept} shops swept, nothing new to shelve.`,
      retailerCount: retailers.length,
      summary,
      totalGarments: total,
    },
    { headers: privateHeaders },
  )
}
