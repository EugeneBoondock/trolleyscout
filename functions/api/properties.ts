// Properties Scout search. Household members, admins, and admin-granted members
// may search the SA property portals for homes to buy or rent. Access is checked
// server-side from the account row — never from the client.

import { getMemberSession } from '../_shared/memberStore'
import { searchProperties, type PropertySearchParams } from '../_shared/propertyScout'
import { json, methodNotAllowed } from '../_shared/respond'
import type { PropertyListingType } from '../../src/types'
import type { PropertySort } from '../../src/services/propertyPortals'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

const SORTS: PropertySort[] = ['relevance', 'price_low', 'price_high', 'beds']

function toInt(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function toFloat(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const session = await getMemberSession(env, request)

  if (!session.account) {
    return json(
      { error: 'Log in to use Properties Scout.', reason: 'auth' },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (!session.account.propertiesAccess) {
    return json(
      {
        error: 'Properties Scout is a Household-plan feature.',
        locked: true,
        reason: 'plan',
      },
      { headers: privateHeaders, status: 403 },
    )
  }

  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').trim()
  const lat = toFloat(url.searchParams.get('lat'))
  const lon = toFloat(url.searchParams.get('lon'))
  const hasCoords = lat !== undefined && lon !== undefined

  // Either a text query (>=2 chars) or a "near me" coordinate pair is required.
  if (!hasCoords && query.length < 2) {
    return json(
      { error: 'Enter a city, suburb, or area to search.' },
      { headers: privateHeaders, status: 400 },
    )
  }

  const listingType: PropertyListingType =
    url.searchParams.get('type') === 'rent' ? 'rent' : 'sale'
  const sortParam = url.searchParams.get('sort') as PropertySort | null
  const params: PropertySearchParams = {
    query,
    lat,
    lon,
    listingType,
    page: toInt(url.searchParams.get('page')) ?? 1,
    minPrice: toInt(url.searchParams.get('minPrice')),
    maxPrice: toInt(url.searchParams.get('maxPrice')),
    minBeds: toInt(url.searchParams.get('minBeds')),
    sort: sortParam && SORTS.includes(sortParam) ? sortParam : 'relevance',
  }

  const result = await searchProperties(env, params)

  return json(result, { headers: privateHeaders })
}
