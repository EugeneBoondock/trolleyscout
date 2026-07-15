import type { DiscoveredDeal, StoreLeaflet } from '../../src/types'
import type { TrolleyScoutEnv } from './env'

export interface DealSnapshot {
  checkedAt: string
  deals: DiscoveredDeal[]
}

export interface LeafletSnapshot {
  checkedAt: string
  leaflets: StoreLeaflet[]
}

// Leaflets share the snapshot table under a reserved key; they carry no
// per-source rows, so a single row holds the whole current set.
const LEAFLET_SNAPSHOT_KEY = '__leaflets__'

interface SnapshotRow {
  source_key: string
  checked_at: string
  deals_json: string
}

export function snapshotKey(retailerId: string, sourceLabel: string) {
  return `${retailerId}::${sourceLabel}`
}

function hasSnapshotStore(env: TrolleyScoutEnv): env is TrolleyScoutEnv & { DB: D1Database } {
  return Boolean(env.DB)
}

export async function readDealSnapshots(env: TrolleyScoutEnv): Promise<Map<string, DealSnapshot>> {
  const snapshots = new Map<string, DealSnapshot>()

  if (!hasSnapshotStore(env)) {
    return snapshots
  }

  try {
    const result = await env.DB.prepare(
      'SELECT source_key, checked_at, deals_json FROM deal_snapshots',
    ).all<SnapshotRow>()

    for (const row of result.results) {
      if (row.source_key === LEAFLET_SNAPSHOT_KEY) {
        continue
      }

      try {
        const deals = JSON.parse(row.deals_json) as DiscoveredDeal[]

        if (Array.isArray(deals) && deals.length > 0) {
          snapshots.set(row.source_key, { checkedAt: row.checked_at, deals })
        }
      } catch {
        // A corrupt snapshot row should never break live discovery.
      }
    }
  } catch {
    // Missing table (migration not applied) degrades to live-only behaviour.
  }

  return snapshots
}

export async function saveDealSnapshots(
  env: TrolleyScoutEnv,
  entries: Array<{
    retailerId: string
    sourceLabel: string
    checkedAt: string
    deals: DiscoveredDeal[]
  }>,
): Promise<void> {
  if (!hasSnapshotStore(env) || entries.length === 0) {
    return
  }

  try {
    const statement = env.DB.prepare(
      `INSERT INTO deal_snapshots (source_key, retailer_id, source_label, checked_at, deals_json, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (source_key) DO UPDATE SET
          checked_at = excluded.checked_at,
          deals_json = excluded.deals_json,
          updated_at = CURRENT_TIMESTAMP`,
    )

    await env.DB.batch(
      entries.map((entry) =>
        statement.bind(
          snapshotKey(entry.retailerId, entry.sourceLabel),
          entry.retailerId,
          entry.sourceLabel,
          entry.checkedAt,
          JSON.stringify(entry.deals),
        ),
      ),
    )
  } catch {
    // Snapshot writes are best-effort; the live response already succeeded.
  }
}

export async function readLeafletSnapshot(env: TrolleyScoutEnv): Promise<LeafletSnapshot | undefined> {
  if (!hasSnapshotStore(env)) {
    return undefined
  }

  try {
    const row = await env.DB.prepare(
      'SELECT checked_at, deals_json FROM deal_snapshots WHERE source_key = ?',
    )
      .bind(LEAFLET_SNAPSHOT_KEY)
      .first<{ checked_at: string; deals_json: string }>()

    if (!row) {
      return undefined
    }

    const leaflets = JSON.parse(row.deals_json) as StoreLeaflet[]

    return Array.isArray(leaflets) && leaflets.length > 0
      ? { checkedAt: row.checked_at, leaflets }
      : undefined
  } catch {
    return undefined
  }
}

export async function saveLeafletSnapshot(
  env: TrolleyScoutEnv,
  leaflets: StoreLeaflet[],
  checkedAt: string,
): Promise<void> {
  if (!hasSnapshotStore(env) || leaflets.length === 0) {
    return
  }

  try {
    await env.DB.prepare(
      `INSERT INTO deal_snapshots (source_key, retailer_id, source_label, checked_at, deals_json, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (source_key) DO UPDATE SET
          checked_at = excluded.checked_at,
          deals_json = excluded.deals_json,
          updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(LEAFLET_SNAPSHOT_KEY, LEAFLET_SNAPSHOT_KEY, 'all', checkedAt, JSON.stringify(leaflets))
      .run()
  } catch {
    // Best-effort.
  }
}
