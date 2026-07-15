import type {
  DealActivity,
  DealActivityDraft,
  DealActivityEventType,
  DealLearningState,
} from '../../src/types'
import type { TrolleyScoutEnv } from './env'
import {
  buildActivitySignals,
  type DealInterestWeight,
  normalizeSearchTerm,
} from './dealLearning'
import { hasMemberStore } from './memberStore'

interface ActivityRow {
  created_at: string
  event_type: string
  id: string
  normalized_term: string | null
  retailer_id: string | null
  title: string | null
}

interface InterestRow {
  interest_key: string
  interest_type: string
  weight: number
}

const allowedEvents = new Set<DealActivityEventType>([
  'search_submitted',
  'deal_opened',
  'deal_saved',
  'basket_added',
  'retailer_opened',
])

export async function getDealLearningState(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
): Promise<DealLearningState> {
  if (!hasMemberStore(env) || !accountId) {
    return { activities: [], enabled: false }
  }

  const [preference, activity] = await Promise.all([
    env.DB.prepare(
      `SELECT deal_learning_enabled
        FROM member_preferences
        WHERE account_id = ?`,
    )
      .bind(accountId)
      .first<{ deal_learning_enabled: number }>(),
    env.DB.prepare(
      `SELECT id, event_type, normalized_term, title, retailer_id, created_at
        FROM member_deal_activity
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT 50`,
    )
      .bind(accountId)
      .all<ActivityRow>(),
  ])

  return {
    activities: activity.results.map(activityFromRow),
    enabled: preference?.deal_learning_enabled !== 0,
  }
}

export async function recordDealActivity(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  input: DealActivityDraft,
) {
  if (!hasMemberStore(env) || !accountId) {
    return { issues: ['Sign in before saving deal activity.'] }
  }

  if (!allowedEvents.has(input.eventType)) {
    return { issues: ['Choose a valid deal activity.'] }
  }

  const current = await getDealLearningState(env, accountId)
  if (!current.enabled) {
    return { state: current }
  }

  const normalizedTerm = normalizeSearchTerm(input.term ?? '')
  const title = compactText(input.title, 160)
  const retailerId = compactText(input.retailerId, 80)?.toLowerCase()
  const signals = buildActivitySignals({
    eventType: input.eventType,
    retailerId,
    term: normalizedTerm,
    title,
  })

  if (signals.length === 0) {
    return { issues: ['Activity needs a useful search, product, or retailer value.'] }
  }

  const id = `activity-${crypto.randomUUID()}`
  const timestamp = new Date().toISOString()
  const statements = [
    env.DB.prepare(
      `INSERT INTO member_deal_activity (
        id, account_id, event_type, normalized_term, title, retailer_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      accountId,
      input.eventType,
      normalizedTerm ?? null,
      title ?? null,
      retailerId ?? null,
      timestamp,
    ),
    ...signals.map((signal) => interestUpsert(env.DB, accountId, signal, timestamp)),
  ]

  await env.DB.batch(statements)
  return { state: await getDealLearningState(env, accountId) }
}

export async function setDealLearningEnabled(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  enabled: boolean,
) {
  if (!hasMemberStore(env) || !accountId) {
    return { issues: ['Sign in before changing deal learning.'] }
  }

  await env.DB.prepare(
    `INSERT INTO member_preferences (account_id, deal_learning_enabled, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        deal_learning_enabled = excluded.deal_learning_enabled,
        updated_at = excluded.updated_at`,
  )
    .bind(accountId, enabled ? 1 : 0, new Date().toISOString())
    .run()

  return { state: await getDealLearningState(env, accountId) }
}

export async function clearDealLearning(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
) {
  if (!hasMemberStore(env) || !accountId) {
    return { activities: [], enabled: false } satisfies DealLearningState
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM member_deal_activity WHERE account_id = ?').bind(accountId),
    env.DB.prepare('DELETE FROM member_interest_weights WHERE account_id = ?').bind(accountId),
  ])

  return getDealLearningState(env, accountId)
}

export async function deleteDealLearningActivity(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  activityId: string,
) {
  if (!hasMemberStore(env) || !accountId) {
    return { activities: [], enabled: false } satisfies DealLearningState
  }

  await env.DB.prepare(
    `DELETE FROM member_deal_activity
      WHERE account_id = ? AND id = ?`,
  )
    .bind(accountId, activityId)
    .run()
  await rebuildInterestWeights(env.DB, accountId)

  return getDealLearningState(env, accountId)
}

export async function listMemberInterestWeights(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
) {
  if (!hasMemberStore(env) || !accountId) {
    return []
  }

  const result = await env.DB.prepare(
    `SELECT interest_type, interest_key, weight
      FROM member_interest_weights
      WHERE account_id = ?
      ORDER BY weight DESC
      LIMIT 100`,
  )
    .bind(accountId)
    .all<InterestRow>()

  return result.results.flatMap<DealInterestWeight>((row) => {
    if (
      (row.interest_type !== 'term' && row.interest_type !== 'retailer') ||
      !Number.isFinite(row.weight)
    ) {
      return []
    }

    return [{
      interestKey: row.interest_key,
      interestType: row.interest_type,
      weight: row.weight,
    }]
  })
}

function activityFromRow(row: ActivityRow): DealActivity {
  return {
    createdAt: row.created_at,
    eventType: allowedEvents.has(row.event_type as DealActivityEventType)
      ? (row.event_type as DealActivityEventType)
      : 'search_submitted',
    id: row.id,
    retailerId: row.retailer_id ?? undefined,
    term: row.normalized_term ?? undefined,
    title: row.title ?? undefined,
  }
}

function interestUpsert(
  db: D1Database,
  accountId: string,
  signal: DealInterestWeight,
  timestamp: string,
) {
  return db.prepare(
    `INSERT INTO member_interest_weights (
      account_id, interest_type, interest_key, weight, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id, interest_type, interest_key) DO UPDATE SET
      weight = MIN(100, member_interest_weights.weight + excluded.weight),
      updated_at = excluded.updated_at`,
  ).bind(
    accountId,
    signal.interestType,
    signal.interestKey,
    signal.weight,
    timestamp,
  )
}

async function rebuildInterestWeights(db: D1Database, accountId: string) {
  const activity = await db.prepare(
    `SELECT id, event_type, normalized_term, title, retailer_id, created_at
      FROM member_deal_activity
      WHERE account_id = ?
      ORDER BY created_at ASC`,
  )
    .bind(accountId)
    .all<ActivityRow>()
  const timestamp = new Date().toISOString()
  const signals = activity.results.flatMap((row) =>
    buildActivitySignals({
      eventType: activityFromRow(row).eventType,
      retailerId: row.retailer_id ?? undefined,
      term: row.normalized_term ?? undefined,
      title: row.title ?? undefined,
    }),
  )

  await db.batch([
    db.prepare('DELETE FROM member_interest_weights WHERE account_id = ?').bind(accountId),
    ...signals.map((signal) => interestUpsert(db, accountId, signal, timestamp)),
  ])
}

function compactText(value: string | undefined, maximumLength: number) {
  const compact = value?.replace(/\s+/g, ' ').trim().slice(0, maximumLength).trim()
  return compact || undefined
}
