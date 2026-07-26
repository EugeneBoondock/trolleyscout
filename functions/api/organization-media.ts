import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { getOrganizationForAccount } from '../_shared/organizationStore'
import {
  hasTrustedMutationOrigin,
  readJsonObjectBody,
} from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method === 'GET') return serveMedia(env, request)
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return methodNotAllowed(request.method, 'GET, POST, DELETE')
  }
  if (!env.MEDIA) {
    return json(
      { issues: ['Image upload is temporarily unavailable. Use a secure image link.'] },
      { headers: privateHeaders, status: 503 },
    )
  }

  const session = await getMemberSession(env, request)
  if (!session.account) {
    return json(
      { issues: ['Sign in to manage business images.'] },
      { headers: privateHeaders, status: 401 },
    )
  }
  const organization = await getOrganizationForAccount(env, session.account.id)
  if (!organization) {
    return json(
      { issues: ['An active organization is required.'] },
      { headers: privateHeaders, status: 403 },
    )
  }
  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { issues: ['Request origin is not allowed.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (request.method === 'DELETE') {
    return deleteMedia(env, request, organization.id)
  }
  return uploadMedia(env, request, organization.id)
}

async function uploadMedia(
  env: TrolleyScoutEnv,
  request: Request,
  organizationId: string,
) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json(
      { issues: ['Send the image as form data.'] },
      { headers: privateHeaders, status: 400 },
    )
  }
  const image = form.get('image')
  const altText = text(form.get('altText')).slice(0, 240)
  if (!isUploadedFile(image) || image.size === 0 || image.size > MAX_IMAGE_BYTES) {
    return json(
      { issues: ['Choose a JPEG, PNG, or WebP image no larger than 8 MB.'] },
      { headers: privateHeaders, status: 422 },
    )
  }
  if (!allowedTypes.has(image.type)) {
    return json(
      { issues: ['Choose a JPEG, PNG, or WebP image.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  const bytes = await image.arrayBuffer()
  if (!matchesImageSignature(new Uint8Array(bytes), image.type)) {
    return json(
      { issues: ['The selected file does not match its image type.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  const id = `org-media-${crypto.randomUUID()}`
  const key = `organizations/${organizationId}/${crypto.randomUUID()}.${extension(image.type)}`
  await env.MEDIA!.put(key, bytes, {
    customMetadata: { organizationId },
    httpMetadata: { contentType: image.type },
  })

  const url = new URL('/api/organization-media', env.APP_URL ?? new URL(request.url).origin)
  url.searchParams.set('key', key)
  try {
    await env.DB!.prepare(
      `INSERT INTO organization_publication_media (
        id, organization_id, publication_id, object_key, media_url, alt_text,
        sort_order, created_at
      ) VALUES (?, ?, NULL, ?, ?, ?, 0, ?)`,
    ).bind(
      id,
      organizationId,
      key,
      url.toString(),
      altText,
      new Date().toISOString(),
    ).run()
  } catch {
    await env.MEDIA!.delete(key)
    return json(
      { issues: ['The image could not be saved. Try again.'] },
      { headers: privateHeaders, status: 500 },
    )
  }

  return json(
    { media: { altText, id, key, url: url.toString() } },
    { headers: privateHeaders },
  )
}

async function serveMedia(env: TrolleyScoutEnv, request: Request) {
  if (!env.MEDIA) return new Response('Not found', { status: 404 })
  const key = new URL(request.url).searchParams.get('key') ?? ''
  if (!safeObjectKey(key)) return new Response('Not found', { status: 404 })
  const object = await env.MEDIA.get(key)
  if (!object) return new Response('Not found', { status: 404 })
  return new Response(object.body, {
    headers: {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      etag: object.httpEtag,
    },
  })
}

async function deleteMedia(
  env: TrolleyScoutEnv,
  request: Request,
  organizationId: string,
) {
  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request, 2_048)
  } catch {
    return json(
      { issues: ['Request body must be valid JSON.'] },
      { headers: privateHeaders, status: 400 },
    )
  }
  const key = text(body.key)
  if (!safeObjectKey(key)) {
    return json(
      { issues: ['Provide a valid image key.'] },
      { headers: privateHeaders, status: 422 },
    )
  }
  const media = await env.DB!.prepare(
    `SELECT id FROM organization_publication_media
      WHERE organization_id = ? AND object_key = ? AND publication_id IS NULL`,
  ).bind(organizationId, key).first<{ id: string }>()
  if (!media) {
    return json({ deleted: false }, { headers: privateHeaders, status: 404 })
  }
  await env.MEDIA!.delete(key)
  await env.DB!.prepare(
    'DELETE FROM organization_publication_media WHERE id = ? AND organization_id = ?',
  ).bind(media.id, organizationId).run()
  return json({ deleted: true }, { headers: privateHeaders })
}

function matchesImageSignature(bytes: Uint8Array, type: string) {
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (type === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return bytes.length >= signature.length &&
      signature.every((value, index) => bytes[index] === value)
  }
  return bytes.length >= 12 &&
    textBytes(bytes.slice(0, 4)) === 'RIFF' &&
    textBytes(bytes.slice(8, 12)) === 'WEBP'
}

function extension(type: string) {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'
}

function safeObjectKey(key: string) {
  return /^organizations\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(key)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function textBytes(bytes: Uint8Array) {
  return String.fromCharCode(...bytes)
}

function isUploadedFile(value: unknown): value is File {
  if (!value || typeof value !== 'object') return false
  const candidate = value as {
    arrayBuffer?: unknown
    size?: unknown
    type?: unknown
  }
  return Boolean(
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string',
  )
}
