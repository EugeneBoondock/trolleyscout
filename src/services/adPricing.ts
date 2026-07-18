// Advertising rate card. One honest formula, shared by the server (which sets
// the authoritative amount an advertiser is charged) and the client (which
// shows a live estimate as the advertiser drags the reach slider). Keeping the
// maths here — and mirrored byte-for-byte in mobile/lib/ad_pricing.dart — means
// the price the shopper sees is exactly the price PayFast collects.

export type AdPlacement = 'feed' | 'near_me'

export interface AdRateCard {
  currency: 'ZAR'
  perPersonCents: number
  minCents: number
  minReach: number
  maxReach: number
  reachOptions: number[]
  placements: Array<{ id: AdPlacement; label: string; multiplierPct: number }>
  provinces: string[]
}

// R0.08 per person reached, R100 minimum spend. Near-me placement carries a 20%
// premium because it reaches shoppers who are actively standing near a store.
const PER_PERSON_CENTS = 8
const MIN_CENTS = 10_000
const MIN_REACH = 500
const MAX_REACH = 100_000

const PLACEMENTS: AdRateCard['placements'] = [
  { id: 'feed', label: 'Deals feed', multiplierPct: 100 },
  { id: 'near_me', label: 'Near me', multiplierPct: 120 },
]

// South African provinces an advertiser may target. Empty province = national.
export const AD_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
]

export const adRateCard: AdRateCard = {
  currency: 'ZAR',
  maxReach: MAX_REACH,
  minCents: MIN_CENTS,
  minReach: MIN_REACH,
  perPersonCents: PER_PERSON_CENTS,
  placements: PLACEMENTS,
  provinces: AD_PROVINCES,
  reachOptions: [1_000, 2_500, 5_000, 10_000, 25_000],
}

export function isValidAdPlacement(value: unknown): value is AdPlacement {
  return value === 'feed' || value === 'near_me'
}

export function isValidAdProvince(value: unknown): boolean {
  return typeof value === 'string' && AD_PROVINCES.includes(value)
}

export function clampReach(reach: number): number {
  if (!Number.isFinite(reach)) {
    return MIN_REACH
  }

  return Math.min(MAX_REACH, Math.max(MIN_REACH, Math.round(reach)))
}

// The one source of truth for what an ad costs. Always returns an integer number
// of cents that is at least the minimum spend.
export function computeAdPriceCents(input: { reach: number; placement: AdPlacement }): number {
  const reach = clampReach(input.reach)
  const placement = PLACEMENTS.find((option) => option.id === input.placement) ?? PLACEMENTS[0]
  const raw = Math.round((reach * PER_PERSON_CENTS * placement.multiplierPct) / 100)

  return Math.max(MIN_CENTS, raw)
}

export function formatRandFromCents(cents: number): string {
  const amount = cents / 100
  return `R${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`
}
