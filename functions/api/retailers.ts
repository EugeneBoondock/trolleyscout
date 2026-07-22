import { getStaticRetailersPayload } from '../../src/api/staticData'
import { filterRetailers } from '../../src/services/sourceEngine'
import { retailerLogoUrl } from '../../src/services/storeLogos'
import type { Retailer, SourceKind } from '../../src/types'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'
import { countryFromCode, detectRequestCountry } from '../_shared/countryContext'
import { countryRetailerSummary, getCountryRetailers } from '../_shared/countryRetailerScout'
import { getMemberSession } from '../_shared/memberStore'

const sourceKinds: Array<SourceKind | 'all'> = ['all', 'app', 'loyalty', 'specials', 'store-finder']

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const url = new URL(request.url)
  const query = url.searchParams.get('q') ?? ''
  const kindParam = url.searchParams.get('kind') ?? 'all'
  const sourceKind = sourceKinds.includes(kindParam as SourceKind | 'all')
    ? (kindParam as SourceKind | 'all')
    : 'all'
  const session = await getMemberSession(env, request)
  const detected = detectRequestCountry(request)
  const country = countryFromCode(session.account?.countryCode ?? detected.code)
  const payload = country.code === 'ZA'
    ? getStaticRetailersPayload()
    : await internationalPayload(env, country)

  return json({
    country,
    retailers: addRetailerLogos(filterRetailers(payload.retailers, { query, sourceKind })),
    summary: payload.summary,
  })
}

async function internationalPayload(
  env: TrolleyScoutEnv,
  country: ReturnType<typeof detectRequestCountry>,
) {
  const retailers = await getCountryRetailers(env, country)
  return { retailers, summary: countryRetailerSummary(retailers) }
}

export function addRetailerLogos(retailers: Retailer[]): Retailer[] {
  return retailers.map((retailer) => ({
    ...retailer,
    logoUrl: retailerLogoUrl(retailer),
  }))
}
