// Checkout codes: list them, submit one, and say whether it worked.
//
// Separate from /api/vouchers, which carries loyalty offers and clip coupons.
// A shopper asking for a voucher means a code they can paste at checkout, and
// mixing the two is what made the voucher wall useless.

import type { TrolleyScoutEnv } from '../_shared/env'
import { detectRequestCountry } from '../_shared/countryContext'
import { getMemberSession } from '../_shared/memberStore'
import {
  listVoucherCodes,
  submitVoucherCode,
  voteVoucherCode,
} from '../_shared/voucherCodeStore'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const accountId = session.account?.id
  const countryCode = session.account?.countryCode ?? detectRequestCountry(request).code

  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams
    const retailerValue = params.get('retailerId')?.trim() ?? ''
    if (retailerValue && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(retailerValue)) {
      return json(
        { codes: [], issues: ['Retailer ID is invalid.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    return json(
      {
        codes: await listVoucherCodes(env, {
          accountId,
          countryCode,
          retailerId: retailerValue || undefined,
        }),
      },
      { headers: privateHeaders },
    )
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'GET, POST')
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { issues: ['Request origin is not allowed.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (!accountId) {
    return json(
      { issues: ['Sign in to share a code or say whether one worked.'] },
      { headers: privateHeaders, status: 401 },
    )
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

  if (body.action === 'vote') {
    const voucherCodeId = typeof body.voucherCodeId === 'string' ? body.voucherCodeId : ''
    if (!voucherCodeId || typeof body.worked !== 'boolean') {
      return json(
        { issues: ['Say which code, and whether it worked.'] },
        { headers: privateHeaders, status: 422 },
      )
    }

    const result = await voteVoucherCode(env, voucherCodeId, accountId, body.worked, countryCode)
    return json(result, { headers: privateHeaders, status: result.issues ? 422 : 200 })
  }

  const result = await submitVoucherCode(env, {
    benefitText: text(body.benefitText),
    code: text(body.code),
    countryCode,
    minimumSpendText: optionalText(body.minimumSpendText),
    retailerId: text(body.retailerId),
    termsText: optionalText(body.termsText),
    validTo: optionalText(body.validTo),
  }, accountId)

  return json(result, { headers: privateHeaders, status: result.issues ? 422 : 200 })
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
