import {
  authorizeDeveloperRequest,
  consumeDeveloperCall,
  DeveloperAccessError,
  recordDeveloperCallFailure,
} from '../../../_shared/developerAccess'
import {
  developerApiError,
  handleDeveloperApi,
  requiredDeveloperScopes,
} from '../../../_shared/developerApi'
import type { TrolleyScoutEnv } from '../../../_shared/env'

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, params, request }) => {
  const requestId = request.headers.get('x-request-id')?.slice(0, 100) || `req_${crypto.randomUUID()}`
  const path = pathParts(params.path)
  const operation = `${request.method} /${path.join('/')}`
  try {
    const principal = await authorizeDeveloperRequest(
      env,
      request,
      requiredDeveloperScopes(path, request.method),
    )
    await consumeDeveloperCall(env, principal, operation, requestId)
    return handleDeveloperApi({ env, path, principal, request, requestId })
  } catch (error) {
    const accessError = error instanceof DeveloperAccessError
      ? error
      : new DeveloperAccessError(
          'internal_error',
          500,
          'The developer request could not be completed.',
        )
    await recordDeveloperCallFailure(env, {
      operation,
      requestId,
      statusCode: accessError.httpStatus,
    }).catch(() => undefined)
    return developerApiError(
      accessError.code,
      accessError.message,
      accessError.httpStatus,
      requestId,
    )
  }
}

function pathParts(value: string | string[]): string[] {
  const values = Array.isArray(value) ? value : String(value ?? '').split('/')
  return values.map((part) => decodeURIComponent(part)).filter(Boolean)
}
