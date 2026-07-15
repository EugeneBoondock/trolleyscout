import type {
  DealActivityDraft,
  DealActivityEventType,
  DiscoveredDeal,
} from '../../src/types'

export interface DealInterestWeight {
  interestKey: string
  interestType: 'term' | 'retailer'
  weight: number
}

const actionWeights: Record<DealActivityEventType, number> = {
  basket_added: 6,
  deal_opened: 2,
  deal_saved: 4,
  retailer_opened: 2,
  search_submitted: 1,
}

const ignoredTerms = new Set([
  'and',
  'for',
  'from',
  'pack',
  'special',
  'the',
  'with',
])

export function normalizeSearchTerm(value: string) {
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()

  return normalized.length >= 3 ? normalized : undefined
}

export function buildActivitySignals(input: DealActivityDraft): DealInterestWeight[] {
  const weight = actionWeights[input.eventType]
  const signals = new Map<string, DealInterestWeight>()
  const normalizedText = normalizeSearchTerm(input.term ?? input.title ?? '')

  if (normalizedText) {
    for (const term of normalizedText.split(' ')) {
      if (term.length < 3 || ignoredTerms.has(term)) {
        continue
      }

      signals.set(`term:${term}`, {
        interestKey: term,
        interestType: 'term',
        weight,
      })
    }
  }

  const retailerId = normalizeSearchTerm(input.retailerId ?? '')

  if (retailerId) {
    signals.set(`retailer:${retailerId}`, {
      interestKey: retailerId,
      interestType: 'retailer',
      weight,
    })
  }

  return Array.from(signals.values())
}

export function rankDealsForMember(
  deals: DiscoveredDeal[],
  interests: DealInterestWeight[],
) {
  if (interests.length === 0) {
    return deals
  }

  return deals
    .map((deal, index) => {
      const title = normalizeSearchTerm(deal.title) ?? deal.title.toLowerCase()
      const retailerId = normalizeSearchTerm(deal.retailerId) ?? deal.retailerId.toLowerCase()
      let score = 0
      let strongest: DealInterestWeight | undefined

      for (const interest of interests) {
        const matches =
          interest.interestType === 'retailer'
            ? retailerId === interest.interestKey
            : title.includes(interest.interestKey)

        if (!matches) {
          continue
        }

        score += interest.weight
        if (!strongest || interest.weight > strongest.weight) {
          strongest = interest
        }
      }

      return {
        deal:
          score > 0 && strongest
            ? {
                ...deal,
                personalizationReason: reasonForInterest(strongest),
              }
            : deal,
        index,
        score,
      }
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.deal)
}

function reasonForInterest(interest: DealInterestWeight) {
  return interest.interestType === 'retailer'
    ? `Based on your ${interest.interestKey} store interest`
    : `Based on your ${interest.interestKey} interest`
}
