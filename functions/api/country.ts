import type { TrolleyScoutEnv } from '../_shared/env'
import { detectRequestCountry, getCountryContext } from '../_shared/countryContext'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const session = await getMemberSession(env, request)
  const detected = detectRequestCountry(request)
  const countryCode = session.account?.countryCode ?? detected.code

  return json(
    { country: await getCountryContext(env, countryCode) },
    { headers: privateHeaders },
  )
}
