import { DEVELOPER_SCOPES, oauthIssuer } from '../_shared/developerOAuth'
import type { TrolleyScoutEnv } from '../_shared/env'

export const onRequestGet: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const issuer = oauthIssuer(env, request)
  return response({
    authorization_endpoint: `${issuer}/oauth/authorize`,
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    issuer,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: DEVELOPER_SCOPES,
    token_endpoint: `${issuer}/oauth/token`,
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  })
}

function response(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
