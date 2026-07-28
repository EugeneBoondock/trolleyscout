import { DEVELOPER_SCOPES, oauthIssuer } from '../_shared/developerOAuth'
import type { TrolleyScoutEnv } from '../_shared/env'

export const onRequestGet: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const issuer = oauthIssuer(env, request)
  return new Response(JSON.stringify({
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    resource: `${issuer}/mcp`,
    scopes_supported: DEVELOPER_SCOPES,
  }), {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
