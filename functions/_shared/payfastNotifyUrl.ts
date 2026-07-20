import type { TrolleyScoutEnv } from './env'

// Every PayFast checkout carries its own notify_url, which overrides the
// account-level Notify URL set in the PayFast dashboard. That override matters
// here because the merchant account is shared across projects: the dashboard
// URL is a catch-all for integrations that send nothing, while each project
// must still receive its own notifications.
//
// Subscriptions and ads settle against different tables and different handlers,
// so they must never share one endpoint. A subscription ITN delivered to the ad
// handler matches no ad, is rejected, and the payment is never recorded — so
// the path is always chosen by purpose rather than read from configuration.
export type PayFastNotifyPath = '/api/payfast-itn' | '/api/payfast-ad-itn'

export function resolvePayFastNotifyUrl(
  env: TrolleyScoutEnv,
  requestOrigin: string,
  path: PayFastNotifyPath,
) {
  return new URL(path, notifyOrigin(env) ?? requestOrigin).toString()
}

// Only the host is configurable, so notifications can be routed through a
// central gateway without either flow losing its own endpoint. A value that is
// not a parseable absolute URL is ignored rather than allowed to break
// checkout — falling back to our own origin always reaches a real handler.
function notifyOrigin(env: TrolleyScoutEnv) {
  const configured = env.PAYFAST_NOTIFY_ORIGIN?.trim()

  if (!configured) {
    return undefined
  }

  try {
    return new URL(configured).origin
  } catch {
    return undefined
  }
}
