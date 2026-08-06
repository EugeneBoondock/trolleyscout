import type { TrolleyScoutEnv } from './env'

/**
 * Work handed to the scout, one retailer at a time.
 *
 * The sweeps run today as a single cron invocation that walks every retailer
 * in turn. One shop timing out costs the rest of the run, and a retry starts
 * from the first shop again — which is why a dead feed shows up as a barren
 * run rather than as a failure anyone can see.
 *
 * A queue makes each shop its own message: it retries on its own, it fails on
 * its own, and a shop that keeps failing lands in the dead-letter queue where
 * the health alarm can read it instead of inferring it.
 *
 * The Paid plan includes a million operations a month. A sweep of ~120
 * retailers every few hours is a few thousand — this is not a resource that
 * needs rationing, unlike the AI allowances.
 */

export type ScoutJobKind = 'clothing' | 'deals' | 'catalogue'

export interface ScoutJob {
  kind: ScoutJobKind
  retailerId: string
  /** Which sweep this belongs to, so a run can be followed end to end. */
  runId: string
  /** Set when the shop needs a real browser rather than a fetch. */
  needsBrowser?: boolean
}

/**
 * Queues a batch of retailers.
 *
 * Returns how many were queued; zero means no queue is bound, and the caller
 * should sweep inline exactly as it did before.
 */
export async function enqueueScoutJobs(
  env: TrolleyScoutEnv,
  jobs: readonly ScoutJob[],
): Promise<number> {
  const queue = env.SCOUT_QUEUE
  if (!queue || jobs.length === 0) return 0

  // Queues accepts up to 100 messages per sendBatch call.
  let queued = 0
  for (let start = 0; start < jobs.length; start += MAX_BATCH) {
    const slice = jobs.slice(start, start + MAX_BATCH)
    await queue.sendBatch(slice.map((body) => ({ body })))
    queued += slice.length
  }
  return queued
}

export const MAX_BATCH = 100

/** Rejects anything that is not a job this worker knows how to run. */
export function parseScoutJob(value: unknown): ScoutJob | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const kind = record.kind
  const retailerId = record.retailerId
  const runId = record.runId
  if (kind !== 'clothing' && kind !== 'deals' && kind !== 'catalogue') {
    return undefined
  }
  if (typeof retailerId !== 'string' || retailerId.trim().length === 0) {
    return undefined
  }
  if (typeof runId !== 'string' || runId.trim().length === 0) return undefined
  return {
    kind,
    needsBrowser: record.needsBrowser === true,
    retailerId: retailerId.trim(),
    runId: runId.trim(),
  }
}
