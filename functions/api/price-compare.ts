import { getStaticRetailersPayload } from '../../src/api/staticData'
import type { Retailer } from '../../src/types'
import { countryFromCode } from '../_shared/countryContext'
import { getCountryRetailers } from '../_shared/countryRetailerScout'
import { readDealSnapshots } from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import {
  applyPromotionFallbackPrices,
  buildProductComparison,
  normalizeProductSearchInput,
  searchRetailerProduct,
} from '../_shared/productPriceSearch'
import { json, methodNotAllowed } from '../_shared/respond'
import { searchWeb } from '../_shared/searchWeb'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const session = await getMemberSession(env, request)
  if (!session.account) {
    return json(
      { error: 'Log in to compare live store prices.' },
      { headers: privateHeaders, status: 401 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(
      { error: 'Request body must be valid JSON.' },
      { headers: privateHeaders, status: 400 },
    )
  }

  let input: ReturnType<typeof normalizeProductSearchInput>
  try {
    input = normalizeProductSearchInput(body)
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Product search input is invalid.' },
      { headers: privateHeaders, status: 422 },
    )
  }

  const country = countryFromCode(session.account.countryCode)
  const directory = country.code === 'ZA'
    ? getStaticRetailersPayload().retailers
    : await getCountryRetailers(env, country)
  const selected = selectedRetailers(directory, input.retailerIds)

  if (selected.length < 2) {
    return json(
      { error: 'Pick at least two stores available in your country.' },
      { headers: privateHeaders, status: 422 },
    )
  }

  const searchedMatches = await Promise.all(selected.map((retailer) => searchRetailerProduct(
    retailer,
    input.query,
    {
      currencyCode: country.currencyCode,
      searcher: (query) => searchWeb(query, env.JINA_API_KEY),
    },
  )))
  const snapshots = await readDealSnapshots(env)
  const matches = applyPromotionFallbackPrices(
    searchedMatches,
    input.query,
    country.currencyCode,
    [...snapshots.values()].flatMap((snapshot) => snapshot.deals),
  )

  return json(
    buildProductComparison(country, input.query, matches),
    { headers: privateHeaders },
  )
}

function selectedRetailers(directory: Retailer[], retailerIds: string[]): Retailer[] {
  const byId = new Map(directory.map((retailer) => [retailer.id, retailer]))
  return retailerIds
    .map((id) => byId.get(id))
    .filter((retailer): retailer is Retailer => Boolean(retailer))
}
