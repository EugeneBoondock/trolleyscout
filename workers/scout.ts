import { runCatalogueScout } from '../functions/_shared/catalogueScout'
import type { TrolleyScoutEnv } from '../functions/_shared/env'
import { purgeExpired } from '../functions/_shared/locationStore'
import type { DiscoveryRun } from '../src/types'

export interface ScoutEnv extends TrolleyScoutEnv {
  SCOUT_ORIGIN?: string
}

type ScoutFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export async function runScheduledScout(
  env: ScoutEnv,
  fetcher: ScoutFetch = fetch,
) {
  const origin = env.SCOUT_ORIGIN ?? 'https://trolleyscout.co.za'
  const refreshUrl = new URL('/api/discovery', origin)
  refreshUrl.searchParams.set('refresh', '1')
  const response = await fetcher(refreshUrl.toString(), {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Deal refresh returned HTTP ${response.status}.`)
  }

  const envelope = (await response.json()) as { data?: DiscoveryRun }
  const discovery = envelope.data
  const catalogue = await runCatalogueScout(env, discovery?.leaflets ?? [])

  // Enforce the expiry rule: remove any store promotions and location caches
  // whose date has passed, so no shopper is ever shown an out-of-date special.
  const expiredRemoved = await purgeExpired(env, new Date().toISOString())

  return {
    catalogueDealCount: catalogue.dealCount,
    discoveredLeafletCount: catalogue.discoveredLeafletCount,
    expiredRemoved,
    refreshedDealCount: discovery?.summary.foundDealCount ?? 0,
    refreshedSourceCount: discovery?.summary.checkedSourceCount ?? 0,
    scannedDocumentCount: catalogue.scannedDocumentCount,
  }
}

export default {
  async scheduled(_controller, env) {
    const result = await runScheduledScout(env)
    console.log(JSON.stringify({ event: 'deal_scout_completed', ...result }))
  },
} satisfies ExportedHandler<ScoutEnv>
