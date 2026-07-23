import type { SupportMessage } from '../../src/types'
import type { TrolleyScoutEnv } from './env'
import { hasMemberStore } from './memberStore'
import {
  emailLookup,
  hasEmailProtection,
  isProtectedEmail,
  protectEmail,
  revealEmail,
} from './emailProtection'

// Support messages are written by the public Support page (members and
// signed-out visitors) and read only by the admin console. Keeping the data
// access here means the API route stays thin and the validation rules live in
// one place.

interface SupportMessageRow {
  id: string
  account_id: string | null
  name: string
  email: string
  email_lookup?: string | null
  topic: string
  message: string
  status: string
  admin_note: string | null
  created_at: string
  updated_at: string
}

export interface SupportMessageInput {
  accountId?: string
  name: string
  email: string
  topic: string
  message: string
}

const NAME_MAX = 120
const EMAIL_MAX = 200
const TOPIC_MAX = 80
const MESSAGE_MIN = 10
const MESSAGE_MAX = 4000

// A basic guard so the public endpoint cannot be flooded from one address.
const THROTTLE_WINDOW_MINUTES = 60
const THROTTLE_MAX_PER_WINDOW = 5

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createSupportMessage(
  env: TrolleyScoutEnv,
  input: SupportMessageInput,
): Promise<{ id: string } | { issues: string[] }> {
  if (!hasMemberStore(env)) {
    return { issues: ['Support is not available right now.'] }
  }

  const name = input.name?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  const topic = input.topic?.trim() ?? ''
  const message = input.message?.trim() ?? ''

  const issues: string[] = []

  if (!name || name.length > NAME_MAX) {
    issues.push('Please enter your name.')
  }

  if (!email || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    issues.push('Please enter a valid email address so we can reply.')
  }

  if (!topic || topic.length > TOPIC_MAX) {
    issues.push('Please choose a topic.')
  }

  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    issues.push(`Please describe the issue in ${MESSAGE_MIN}–${MESSAGE_MAX} characters.`)
  }

  if (issues.length > 0) {
    return { issues }
  }

  if (!hasEmailProtection(env)) {
    return { issues: ['Support is temporarily unavailable while account security is configured.'] }
  }

  const normalizedEmail = email.toLowerCase()
  const lookup = await emailLookup(env, normalizedEmail)

  const since = new Date(Date.now() - THROTTLE_WINDOW_MINUTES * 60 * 1000).toISOString()
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM support_messages
      WHERE (email_lookup = ? OR (email_lookup IS NULL AND email = ?)) AND created_at >= ?`,
  )
    .bind(lookup, normalizedEmail, since)
    .first<{ total: number }>()

  if ((recent?.total ?? 0) >= THROTTLE_MAX_PER_WINDOW) {
    return {
      issues: ['You have sent a few messages already. Please give us time to reply before sending more.'],
    }
  }

  const id = `support-${crypto.randomUUID()}`
  const timestamp = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO support_messages (
        id, account_id, name, email, email_lookup, topic, message, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  )
    .bind(
      id,
      input.accountId ?? null,
      name,
      await protectEmail(env, normalizedEmail),
      lookup,
      topic,
      message,
      timestamp,
      timestamp,
    )
    .run()

  return { id }
}

export async function listSupportMessages(
  env: TrolleyScoutEnv,
  limit = 100,
): Promise<SupportMessage[]> {
  if (!hasMemberStore(env)) {
    return []
  }

  // Open messages first so anything still needing a reply sits at the top, then
  // most recent within each status.
  const rows = await env.DB.prepare(
    `SELECT id, account_id, name, email, email_lookup, topic, message, status, admin_note, created_at, updated_at
      FROM support_messages
      ORDER BY (status = 'open') DESC, created_at DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all<SupportMessageRow>()

  return Promise.all(rows.results.map((row) => supportMessageFromRow(env, row)))
}

export async function countOpenSupportMessages(env: TrolleyScoutEnv): Promise<number> {
  if (!hasMemberStore(env)) {
    return 0
  }

  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM support_messages WHERE status = 'open'",
  ).first<{ total: number }>()

  return row?.total ?? 0
}

export async function setSupportMessageStatus(
  env: TrolleyScoutEnv,
  id: string,
  status: 'open' | 'resolved',
): Promise<{ ok: true } | { issues: string[] }> {
  if (!hasMemberStore(env)) {
    return { issues: ['Support is not available right now.'] }
  }

  const timestamp = new Date().toISOString()
  const result = await env.DB.prepare(
    'UPDATE support_messages SET status = ?, updated_at = ? WHERE id = ?',
  )
    .bind(status, timestamp, id)
    .run()

  if (!result.meta.changes) {
    return { issues: ['That support message was not found.'] }
  }

  return { ok: true }
}

async function supportMessageFromRow(env: TrolleyScoutEnv, row: SupportMessageRow): Promise<SupportMessage> {
  return {
    id: row.id,
    accountId: row.account_id ?? undefined,
    name: row.name,
    email: await revealEmail(env, row.email),
    topic: row.topic,
    message: row.message,
    status: row.status === 'resolved' ? 'resolved' : 'open',
    adminNote: row.admin_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function countPendingSupportEmailProtection(env: TrolleyScoutEnv): Promise<number> {
  if (!hasMemberStore(env)) return 0
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM support_messages
      WHERE email_lookup IS NULL OR email NOT LIKE 'enc:v1:%'`,
  ).first<{ total: number }>()
  return Number(row?.total ?? 0)
}

export async function protectLegacySupportEmails(
  env: TrolleyScoutEnv,
  limit = 500,
): Promise<{ protected: number; remaining: number }> {
  if (!hasMemberStore(env) || !hasEmailProtection(env)) {
    return { protected: 0, remaining: 0 }
  }

  const rows = await env.DB.prepare(
    `SELECT id, email FROM support_messages
      WHERE email_lookup IS NULL OR email NOT LIKE 'enc:v1:%'
      LIMIT ?`,
  ).bind(limit).all<{ email: string; id: string }>()

  // Compute every row's new (encrypted email, lookup hash) pair up front, then
  // submit all the UPDATEs in one D1 round trip instead of one per row.
  const updates = await Promise.all(rows.results.map(async (row) => {
    const email = await revealEmail(env, row.email)
    return {
      email: isProtectedEmail(row.email) ? row.email : await protectEmail(env, email),
      id: row.id,
      lookup: await emailLookup(env, email),
    }
  }))

  const timestamp = new Date().toISOString()
  const statements: D1PreparedStatement[] = updates.map((update) =>
    env.DB.prepare(
      'UPDATE support_messages SET email = ?, email_lookup = ?, updated_at = ? WHERE id = ?',
    ).bind(update.email, update.lookup, timestamp, update.id),
  )

  let protectedCount = 0
  if (statements.length > 0) {
    const results = await env.DB.batch(statements)
    protectedCount = results.filter((result) => result.meta.changes > 0).length
  }

  return {
    protected: protectedCount,
    remaining: await countPendingSupportEmailProtection(env),
  }
}
