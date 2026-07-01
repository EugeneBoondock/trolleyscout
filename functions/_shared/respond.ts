import type { ApiErrorResponse, ApiMeta } from '../../src/api/contracts'

const jsonHeaders = {
  'cache-control': 'public, max-age=120',
  'content-type': 'application/json; charset=utf-8',
}

export function meta(): ApiMeta {
  return {
    generatedAt: new Date().toISOString(),
    source: 'cloudflare-pages',
  }
}

export function json<T>(data: T, init: ResponseInit = {}) {
  return new Response(JSON.stringify({ data, meta: meta() }), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init.headers,
    },
  })
}

export function methodNotAllowed(method: string, allow = 'GET') {
  const body: ApiErrorResponse = {
    error: {
      code: 'method_not_allowed',
      message: `${method} is not supported for this endpoint.`,
    },
    meta: meta(),
  }

  return new Response(JSON.stringify(body), {
    headers: {
      ...jsonHeaders,
      allow,
    },
    status: 405,
  })
}
