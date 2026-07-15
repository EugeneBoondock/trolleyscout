import type { MemberPlanId, SubscriptionCheckoutRequest } from '../../src/types'
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
            billingReady: false,
            message: 'Request body must be valid JSON.',
            planId: 'free' as MemberPlanId,
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
            billingReady: isBillingReady(env),
            message: 'Choose a valid plan.',
            planId: 'free' as MemberPlanId,
            status: 'checkout_required',
          },
        },
        {
          headers: privateHeaders,
          status: 400,
        },
      )
    }

    const checkout = await startSubscriptionCheckout(env, request, session.account, body.planId)

    return json(
      {
        checkout,
      },
      {
        headers: privateHeaders,
        status: checkout.billingReady || body.planId === 'free' ? 200 : 503,
      },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST')
}

function isKnownPlanId(planId: string): planId is MemberPlanId {
  return planId === 'free' || planId === 'scout' || planId === 'household'
}
