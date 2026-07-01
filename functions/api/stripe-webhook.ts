import {
  activateMemberSubscriptionFromCheckout,
  deactivateMemberSubscriptionFromStripe,
  updateMemberSubscriptionFromStripe,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { verifyStripeWebhookSignature } from '../_shared/stripeWebhook'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

interface StripeEvent {
  data?: {
    object?: Record<string, unknown>
  }
  type?: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const payload = await request.text()
  const isVerified = await verifyStripeWebhookSignature({
    header: request.headers.get('stripe-signature'),
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET,
  })

  if (!isVerified) {
    return json(
      {
        message: 'Invalid Stripe signature.',
        received: false,
      },
      {
        headers: privateHeaders,
        status: 401,
      },
    )
  }

  let event: StripeEvent

  try {
    event = JSON.parse(payload) as StripeEvent
  } catch {
    return json(
      {
        message: 'Webhook body must be valid JSON.',
        received: false,
      },
      {
        headers: privateHeaders,
        status: 400,
      },
    )
  }

  const result = await handleStripeEvent(env, event)

  return json(
    {
      eventType: event.type ?? 'unknown',
      received: true,
      ...result,
    },
    {
      headers: privateHeaders,
    },
  )
}

async function handleStripeEvent(env: TrolleyScoutEnv, event: StripeEvent) {
  const object = event.data?.object ?? {}

  if (event.type === 'checkout.session.completed') {
    const metadata = recordValue(object, 'metadata')
    return activateMemberSubscriptionFromCheckout(env, {
      customerId: stripeId(recordValue(object, 'customer')),
      memberAccountId: stringValue(metadata, 'member_account_id') || stringValue(object, 'client_reference_id'),
      planId: stringValue(metadata, 'plan_id'),
      subscriptionId: stripeId(recordValue(object, 'subscription')),
    })
  }

  if (event.type === 'customer.subscription.updated') {
    const metadata = recordValue(object, 'metadata')
    return updateMemberSubscriptionFromStripe(env, {
      customerId: stripeId(recordValue(object, 'customer')),
      memberAccountId: stringValue(metadata, 'member_account_id'),
      planId: stringValue(metadata, 'plan_id'),
      status: stringValue(object, 'status'),
      subscriptionId: stringValue(object, 'id'),
    })
  }

  if (event.type === 'customer.subscription.deleted') {
    return deactivateMemberSubscriptionFromStripe(env, stringValue(object, 'id'))
  }

  return {
    updated: false,
  }
}

function recordValue(value: unknown, key: string) {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function stringValue(value: unknown, key: string) {
  const current = recordValue(value, key)

  return typeof current === 'string' ? current : ''
}

function stripeId(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  return stringValue(value, 'id') || undefined
}
