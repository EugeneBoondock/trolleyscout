// Guards every mutating API route needs: refuse a cross-site post, and read a
// JSON object body without letting an unbounded request through.

const DEFAULT_MAX_BODY_BYTES = 16_384

/// A same-origin browser fetch sends its Origin; the mobile app and server-side
/// callers send none. Anything that names a different site is refused.
export function hasTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')

  if (!origin) {
    return true
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

/// Reads a JSON object body. Throws RangeError when it is too large and
/// TypeError when it is not a JSON object, so callers can answer 413 or 400.
export async function readJsonObjectBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length'))

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RangeError('Request body is too large')
  }

  const text = await request.text()

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RangeError('Request body is too large')
  }

  const body: unknown = JSON.parse(text)

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('Request body must be a JSON object')
  }

  return body as Record<string, unknown>
}

/// Only a string counts as text from a client. Numbers, objects and nulls
/// become empty so validation reports them as missing rather than coercing
/// something like "[object Object]" into the database.
export function bodyText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function optionalBodyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
