import { getStaticRetailersPayload } from '../../src/api/staticData'
import { filterRetailers } from '../../src/services/sourceEngine'
import type { SourceKind } from '../../src/types'
import { json, methodNotAllowed } from '../_shared/respond'

const sourceKinds: Array<SourceKind | 'all'> = ['all', 'app', 'loyalty', 'specials', 'store-finder']

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const url = new URL(request.url)
  const query = url.searchParams.get('q') ?? ''
  const kindParam = url.searchParams.get('kind') ?? 'all'
  const sourceKind = sourceKinds.includes(kindParam as SourceKind | 'all')
    ? (kindParam as SourceKind | 'all')
    : 'all'
  const payload = getStaticRetailersPayload()

  return json({
    retailers: filterRetailers(payload.retailers, { query, sourceKind }),
    summary: payload.summary,
  })
}
