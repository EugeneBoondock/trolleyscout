/**
 * Formatting for the admin console's member cards. Kept apart from the panel
 * so the component file exports only components, which is what React fast
 * refresh needs to work.
 */

/** A regional-indicator pair renders as the country's flag on every platform. */
export function countryFlag(code: string): string {
  const upper = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return '🏳️'
  return String.fromCodePoint(
    ...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  )
}

export function describeLastSeen(lastSeenAt?: string): string {
  if (!lastSeenAt) return 'never'
  const seenAt = Date.parse(lastSeenAt)
  if (!Number.isFinite(seenAt)) return 'never'

  const minutes = Math.max(0, Math.round((Date.now() - seenAt) / 60_000))
  if (minutes < 5) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`
  return lastSeenAt.slice(0, 10)
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'None yet'
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.round((seconds % 3_600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${Math.trunc(seconds)}s`
}
