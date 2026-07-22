// Picks the deals with the largest real rand saving for the dashboard's
// "today's top savings" strip — the fastest possible answer to "is there
// anything worth opening the app for today?".

import type { DiscoveredDeal } from '../types'
import { meaningfulWasPrice } from './priceDisplay'

export function topSavingsDeals(deals: DiscoveredDeal[], limit = 3): DiscoveredDeal[] {
  return deals
    .map((deal) => ({ deal, savingCents: savedCents(deal) }))
    .filter((entry) => entry.savingCents > 0)
    .sort((left, right) => right.savingCents - left.savingCents)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.deal)
}

function savedCents(deal: DiscoveredDeal): number {
  const was = randToCents(meaningfulWasPrice(deal.previousPriceText, deal.priceText))
  const price = randToCents(deal.priceText)
  if (was === undefined || price === undefined) {
    return 0
  }
  return was - price
}

function randToCents(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }
  const match = /(\d+(?:[.,]\d{1,2})?)/.exec(value.replace(/\s+/g, ''))
  if (!match) {
    return undefined
  }
  const amount = Number(match[1].replace(',', '.'))
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}
