import {
  OAuthError,
  registerOAuthClient,
} from '../_shared/developerOAuth'
import type { TrolleyScoutEnv } from '../_shared/env'

export const onRequestPost: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  try {
    const body = await request.json() as Record<string, unknown>
    const result = await registerOAuthClient(env, {
      clientName: typeof body.client_name === 'string' ? body.client_name : '',
      redirectUris: Array.isArray(body.redirect_uris)
        ? body.redirect_uris.filter((value): value is string => typeof value === 'string')
        : [],
      tokenEndpointAuthMethod:
        body.token_endpoint_auth_method === 'client_secret_post'
          ? 'client_secret_post'
          : 'none',
    })
    return oauthJson(result, 201)
  } catch (error) {
    return oauthFailure(error)
  }
}

function oauthFailure(error: unknown) {
  const known = error instanceof OAuthError
    ? error
    : new OAuthError('invalid_client_metadata', 'Client registration failed.')
  return oauthJson({ error: known.error, error_description: known.message }, known.status)
}

function oauthJson(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  })
}
