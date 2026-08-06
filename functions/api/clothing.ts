// The fitting room's rail: garments the clothing scout read from South
// African fashion storefronts, filtered the way the app filters them.

import type { TrolleyScoutEnv } from '../_shared/env'
import { listClothingItems, listClothingRetailers } from '../_shared/clothingStore'
import { json, methodNotAllowed } from '../_shared/respond'

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method)

  const params = new URL(request.url).searchParams
  const [items, retailers] = await Promise.all([
    listClothingItems(env, {
      audience: params.get('audience') ?? undefined,
      countryCode: params.get('country') ?? 'ZA',
      garmentType: params.get('type') ?? undefined,
      limit: numberParam(params.get('limit'), 60),
      offset: numberParam(params.get('offset'), 0),
      query: params.get('q') ?? undefined,
      retailerId: params.get('retailerId') ?? undefined,
      tryOnableOnly: params.get('tryOnable') === '1',
    }),
    listClothingRetailers(env, params.get('country') ?? 'ZA'),
  ])

  return json(
    {
      items,
      retailers,
    },
    {
      headers: {
        'access-control-allow-origin': '*',
        // A storefront's rail changes over days, not seconds.
        'cache-control': 'public, max-age=900, s-maxage=3600',
      },
    },
  )
}

function numberParam(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
