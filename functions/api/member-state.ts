// Per-account key/value state so the app's on-device data (near-me history,
// saved addresses, taste profile) survives logout, reinstall, and new devices.
import { getMemberSession } from '../_shared/memberStore'
import { getMemberState, setMemberState } from '../_shared/windowSocialStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = { 'cache-control': 'private, no-store' }
const KEY_RE = /^[a-z0-9_]{2,40}$/
const MAX_VALUE_BYTES = 200_000

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (!['GET', 'PUT', 'POST'].includes(request.method)) {
    return methodNotAllowed(request.method, 'GET, PUT')
  }

  const session = await getMemberSession(env, request)
  if (!session.account) {
    return json({ error: 'Sign in to sync your data.' }, { headers: privateHeaders, status: 401 })
  }
  const accountId = session.account.id

  if (request.method === 'GET') {
    const key = new URL(request.url).searchParams.get('key') ?? ''
    if (!KEY_RE.test(key)) {
      return json({ error: 'Invalid state key.' }, { headers: privateHeaders, status: 400 })
    }
    const value = await getMemberState(env, accountId, key)
    return json({ key, value: value ?? null }, { headers: privateHeaders })
  }

  let body: { key?: string; value?: unknown }
  try {
    body = (await request.json()) as { key?: string; value?: unknown }
  } catch {
    return json({ error: 'Body must be valid JSON.' }, { headers: privateHeaders, status: 400 })
  }
  const key = String(body.key ?? '')
  if (!KEY_RE.test(key)) {
    return json({ error: 'Invalid state key.' }, { headers: privateHeaders, status: 400 })
  }
  if (JSON.stringify(body.value ?? null).length > MAX_VALUE_BYTES) {
    return json({ error: 'State value is too large.' }, { headers: privateHeaders, status: 413 })
  }
  const ok = await setMemberState(env, accountId, key, body.value ?? null)
  return json({ ok, key }, { headers: privateHeaders })
}
