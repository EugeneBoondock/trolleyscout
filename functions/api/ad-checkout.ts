// Pay for an approved ad. The advertiser can only reach this once an admin has
// approved the ad; it builds a once-off PayFast checkout for the exact amount
// the rate card set, and the ad goes live only when the ITN confirms payment.

import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { getPayFastEndpoints, resolvePayFastConfig } from '../_shared/payfast'
import { resolvePayFastNotifyUrl } from '../_shared/payfastNotifyUrl'
import { attachAdCheckout, getAd } from '../_shared/adStore'
import {
  createPayFastAdCheckoutFields,
  requestPayFastAdOnsitePayment,
} from '../_shared/payfastAds'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const session = await getMemberSession(env, request)
  const account = session.account

  if (!account) {
    return json({ issues: ['Sign in to pay for your ad.'] }, { headers: privateHeaders, status: 401 })
  }

  let body: { adId?: string }

  try {
    body = (await request.json()) as { adId?: string }
  } catch {
    return json({ issues: ['Request body must be valid JSON.'] }, { headers: privateHeaders, status: 400 })
  }

  const adId = (body.adId ?? '').trim()
  const ad = adId ? await getAd(env, adId) : undefined

  if (!ad || ad.accountId !== account.id) {
    return json({ issues: ['That ad could not be found.'] }, { headers: privateHeaders, status: 404 })
  }

  if (ad.status !== 'approved') {
    const message =
      ad.status === 'active'
        ? 'This ad is already live.'
        : ad.status === 'pending'
          ? 'This ad is still waiting for review.'
          : 'This ad cannot be paid for.'
    return json({ issues: [message] }, { headers: privateHeaders, status: 409 })
  }

  const payfast = resolvePayFastConfig(env)

  if (!payfast) {
    return json(
      { checkout: { billingReady: false, message: 'Payments are not configured yet.', status: 'billing_not_configured' } },
      { headers: privateHeaders },
    )
  }

  const origin = env.APP_URL ?? new URL(request.url).origin
  const fields = createPayFastAdCheckoutFields({
    account: { displayName: account.displayName, email: account.email, id: account.id },
    adId: ad.id,
    amountCents: ad.amountCents,
    itemName: `Trolley Scout ad: ${ad.title}`.slice(0, 100),
    merchantId: payfast.merchantId,
    merchantKey: payfast.merchantKey,
    notifyUrl: resolvePayFastNotifyUrl(env, origin, '/api/payfast-ad-itn'),
    passphrase: payfast.passphrase ?? '',
  })

  let onsiteUuid: string | undefined

  try {
    onsiteUuid = await requestPayFastAdOnsitePayment(fields, payfast.mode)
  } catch {
    onsiteUuid = undefined
  }

  if (!onsiteUuid) {
    // Onsite may be disabled on the merchant account — fall back to the classic
    // redirect form, which works for any account including the public sandbox.
    await attachAdCheckout(env, ad.id, null)
    return json(
      {
        checkout: {
          billingReady: true,
          message: 'Redirecting to PayFast to complete your payment.',
          redirectFields: Object.fromEntries(fields),
          redirectUrl: getPayFastEndpoints(payfast.mode).processUrl,
          status: 'checkout_required',
        },
      },
      { headers: privateHeaders },
    )
  }

  await attachAdCheckout(env, ad.id, onsiteUuid)

  return json(
    {
      checkout: {
        billingReady: true,
        engineUrl: getPayFastEndpoints(payfast.mode).engineUrl,
        message: 'PayFast checkout is ready.',
        onsiteUuid,
        status: 'checkout_required',
      },
    },
    { headers: privateHeaders },
  )
}
