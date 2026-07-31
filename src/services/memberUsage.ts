/**
 * Counts what a shopper opens, for the admin console.
 *
 * Deliberately separate from recordDealActivity, which feeds deal
 * personalisation and only records for members who opted into it. An
 * operational count of how much someone uses the app must not depend on a
 * personalisation choice, and this sends no titles, terms or product ids —
 * only which surface was opened.
 */

export type UsageMetric =
  | 'deal_view'
  | 'property_view'
  | 'voucher_view'
  | 'window_shopping_seconds'

/**
 * The same deal opened twice in a session counts once. Without this, a shopper
 * flicking back and forth through a catalogue inflates the number until it
 * says nothing.
 */
const seenThisSession = new Set<string>()

export function recordUsage(metric: UsageMetric, key?: string, amount = 1): void {
  if (key) {
    const identity = `${metric}:${key}`
    if (seenThisSession.has(identity)) return
    seenThisSession.add(identity)
  }

  const payload = JSON.stringify({ amount, metric })

  // Most of these fire as the shopper leaves for a retailer, so the beacon is
  // preferred: it survives the navigation that would cancel a fetch.
  const beacon = globalThis.navigator?.sendBeacon
  if (typeof beacon === 'function') {
    try {
      const sent = beacon.call(
        globalThis.navigator,
        '/api/member-usage',
        new Blob([payload], { type: 'application/json' }),
      )
      if (sent) return
    } catch {
      // Falls through to fetch below.
    }
  }

  // Fire and forget: a counter must never delay or fail what the shopper
  // asked for.
  void fetch('/api/member-usage', {
    body: payload,
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).catch(() => undefined)
}

/**
 * Reports time spent on a surface, in whole seconds. Bursts under five seconds
 * are dropped — passing through a tab is not time spent on it.
 */
export function recordDwellSeconds(metric: UsageMetric, seconds: number): void {
  const whole = Math.trunc(seconds)
  if (!Number.isFinite(whole) || whole < 5) return
  recordUsage(metric, undefined, whole)
}

/** Clears the per-session de-duplication. Used when a different member signs in. */
export function resetUsageSession(): void {
  seenThisSession.clear()
}
