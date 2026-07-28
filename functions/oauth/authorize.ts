import {
  issueAuthorizationCode,
  OAuthError,
  validateAuthorizationInput,
  type OAuthAuthorizationInput,
} from '../_shared/developerOAuth'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const url = new URL(request.url)
  const source = request.method === 'POST'
    ? new URLSearchParams(await request.text())
    : url.searchParams
  const state = source.get('state') ?? ''
  const input = authorizationInput(source)

  try {
    const client = await validateAuthorizationInput(env, input)
    const session = await getMemberSession(env, request)
    if (!session.account) {
      return html(
        'Sign in required',
        'Sign in to Trolley Scout in this browser, then restart the MCP connection.',
        401,
      )
    }
    if (request.method === 'GET') {
      return consentPage(client.client_name, input, state)
    }
    if (request.method !== 'POST') {
      return html('Method not allowed', 'Use GET or POST for authorization.', 405)
    }
    if (source.get('decision') !== 'allow') {
      return redirectError(input.redirectUri, state, 'access_denied')
    }
    const code = await issueAuthorizationCode(env, session.account, input)
    const redirect = new URL(input.redirectUri)
    redirect.searchParams.set('code', code)
    if (state) redirect.searchParams.set('state', state)
    return Response.redirect(redirect.toString(), 302)
  } catch (error) {
    const known = error instanceof OAuthError
      ? error
      : new OAuthError('server_error', 'Authorization failed.', 500)
    if (safeRedirect(input.redirectUri)) {
      return redirectError(input.redirectUri, state, known.error)
    }
    return html('Authorization failed', known.message, known.status)
  }
}

function authorizationInput(source: URLSearchParams): OAuthAuthorizationInput {
  const scope = source.get('scope')?.split(/\s+/).filter(Boolean) ?? []
  return {
    clientId: source.get('client_id') ?? '',
    codeChallenge: source.get('code_challenge') ?? '',
    codeChallengeMethod: source.get('code_challenge_method') ?? '',
    redirectUri: source.get('redirect_uri') ?? '',
    scopes: scope as OAuthAuthorizationInput['scopes'],
  }
}

function consentPage(clientName: string, input: OAuthAuthorizationInput, state: string) {
  const fields: Record<string, string> = {
    client_id: input.clientId,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: input.scopes.join(' '),
    state,
  }
  const hidden = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('')
  const scopes = input.scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join('')
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Connect ${escapeHtml(clientName)}</title>
<style>body{font-family:system-ui;background:#f4f7f4;color:#162219;margin:0;padding:2rem}main{background:#fff;border:1px solid #dce5dd;border-radius:20px;max-width:560px;margin:5vh auto;padding:2rem;box-shadow:0 20px 60px #18362218}h1{margin-top:0}li{margin:.5rem 0}form{display:flex;gap:.75rem;margin-top:1.5rem}button{border-radius:999px;padding:.8rem 1.1rem;font-weight:750;border:1px solid #cbd7cc;background:#fff;color:#162219}button[value=allow]{background:#ef6c33;border-color:#ef6c33;color:#fff}</style>
</head><body><main><p>Trolley Scout Developers</p><h1>Connect ${escapeHtml(clientName)}?</h1>
<p>This client is requesting permission to:</p><ul>${scopes}</ul>
<form method="post">${hidden}<button name="decision" value="deny">Cancel</button><button name="decision" value="allow">Allow access</button></form>
</main></body></html>`, {
    headers: { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' },
  })
}

function redirectError(redirectUri: string, state: string, error: string) {
  const redirect = new URL(redirectUri)
  redirect.searchParams.set('error', error)
  if (state) redirect.searchParams.set('state', state)
  return Response.redirect(redirect.toString(), 302)
}

function html(title: string, message: string, status: number) {
  return new Response(`<!doctype html><title>${escapeHtml(title)}</title><p>${escapeHtml(message)}</p>`, {
    headers: { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' },
    status,
  })
}

function safeRedirect(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  } catch {
    return false
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}
