import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'

import { runCatalogueScout } from '../functions/_shared/catalogueScout'
import { readLeafletSnapshot } from '../functions/_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../functions/_shared/env'

/**
 * The catalogue lane, run durably.
 *
 * Catalogues are the most expensive and most failure-prone thing the scout
 * does: a 30MB PDF, then vision over every page, then a parse, then a write.
 * On the cron a failure anywhere in that is simply a failed run — no backoff,
 * no record, and the next attempt is whenever the schedule comes round again.
 *
 * As a workflow the lane gets checkpointing, exponential backoff and a run
 * history in the dashboard, which is what turns "catalogues sometimes don't
 * update" into something diagnosable.
 *
 * Scope note: this wraps the lane, it does not decompose it. Splitting
 * download / OCR / parse / upsert into separate steps would checkpoint
 * *within* a catalogue and is the bigger win, but runCatalogueScout owns its
 * own lease and cursor, so pulling it apart is a change with its own failure
 * modes and belongs in its own piece of work.
 */

export interface CatalogueWorkflowParams {
  /** How many catalogues this run may claim. */
  limit?: number
}

export class CatalogueWorkflow extends WorkflowEntrypoint<
  TrolleyScoutEnv,
  CatalogueWorkflowParams
> {
  async run(
    event: WorkflowEvent<CatalogueWorkflowParams>,
    step: WorkflowStep,
  ): Promise<{ scannedDocumentCount: number }> {
    const limit = Math.max(1, Math.min(event.payload?.limit ?? 2, 6))

    const scanned = await step.do(
      'scan catalogues',
      {
        // A shop rate-limiting us is the usual failure, and hammering it makes
        // that worse — so back off rather than retry immediately.
        retries: { backoff: 'exponential', delay: '2 minutes', limit: 3 },
        timeout: '14 minutes',
      },
      async (): Promise<number> => {
        const leaflets = (await readLeafletSnapshot(this.env))?.leaflets ?? []
        const result = await runCatalogueScout(
          this.env,
          leaflets.slice(0, limit),
        )
        return result.scannedDocumentCount
      },
    )

    return { scannedDocumentCount: scanned }
  }
}
