import { retailers } from '../data/retailers'
import { verifiedOffers } from '../data/verifiedOffers'
import { countSources, countVerifiedOffers, getSourceKinds } from '../services/sourceEngine'
import type { SourceSummary } from './contracts'

export const dataPolicy =
  'Offer rows require an official source URL, capture date, valid dates, price text, and terms.'

export function buildSourceSummary(): SourceSummary {
  return {
    retailerCount: retailers.length,
    sourceCount: countSources(retailers),
    verifiedOfferCount: countVerifiedOffers(verifiedOffers),
    sourceKinds: getSourceKinds(retailers),
    dataPolicy,
  }
}

export function getStaticRetailersPayload() {
  return {
    retailers,
    summary: buildSourceSummary(),
  }
}

export function getStaticOffersPayload() {
  return {
    offers: verifiedOffers,
    summary: buildSourceSummary(),
  }
}
