// Buy more fittings. GET lists the packs and what the shopper has left; POST
// starts a once-off PayFast checkout for a pack. Credits land only when the
// ITN confirms the payment, so nothing is granted on an abandoned checkout.

import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { getPayFastEndpoints, resolvePayFastConfig } from '../_shared/payfast'
import {
  createPayFastAdCheckoutFields,
  requestPayFastAdOnsitePayment,
} from '../_shared/payfastAds'
import { resolvePayFastNotifyUrl } from '../_shared/payfastNotifyUrl'
import { json, methodNotAllowed } from '../_shared/respond'
import {
  findTryOnCreditPack,
  TRY_ON_CREDIT_PACKS,
} from '../_shared/tryOnCreditPacks'
import { readTryOnQuota } from '../_shared/tryOnQuota'

const privateHeaders = { 'cache-control': 'private, no-store' }

/// Plans whose members may top up. Household and above are already unlimited,
/// so in practice this is the Scout overflow valve.
const PACK_ELIGIBLE_PLANS = new Set([
  'scout',
  'household',
  'organization',
  'developers',
])

/// The payment reference carries the pack so the ITN can grant the right
/// number of fittings without trusting anything the browser sends back.
export function creditPaymentReference(accountId: string, packId: string): string {
  return `fittings:${packId}:${accountId}`.slice(0, 100)
}

export function parseCreditPaymentReference(
  reference: string,
): { accountId: string; packId: string } | undefined {
  const parts = reference.split(':')
  if (parts.length !== 3 || parts[0] !== 'fittings') return undefined
  const [, packId, accountId] = parts
  if (!packId || !accountId) return undefined
  return { accountId, packId }
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json(
      { issues: ['Sign in to buy fittings.'] },
      { headers: privateHeaders, status: 401 },
    )
  }

  // Top-ups are for members whose plan already includes fittings and who ran
  // out this month. A free shopper is better served by Scout: R29 buys 50
  // fittings and the rest of the toolkit, which beats any pack we could sell.
  const canBuyPacks = account.role === 'admin' ||
    PACK_ELIGIBLE_PLANS.has(account.planId.trim().toLowerCase())

  if (request.method === 'GET') {
    const quota = await readTryOnQuota(
      env,
      account.id,
      account.planId,
      account.role === 'admin',
    )
    return json(
      {
        canBuyPacks,
        packs: canBuyPacks ? TRY_ON_CREDIT_PACKS : [],
        quota,
        upgradeHint: canBuyPacks
          ? 'Need fittings every month? Household is unlimited.'
          : 'Scout gives you 50 fittings a month plus the whole toolkit.',
      },
      { headers: privateHeaders },
    )
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'GET, POST')
  }

  let body: { packId?: string }
  try {
    body = (await request.json()) as { packId?: string }
  } catch {
    return json(
      { issues: ['Request body must be valid JSON.'] },
      { headers: privateHeaders, status: 400 },
    )
  }

  if (!canBuyPacks) {
    return json(
      {
        issues: [
          'Fitting packs are for members on a paid plan. Scout gives you 50 ' +
              'fittings a month plus the whole toolkit.',
        ],
      },
      { headers: privateHeaders, status: 403 },
    )
  }

  const pack = findTryOnCreditPack((body.packId ?? '').trim())
  if (!pack) {
    return json(
      { issues: ['Choose one of the fitting packs.'] },
      { headers: privateHeaders, status: 400 },
    )
  }

  const payfast = resolvePayFastConfig(env)
  if (!payfast) {
    return json(
      {
        checkout: {
          billingReady: false,
          message: 'Payments are not configured yet.',
          status: 'billing_not_configured',
        },
      },
      { headers: privateHeaders },
    )
  }

  const origin = env.APP_URL ?? new URL(request.url).origin
  const fields = createPayFastAdCheckoutFields({
    account: {
      displayName: account.displayName,
      email: account.email,
      id: account.id,
    },
    adId: creditPaymentReference(account.id, pack.id),
    amountCents: pack.amountCents,
    itemName: `Trolley Scout: ${pack.label}`.slice(0, 100),
    merchantId: payfast.merchantId,
    merchantKey: payfast.merchantKey,
    notifyUrl: resolvePayFastNotifyUrl(env, origin, '/api/payfast-credits-itn'),
    passphrase: payfast.passphrase ?? '',
  })

  let onsiteUuid: string | undefined
  try {
    onsiteUuid = await requestPayFastAdOnsitePayment(fields, payfast.mode)
  } catch {
    onsiteUuid = undefined
  }

  if (!onsiteUuid) {
    // Onsite may be disabled on the merchant account — the classic redirect
    // form works everywhere, including the sandbox.
    return json(
      {
        checkout: {
          billingReady: true,
          message: 'Redirecting to PayFast to complete your payment.',
          redirectFields: Object.fromEntries(fields),
          redirectUrl: getPayFastEndpoints(payfast.mode).processUrl,
          status: 'checkout_required',
        },
        pack,
      },
      { headers: privateHeaders },
    )
  }

  return json(
    {
      checkout: {
        billingReady: true,
        engineUrl: getPayFastEndpoints(payfast.mode).engineUrl,
        message: 'PayFast checkout is ready.',
        onsiteUuid,
        status: 'checkout_required',
      },
      pack,
    },
    { headers: privateHeaders },
  )
}
