import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'
import { claimVoucher, listActiveVouchers, unclaimVoucher } from '../_shared/voucherStore'

const privateHeaders = {
  'cache-control': 'private, no-store',
}
const MAX_ACTION_BODY_BYTES = 8_192

interface VoucherActionBody {
  voucherId?: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const accountId = session.account?.id

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const limit = boundedQueryInteger(url.searchParams.get('limit'), 100, 1, 200)
    const offset = boundedQueryInteger(url.searchParams.get('offset'), 0, 0, 10_000)
    const retailerValue = url.searchParams.get('retailerId')?.trim() || ''
    if (retailerValue && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(retailerValue)) {
      return json(
        { vouchers: [], issues: ['Retailer ID is invalid.'] },
        { headers: privateHeaders, status: 400 },
      )
    }
    const retailerId = retailerValue || undefined
    const vouchers = await listActiveVouchers(env, {
      accountId,
      limit,
      offset,
      retailerId,
    })

    return json(
      {
        vouchers: vouchers.map(stripInternalVoucherFields),
      },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'POST') {
    if (!hasTrustedMutationOrigin(request)) {
      return json(
        { claimed: false, issues: ['Request origin is not allowed.'] },
        { headers: privateHeaders, status: 403 },
      )
    }
    if (!accountId) {
      return json(
        { claimed: false, issues: ['Sign in before saving a voucher.'] },
        { headers: privateHeaders, status: 401 },
      )
    }

    let body: VoucherActionBody
    try {
      body = await readActionBody(request)
    } catch (error) {
      const tooLarge = error instanceof RangeError
      return json(
        { claimed: false, issues: [tooLarge
          ? 'Request body is too large.'
          : 'Request body must be valid JSON.'] },
        { headers: privateHeaders, status: tooLarge ? 413 : 400 },
      )
    }

    if (!body.voucherId?.trim() || body.voucherId.trim().length > 200) {
      return json(
        { claimed: false, issues: ['Voucher ID is required.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    const result = await claimVoucher(env, accountId, body.voucherId)
    return json(
      result.claimed ? result : { ...result, issues: [result.issue] },
      { headers: privateHeaders, status: result.claimed ? 200 : 422 },
    )
  }

  if (request.method === 'DELETE') {
    if (!hasTrustedMutationOrigin(request)) {
      return json(
        { removed: false, issues: ['Request origin is not allowed.'] },
        { headers: privateHeaders, status: 403 },
      )
    }
    if (!accountId) {
      return json(
        { removed: false, issues: ['Sign in before removing a saved voucher.'] },
        { headers: privateHeaders, status: 401 },
      )
    }

    const voucherId = new URL(request.url).searchParams.get('voucherId')?.trim()
    if (!voucherId || voucherId.length > 200) {
      return json(
        { removed: false, issues: ['Voucher ID is required.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    return json(
      { removed: await unclaimVoucher(env, accountId, voucherId), voucherId },
      { headers: privateHeaders },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST, DELETE')
}

function boundedQueryInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null || value.trim() === '') {
    return fallback
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

function hasTrustedMutationOrigin(request: Request) {
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

async function readActionBody(request: Request): Promise<VoucherActionBody> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ACTION_BODY_BYTES) {
    throw new RangeError('Voucher action body is too large')
  }

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_ACTION_BODY_BYTES) {
    throw new RangeError('Voucher action body is too large')
  }

  const body: unknown = JSON.parse(text)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('Voucher action body must be an object')
  }
  return body as VoucherActionBody
}

function stripInternalVoucherFields<T extends object>(voucher: T): Omit<T, 'codeHash'> {
  const { codeHash: _codeHash, ...publicVoucher } = voucher as T & { codeHash?: unknown }
  return publicVoucher as Omit<T, 'codeHash'>
}
