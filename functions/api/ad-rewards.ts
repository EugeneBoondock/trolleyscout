// Opt-in rewarded ads. GET describes the bargain and how far along the shopper
// is; POST reports one completed ad and pays out when a set is finished.
//
// Nothing here runs unless the shopper opened the rewards screen and pressed
// play. Trolley Scout carries no ad banners anywhere else.

import {
  AD_REWARD_RATES,
  MAX_ADS_PER_DAY,
  isAdRewardKind,
  readAdRewardProgress,
  recordRewardedAdView,
} from '../_shared/adRewards'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({
  env,
  request,
}) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowed(['GET', 'POST'])
  }

  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json(
      { issues: ['Sign in to earn rewards.'] },
      { headers: privateHeaders, status: 401 },
    )
  }

  if (request.method === 'GET') {
    return json(
      {
        maxAdsPerDay: MAX_ADS_PER_DAY,
        progress: await readAdRewardProgress(env, account.id),
        rates: Object.values(AD_REWARD_RATES),
      },
      { headers: privateHeaders },
    )
  }

  const body = await readJson(request)
  const kind = body?.kind
  const viewId = typeof body?.viewId === 'string' ? body.viewId.trim() : ''

  if (!isAdRewardKind(kind)) {
    return json(
      { issues: ['Choose what to earn.'] },
      { headers: privateHeaders, status: 400 },
    )
  }
  // The ad network's own id for the view. Without it a phone could replay one
  // ad for an evening's worth of credits.
  if (viewId.length < 8) {
    return json(
      { issues: ['That ad could not be verified.'] },
      { headers: privateHeaders, status: 400 },
    )
  }

  const outcome = await recordRewardedAdView(env, account.id, kind, viewId)
  return json(outcome, { headers: privateHeaders })
}

async function readJson(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value = await request.json()
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
