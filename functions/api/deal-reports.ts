import { detectRequestCountry } from '../_shared/countryContext'
import { submitDealReport } from '../_shared/dealReportStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowed(request.method, 'POST')
  if (!hasTrustedMutationOrigin(request)) {
    return json({ issues: ['Request origin is not allowed.'] }, { headers: privateHeaders, status: 403 })
  }

  const session = await getMemberSession(env, request)
  if (!session.account?.id) {
    return json({ issues: ['Sign in to report a deal.'] }, { headers: privateHeaders, status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request)
  } catch (error) {
    const tooLarge = error instanceof RangeError
    return json(
      { issues: [tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.'] },
      { headers: privateHeaders, status: tooLarge ? 413 : 400 },
    )
  }

  const result = await submitDealReport(
    env,
    session.account.id,
    session.account.countryCode ?? detectRequestCountry(request).code,
    {
      dealId: string(body.dealId),
      note: optionalString(body.note),
      productUrl: optionalString(body.productUrl),
      reason: string(body.reason) as never,
      retailerId: string(body.retailerId),
      retailerName: string(body.retailerName),
      sourceUrl: string(body.sourceUrl),
      title: string(body.title),
    },
  )
  return json(result, { headers: privateHeaders, status: result.issues ? 422 : 200 })
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
