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

    const planId = normalizeCheckoutPlan(body.planId)
    const checkout = await startSubscriptionCheckout(env, request, session.account, planId)

    return json(
      {
        checkout,
      },
      {
        headers: privateHeaders,
        status: checkout.billingReady || planId === 'free' ? 200 : 503,
      },
    )
  }

  return methodNotAllowed(request.method, 'GET, POST')
}

function normalizeCheckoutPlan(planId: string): MemberPlanId {
  if (planId === 'scout' || planId === 'household') {
    return planId
  }

  return 'free'
}
