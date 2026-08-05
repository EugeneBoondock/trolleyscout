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

  if (!env.AI) {
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

  try {
    // The model's published schema: person_image plus a garment_imageS array.
    // Both go in as data URIs — the person photo must never become a fetchable
    // URL, and the garment travels the same way so a retailer CDN that blocks
    // datacenter fetches cannot break the try-on.
    const result = await env.AI.run(
      VTON_MODEL as never,
      {
        garment_images: [`data:image/jpeg;base64,${garmentBase64}`],
        person_image: `data:image/jpeg;base64,${personBase64}`,
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
    // Admins see what the model actually said; shoppers see a soft retry.
    console.error('virtual-try-on model call failed:', error)
    return json(
      {
        issues: ['The fitting room could not finish that look. Try again.'],
        ...(isAdmin ? { detail: error instanceof Error ? error.message : String(error) } : {}),
      },
      { headers: privateHeaders, status: 502 },
    )
  }
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
    const candidate = typeof record.image === 'string'
      ? record.image
      : Array.isArray(images) && typeof images[0] === 'string'
        ? images[0]
        : typeof record.result === 'string'
          ? record.result
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
