import { readCoverageLedger } from '../_shared/coverageStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method)
  return json(
    { coverage: await readCoverageLedger(env) },
    { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } },
  )
}
