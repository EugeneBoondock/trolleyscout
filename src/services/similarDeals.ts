import { classifyDeal } from './dealCategories'
import type { DiscoveredDeal } from '../types'

const STOP_WORDS = new Set([
  'all', 'and', 'any', 'deal', 'each', 'for', 'from', 'offer', 'only', 'pack',
  'save', 'special', 'the', 'this', 'value', 'with',
])

export function findSimilarDeals(
  target: DiscoveredDeal,
  candidates: DiscoveredDeal[],
  limit = 4,
): DiscoveredDeal[] {
  const targetTokens = productTokens(target.title)
  const targetClass = classifyDeal(target.title, target.retailerId, {
    evidenceText: target.evidenceText,
    retailerName: target.retailerName,
    sourceLabel: target.sourceLabel,
    sourceUrl: target.sourceUrl,
  })

  return candidates
    .filter((candidate) => candidate.id !== target.id && !candidate.soldOut)
    .map((candidate, index) => {
      const candidateTokens = productTokens(candidate.title)
      const sharedTokens = [...targetTokens].filter((token) => candidateTokens.has(token)).length
      const candidateClass = classifyDeal(candidate.title, candidate.retailerId, {
        evidenceText: candidate.evidenceText,
        retailerName: candidate.retailerName,
        sourceLabel: candidate.sourceLabel,
        sourceUrl: candidate.sourceUrl,
      })
      const sameSubcategory = Boolean(
        targetClass.foodSubcategory &&
        targetClass.foodSubcategory === candidateClass.foodSubcategory,
      )
      if (sharedTokens === 0 && !sameSubcategory) return undefined
      return {
        candidate,
        index,
        score:
          sharedTokens * 5 +
          (sameSubcategory ? 4 : 0) +
          (targetClass.category === candidateClass.category ? 1 : 0) +
          (target.retailerId !== candidate.retailerId ? 1 : 0),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate)
}

function productTokens(value: string) {
  return new Set(value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))
}
