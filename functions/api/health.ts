import { json, methodNotAllowed } from '../_shared/respond'

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  return json({
    ok: true,
    service: 'trolley-scout',
    version: '0.1.0',
  })
}
