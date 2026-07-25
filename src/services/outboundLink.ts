// Tags a link out to a shop so the shop can see the visit came from here.
//
// It is the ordinary courtesy of the web — a retailer reading their own
// analytics should be able to tell that a shopper arrived through Trolley
// Scout — and it is what makes the traffic we send legible enough to be worth
// something in a conversation with them later.

export const REFERRAL_SOURCE = 'trolleyscout.co.za'

const REFERRAL_PARAM = 'utm_source'

// Our own pages. Tagging a link back to ourselves would credit us with sending
// ourselves traffic, which tells nobody anything.
const OWN_HOSTS = ['trolleyscout.co.za', 'www.trolleyscout.co.za', 'org.trolleyscout.co.za']

/// Adds our referral tag to an outbound shop link.
///
/// Returns the address unchanged rather than throwing when it cannot be tagged,
/// so a link that would have worked is never broken by this — the tag is a
/// courtesy, and the shopper getting where they were going is the point.
export function withReferralSource(value: string | undefined | null): string | undefined {
  const raw = value?.trim()

  if (!raw) {
    return undefined
  }

  let url: URL

  try {
    url = new URL(raw)
  } catch {
    return raw
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return raw
  }

  const host = url.hostname.toLowerCase()

  if (OWN_HOSTS.includes(host)) {
    return raw
  }

  // A retailer's own campaign tag is left exactly as it is. Those links are how
  // they measure their own spend, and overwriting one would quietly take credit
  // for a visit somebody else paid for.
  if (url.searchParams.has(REFERRAL_PARAM)) {
    return raw
  }

  url.searchParams.set(REFERRAL_PARAM, REFERRAL_SOURCE)

  return url.toString()
}
