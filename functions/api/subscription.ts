import type { BillingCycle, MemberPlanId, SubscriptionCheckoutRequest } from '../../src/types'
import { memberPlans } from '../../src/data/memberPlans'
import {
  cancelPendingPlanChange,
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

    // Announced but not yet open. Guarded on the server, not just in the UI, so
    // a hand-made request cannot buy a plan we are not able to deliver.
    const requestedPlan = memberPlans.find((plan) => plan.id === body.planId)

    if (requestedPlan?.comingSoon) {
      return json(
        {
          checkout: {
            billingCycle: isBillingCycle(body.billingCycle) ? body.billingCycle : 'monthly',
            billingReady: false,
            message: `${requestedPlan.name} is not open for sign-ups yet.`,
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
      body.checkoutMode === 'redirect',
    )
    // A request is successful when it needs no checkout at all (the plan is
    // already active, or a downgrade was queued for the period end), when
    // PayFast returned an onsite session, or when we fell back to the classic
    // redirect checkout. Only a genuine provider failure (billing configured
    // but no usable checkout at all) is a 502; unconfigured billing is a 503.
    const isSettled = checkout.status === 'active' || checkout.status === 'scheduled'
    const hasUsableCheckout = Boolean(checkout.onsiteUuid || checkout.redirectUrl)
    const status =
      isSettled || hasUsableCheckout ? 200 : checkout.billingReady ? 502 : 503

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

  // Drops a queued downgrade so the member stays on the plan they have.
  if (request.method === 'DELETE') {
    const result = await cancelPendingPlanChange(env, session.account)

    if ('issues' in result) {
      return json({ issues: result.issues }, { headers: privateHeaders, status: 400 })
    }

    return json({ account: result.account }, { headers: privateHeaders })
  }

  return methodNotAllowed(request.method, 'GET, POST, DELETE')
}

// Read from the plan table so a new tier is selectable as soon as it exists.
function isKnownPlanId(planId: string): planId is MemberPlanId {
  return memberPlans.some((plan) => plan.id === planId)
}

function isBillingCycle(value: string): value is BillingCycle {
  return value === 'monthly' || value === 'annual'
}
