import {
  exchangeAuthorizationCode,
  OAuthError,
  refreshOAuthTokens,
} from '../_shared/developerOAuth'
import type { TrolleyScoutEnv } from '../_shared/env'

export const onRequestPost: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  try {
    const body = await bodyParams(request)
    const grantType = body.get('grant_type')
    const result = grantType === 'authorization_code'
      ? await exchangeAuthorizationCode(env, {
          clientId: body.get('client_id') ?? '',
          clientSecret: body.get('client_secret') ?? undefined,
          code: body.get('code') ?? '',
          codeVerifier: body.get('code_verifier') ?? '',
          redirectUri: body.get('redirect_uri') ?? '',
        })
      : grantType === 'refresh_token'
        ? await refreshOAuthTokens(env, {
            clientId: body.get('client_id') ?? '',
            clientSecret: body.get('client_secret') ?? undefined,
            refreshToken: body.get('refresh_token') ?? '',
          })
        : (() => {
            throw new OAuthError('unsupported_grant_type', 'Unsupported OAuth grant type.')
          })()
    const { refreshTokenId: _refreshTokenId, ...publicResult } = result
    return oauthJson(publicResult, 200)
  } catch (error) {
    const known = error instanceof OAuthError
      ? error
      : new OAuthError('server_error', 'Token exchange failed.', 500)
    return oauthJson({ error: known.error, error_description: known.message }, known.status)
  }
}

async function bodyParams(request: Request) {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body = await request.json() as Record<string, unknown>
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') params.set(key, value)
    }
    return params
  }
  return new URLSearchParams(await request.text())
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
