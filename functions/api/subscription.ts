import type { BillingCycle, MemberPlanId, SubscriptionCheckoutRequest } from '../../src/types'
import {
  getMemberSession,
  getSubscriptionPlans,
  isBillingReady,
  startSubscriptionCheckout,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)

  if (request.method === 'GET') {
    return json(
      {
        account: session.account,
        billingReady: isBillingReady(env),
        plans: getSubscriptionPlans(),
      },
      {
        headers: privateHeaders,
      },
    )
  }

  if (request.method === 'POST') {
    let body: SubscriptionCheckoutRequest

    try {
      body = (await request.json()) as SubscriptionCheckoutRequest
    } catch {
      return json(
        {
          checkout: {
            billingCycle: 'monthly' as BillingCycle,
            billingReady: false,
            message: 'Request body must be valid JSON.',
            planId: 'free' as MemberPlanId,
            provider: 'payfast',
            status: 'checkout_required',
          },
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    // An unknown plan id must never fall through to a plan change —
    // coercing junk to "free" would silently downgrade a paying member.
    if (!isKnownPlanId(body.planId)) {
      return json(
        {
          checkout: {
            billingCycle: isBillingCycle(body.billingCycle) ? body.billingCycle : 'monthly',
            billingReady: isBillingReady(env),
            message: 'Choose a valid plan.',
            planId: 'free' as MemberPlanId,
            provider: 'payfast',
            status: 'checkout_required',
          },
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    if (!isBillingCycle(body.billingCycle)) {
      return json(
        {
          checkout: {
            billingCycle: 'monthly' as BillingCycle,
            billingReady: isBillingReady(env),
            message: 'Choose monthly or annual billing.',
            planId: body.planId,
            provider: 'payfast',
            status: 'checkout_required',
          },
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const checkout = await startSubscriptionCheckout(
      env,
      request,
      session.account,
      body.planId,
      body.billingCycle,
    )
    // A checkout is successful when the plan is free, PayFast returned an
    // onsite session, or we fell back to the classic redirect checkout.
    // Only a genuine provider failure (billing configured but no usable
    // checkout at all) is a 502; unconfigured billing is a 503.
    const hasUsableCheckout = Boolean(checkout.onsiteUuid || checkout.redirectUrl)
    const status =
      body.planId === 'free' || hasUsableCheckout
        ? 200
        : checkout.billingReady
          ? 502
          : 503

    return json(
      {
        checkout,
      },
      {
        headers: privateHeaders,
        status,
      },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST')
}

function isKnownPlanId(planId: string): planId is MemberPlanId {
  return planId === 'free' || planId === 'scout' || planId === 'household'
}

function isBillingCycle(value: string): value is BillingCycle {
  return value === 'monthly' || value === 'annual'
}
