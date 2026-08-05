import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { incrementScoutChatUsage } from './scout-chat'

const FISH_MODEL = 's2.1-pro-free'
const MAX_REQUESTS_PER_MINUTE = 60
const MAX_AUDIO_BYTES = 2_000_000
const privateHeaders = { 'cache-control': 'private, no-store' }

interface NavigationVoiceSession {
  account?: { id: string }
  isAuthenticated: boolean
}

export interface NavigationVoiceDependencies {
  fetchFish: (request: Request) => Promise<Response>
  getSession: (
    env: TrolleyScoutEnv,
    request: Request,
  ) => Promise<NavigationVoiceSession>
  incrementUsage: (env: TrolleyScoutEnv, accountId: string) => Promise<number>
}

const dependencies: NavigationVoiceDependencies = {
  fetchFish: (request) => fetch(request),
  getSession: getMemberSession,
  incrementUsage: incrementScoutChatUsage,
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) =>
  handleNavigationVoice({ env, request })

export async function handleNavigationVoice(
  context: { env: TrolleyScoutEnv; request: Request },
  deps: NavigationVoiceDependencies = dependencies,
): Promise<Response> {
  const { env, request } = context
  if (request.method !== 'POST') return methodNotAllowed(request.method, 'POST')

  const session = await deps.getSession(env, request)
  if (!session.isAuthenticated || !session.account) {
    return json(
      { error: 'Sign in to use spoken navigation.' },
      { headers: privateHeaders, status: 401 },
    )
  }
  if (!env.FISH_AUDIO_API_KEY) {
    return json(
      { error: 'Spoken navigation is not configured yet.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  let instruction = ''
  try {
    const body = await request.json() as { instruction?: unknown }
    instruction = typeof body.instruction === 'string'
      ? body.instruction.normalize('NFKC').replace(/\s+/g, ' ').trim()
      : ''
  } catch {
    instruction = ''
  }
  if (instruction.length < 2 || instruction.length > 180) {
    return json(
      { error: 'Navigation instruction must be between 2 and 180 characters.' },
      { headers: privateHeaders, status: 422 },
    )
  }

  const count = await deps.incrementUsage(env, session.account.id)
  if (count > MAX_REQUESTS_PER_MINUTE) {
    return json(
      { error: 'Spoken navigation is busy. Try again in a minute.' },
      {
        headers: { ...privateHeaders, 'retry-after': '60' },
        status: 429,
      },
    )
  }

  let fish: Response
  try {
    fish = await deps.fetchFish(new Request('https://api.fish.audio/v1/tts', {
      body: JSON.stringify({
        text: instruction,
        format: 'mp3',
        latency: 'normal',
        normalize: true,
        prosody: { normalize_loudness: true, speed: 1, volume: 0 },
      }),
      headers: {
        accept: 'audio/mpeg',
        authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`,
        'content-type': 'application/json',
        model: FISH_MODEL,
      },
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
    }))
  } catch {
    return json(
      { error: 'Spoken navigation could not connect.' },
      { headers: privateHeaders, status: 502 },
    )
  }
  if (!fish.ok) {
    return json(
      { error: fish.status === 429 ? 'Spoken navigation is busy.' : 'Spoken navigation could not speak.' },
      { headers: privateHeaders, status: fish.status === 429 ? 429 : 502 },
    )
  }

  const audio = await fish.arrayBuffer()
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    return json(
      { error: 'Spoken navigation returned invalid audio.' },
      { headers: privateHeaders, status: 502 },
    )
  }
  return json({
    answer: instruction,
    audioBase64: arrayBufferToBase64(audio),
    mediaType: 'audio/mpeg',
    model: FISH_MODEL,
  }, { headers: privateHeaders })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}
