import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

// A full-body phone photo comfortably fits, with headroom for base64 overhead.
const MAX_BODY_BYTES = 12 * 1024 * 1024
const MAX_GARMENT_BYTES = 8 * 1024 * 1024

const VTON_FLAG = 'vton'
const VTON_MODEL = 'pruna/p-image-try-on'

const PAID_PLAN_IDS = new Set(['scout', 'household', 'organization', 'developers'])

interface FlagRow {
  enabled: number
}

/// The kill switch. A per-member override always wins; without one the global
/// flag decides, and an absent global row means enabled. A database that has
/// not run the flags migration yet also reads as enabled, so the feature never
/// dies to a missing table.
export async function isVtonEnabledFor(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<boolean> {
  if (!env.DB) return true
  try {
    const override = await env.DB.prepare(
      'SELECT enabled FROM member_feature_overrides WHERE account_id = ? AND flag = ?',
    )
      .bind(accountId, VTON_FLAG)
      .first<FlagRow>()
    if (override) return override.enabled === 1

    const global = await env.DB.prepare('SELECT enabled FROM feature_flags WHERE flag = ?')
      .bind(VTON_FLAG)
      .first<FlagRow>()
    return global ? global.enabled === 1 : true
  } catch {
    return true
  }
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }
  if (!hasTrustedMutationOrigin(request)) {
    return json({ issues: ['Request origin is not allowed.'] }, { headers: privateHeaders, status: 403 })
  }

  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json({ issues: ['Sign in to use the fitting room.'] }, { headers: privateHeaders, status: 401 })
  }
  const isAdmin = account.role === 'admin'
  if (!isAdmin && !PAID_PLAN_IDS.has(account.planId)) {
    return json(
      {
        issues: [
          'The fitting room is part of the Scout plan. Upgrade to try clothes on before you buy.',
        ],
      },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (!(await isVtonEnabledFor(env, account.id))) {
    return json(
      { issues: ['The fitting room is closed for a moment. Please check back soon.'] },
      { headers: privateHeaders, status: 503 },
    )
  }

  if (!env.PRUNA_API_KEY && !env.FASHN_API_KEY && !env.AI) {
    return json({ issues: ['Fitting room is warming up'] }, { headers: privateHeaders, status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request, MAX_BODY_BYTES)
  } catch (error) {
    const tooLarge = error instanceof RangeError
    return json(
      { issues: [tooLarge ? 'That photo is too large. Try a smaller one.' : 'Request body must be valid JSON.'] },
      { headers: privateHeaders, status: tooLarge ? 413 : 400 },
    )
  }

  // PRIVACY GUARANTEE: the person photo lives only in this request's memory.
  // It is never written to R2, KV, D1, logs, or any other store — decoded,
  // sent to the model, and gone when the request ends.
  const personBase64 = normaliseBase64(body.personImage)
  const garmentImageUrl = typeof body.garmentImageUrl === 'string' ? body.garmentImageUrl.trim() : ''
  if (!personBase64) {
    return json({ issues: ['A full-body photo is needed to try clothes on.'] }, { headers: privateHeaders, status: 400 })
  }
  if (!isFetchableUrl(garmentImageUrl)) {
    return json({ issues: ['A garment image URL is needed.'] }, { headers: privateHeaders, status: 400 })
  }

  const garmentBase64 = await downloadGarmentImage(garmentImageUrl)
  if (!garmentBase64) {
    return json(
      { issues: ['That garment image could not be fetched. Try another item.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  // Direct Pruna AI API first when PRUNA_API_KEY is configured.
  if (env.PRUNA_API_KEY) {
    try {
      const image = await prunaDirectTryOn(env.PRUNA_API_KEY, personBase64, garmentBase64)
      if (image) {
        return json({ image }, { headers: privateHeaders })
      }
    } catch (error) {
      console.error('virtual-try-on Pruna direct call failed:', error)
      // Fall through to secondary fallbacks (FASHN / Workers AI)
    }
  }

  // FASHN second when its key is present.
  if (env.FASHN_API_KEY) {
    try {
      const image = await fashnTryOn(env.FASHN_API_KEY, personBase64, garmentBase64)
      if (image) {
        return json({ image }, { headers: privateHeaders })
      }
    } catch (error) {
      console.error('virtual-try-on FASHN call failed:', error)
      // Fall through to Workers AI fallback
    }
  }

  try {
    // Workers AI / AI Gateway fallback.
    const gatewayId = env.CF_AI_GATEWAY_ID || 'trolley-scout'
    const result = await env.AI.run(
      VTON_MODEL as never,
      {
        garment_image: `data:image/jpeg;base64,${garmentBase64}`,
        garment_images: [`data:image/jpeg;base64,${garmentBase64}`],
        person_image: `data:image/jpeg;base64,${personBase64}`,
      } as never,
      {
        gateway: {
          id: gatewayId,
        },
      } as never,
    )
    const image = await resultToBase64(result)
    if (!image) {
      return json(
        {
          issues: ['The fitting room could not finish that look. Try again.'],
          ...(isAdmin ? { detail: describeModelResult(result) } : {}),
        },
        { headers: privateHeaders, status: 502 },
      )
    }
    return json({ image: `data:image/png;base64,${image}` }, { headers: privateHeaders })
  } catch (error) {
    console.error('virtual-try-on model call failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()
    const notConnected =
      lower.includes('invalid user credentials') ||
      lower.includes('insufficient ai gateway credits') ||
      lower.includes('insufficient credits') ||
      lower.includes('unauthorized') ||
      lower.includes('authentication error') ||
      lower.includes('ai gateway') ||
      lower.includes('billing') ||
      lower.includes('payment required')
    return json(
      {
        issues: [
          notConnected
              ? 'The fitting room is not connected yet. Please check back soon.'
              : 'The fitting room could not finish that look. Try again.',
        ],
        ...(isAdmin ? { detail: message } : {}),
      },
      { headers: privateHeaders, status: notConnected ? 503 : 502 },
    )
  }
}

/// Direct Pruna AI prediction flow: submit with Try-Sync: true to get
/// immediate completion or async status polling.
async function prunaDirectTryOn(
  apiKey: string,
  personBase64: string,
  garmentBase64: string,
): Promise<string | null> {
  const personUrl = await uploadPrunaFile(apiKey, personBase64)
  const garmentUrl = await uploadPrunaFile(apiKey, garmentBase64)
  if (!personUrl || !garmentUrl) {
    throw new Error('Failed to upload reference images to Pruna file storage.')
  }

  const headers = {
    apikey: apiKey,
    Model: 'p-image-try-on',
    'Try-Sync': 'true',
    'content-type': 'application/json',
  }
  const submitted = await fetch('https://api.pruna.ai/v1/predictions', {
    body: JSON.stringify({
      input: {
        garment_images: [garmentUrl],
        person_image: personUrl,
      },
    }),
    headers,
    method: 'POST',
  })

  if (!submitted.ok) {
    throw new Error(`Pruna AI run failed: ${submitted.status} ${await submitted.text()}`)
  }

  const res = (await submitted.json()) as Record<string, unknown>
  const directUrl =
    typeof res.generation_url === 'string'
      ? res.generation_url
      : typeof res.output === 'string'
        ? res.output
        : Array.isArray(res.output) && typeof res.output[0] === 'string'
          ? res.output[0]
          : undefined

  if (directUrl) {
    return fetchPrunaImage(directUrl, apiKey)
  }

  const getUrl = typeof res.get_url === 'string' ? res.get_url : undefined
  const id = typeof res.id === 'string' ? res.id : undefined
  const statusUrl = getUrl || (id ? `https://api.pruna.ai/v1/predictions/status/${id}` : undefined)

  if (!statusUrl) throw new Error('Pruna AI answered without a status URL or prediction ID.')

  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const polled = await fetch(statusUrl, { headers: { apikey: apiKey } })
    if (!polled.ok) continue
    const status = (await polled.json()) as {
      error?: unknown
      generation_url?: unknown
      output?: unknown
      status?: unknown
    }

    if (status.status === 'succeeded' || status.status === 'completed') {
      const genUrl =
        typeof status.generation_url === 'string'
          ? status.generation_url
          : typeof status.output === 'string'
            ? status.output
            : Array.isArray(status.output) && typeof status.output[0] === 'string'
              ? status.output[0]
              : undefined
      if (!genUrl) return null
      return fetchPrunaImage(genUrl, apiKey)
    }

    if (status.status === 'failed' || status.error) {
      throw new Error(`Pruna AI render failed: ${JSON.stringify(status.error ?? status)}`)
    }
  }

  return null
}

async function uploadPrunaFile(apiKey: string, base64: string): Promise<string | null> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const formData = new FormData()
  const blob = new Blob([bytes], { type: 'image/jpeg' })
  formData.append('content', blob, 'photo.jpg')

  const res = await fetch('https://api.pruna.ai/v1/files', {
    body: formData,
    headers: { apikey: apiKey },
    method: 'POST',
  })
  if (!res.ok) return null
  const payload = (await res.json()) as { urls?: { get?: string } }
  return typeof payload.urls?.get === 'string' ? payload.urls.get : null
}

async function fetchPrunaImage(url: string, apiKey: string): Promise<string | null> {
  const fullUrl = url.startsWith('/') ? `https://api.pruna.ai${url}` : url
  if (fullUrl.startsWith('data:')) return fullUrl
  const imgRes = await fetch(fullUrl, { headers: { apikey: apiKey } })
  if (!imgRes.ok) return null
  const bytes = new Uint8Array(await imgRes.arrayBuffer())
  return `data:image/png;base64,${bytesToBase64(bytes)}`
}

/// FASHN's async flow: submit the pair, poll until the render completes,
/// return the output as a data URI.
async function fashnTryOn(
  apiKey: string,
  personBase64: string,
  garmentBase64: string,
): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  }
  const submitted = await fetch('https://api.fashn.ai/v1/run', {
    body: JSON.stringify({
      inputs: {
        garment_image: `data:image/jpeg;base64,${garmentBase64}`,
        model_image: `data:image/jpeg;base64,${personBase64}`,
      },
      model_name: 'tryon-v1.6',
    }),
    headers,
    method: 'POST',
  })
  if (!submitted.ok) {
    throw new Error(`FASHN run failed: ${submitted.status} ${await submitted.text()}`)
  }
  const { id } = await submitted.json() as { id?: string }
  if (!id) throw new Error('FASHN run answered without a prediction id.')

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const polled = await fetch(`https://api.fashn.ai/v1/status/${id}`, { headers })
    if (!polled.ok) continue
    const status = await polled.json() as {
      error?: unknown
      output?: unknown
      status?: unknown
    }
    if (status.status === 'completed') {
      const output = Array.isArray(status.output) ? status.output[0] : undefined
      if (typeof output !== 'string' || output.length === 0) return null
      if (output.startsWith('data:')) return output
      const image = await fetch(output)
      if (!image.ok) return null
      const bytes = new Uint8Array(await image.arrayBuffer())
      return `data:image/png;base64,${bytesToBase64(bytes)}`
    }
    if (status.status === 'failed' || status.error) {
      throw new Error(`FASHN render failed: ${JSON.stringify(status.error ?? status)}`)
    }
  }
  return null
}

function describeModelResult(result: unknown): string {
  try {
    if (result === null || result === undefined) return 'model returned nothing'
    if (typeof result === 'object') {
      return `unrecognised result shape: keys ${Object.keys(result as object).join(', ') || '(none)'}`
    }
    return `unrecognised result type: ${typeof result}`
  } catch {
    return 'unrecognised result'
  }
}

/// Accepts either a bare base64 string or a data URI and returns bare base64.
function normaliseBase64(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isFetchableUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function downloadGarmentImage(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'image/*' },
    })
    if (!response.ok) return undefined
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_GARMENT_BYTES) return undefined
    return bytesToBase64(new Uint8Array(buffer))
  } catch {
    return undefined
  }
}

/// The partner model answers with either an image payload field or raw bytes,
/// depending on gateway version — both become bare base64 here.
async function resultToBase64(result: unknown): Promise<string | undefined> {
  if (result instanceof ReadableStream) {
    const buffer = await new Response(result).arrayBuffer()
    return buffer.byteLength > 0 ? bytesToBase64(new Uint8Array(buffer)) : undefined
  }
  if (result instanceof ArrayBuffer) {
    return result.byteLength > 0 ? bytesToBase64(new Uint8Array(result)) : undefined
  }
  if (result instanceof Uint8Array) {
    return result.byteLength > 0 ? bytesToBase64(result) : undefined
  }
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    const images = record.images
    const output = record.output
    const candidate = typeof record.image === 'string'
      ? record.image
      : Array.isArray(images) && typeof images[0] === 'string'
        ? images[0]
        : typeof record.result === 'string'
          ? record.result
          : typeof output === 'string'
            ? output
            : Array.isArray(output) && typeof output[0] === 'string'
              ? output[0]
              : typeof record.response === 'string'
                ? record.response
                : undefined
    if (typeof candidate === 'string' && candidate.length > 0) {
      // A URL answer gets fetched once and returned as bytes; data URIs and
      // bare base64 are already what the app needs.
      if (candidate.startsWith('http')) {
        try {
          const response = await fetch(candidate)
          if (!response.ok) return undefined
          const buffer = await response.arrayBuffer()
          return buffer.byteLength > 0
            ? bytesToBase64(new Uint8Array(buffer))
            : undefined
        } catch {
          return undefined
        }
      }
      return candidate.startsWith('data:')
        ? candidate.slice(candidate.indexOf(',') + 1)
        : candidate
    }
  }
  return undefined
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
