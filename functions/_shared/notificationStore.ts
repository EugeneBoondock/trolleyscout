// Per-member notification opt-ins. Stored server-side so the choice follows the
// member across devices and is the subscriber list a delivery worker reads.

import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

export interface NotificationPreferences {
  newDeals: boolean
}

const DEFAULTS: NotificationPreferences = { newDeals: false }

export async function getNotificationPreferences(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<NotificationPreferences> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { ...DEFAULTS }
  }

  try {
    const row = await env.DB.prepare(
      'SELECT new_deals FROM notification_preferences WHERE account_id = ?',
    )
      .bind(accountId)
      .first<{ new_deals: number }>()
    return { newDeals: row?.new_deals === 1 }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function setNotificationPreferences(
  env: TrolleyScoutEnv,
  accountId: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  if (!hasTrolleyScoutDatabase(env)) {
    return preferences
  }

  const now = new Date().toISOString()

  try {
    await env.DB.prepare(
      `INSERT INTO notification_preferences (account_id, new_deals, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET new_deals = excluded.new_deals, updated_at = excluded.updated_at`,
    )
      .bind(accountId, preferences.newDeals ? 1 : 0, now, now)
      .run()
  } catch {
    // Fall through and return the requested value; the next write retries.
  }

  return getNotificationPreferences(env, accountId)
}
