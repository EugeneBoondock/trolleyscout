import { revokeOAuthSecret } from '../_shared/developerOAuth'
import type { TrolleyScoutEnv } from '../_shared/env'

export const onRequestPost: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const body = new URLSearchParams(await request.text())
  const token = body.get('token')
  if (token) await revokeOAuthSecret(env, token)
  return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 200 })
}
