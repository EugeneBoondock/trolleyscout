import {
  buildRetailerEvidence,
  isCatalogueWindowRelevant,
  retailerSlug,
} from './types'
import type {
  RetailerCatalogueRecord,
  RetailerDealScope,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import { officialUrl } from './values'

// Boxer publishes a leaflet per province rather than one national one, and the
// province page is served rendered, so a card carries everything needed: the
// leaflet's name, the dates it runs, its cover, and a link to the viewer.
//
// A leaflet is only published here once its dates have been read. Boxer leaves
// last month's card up alongside the current one, so a leaflet whose window
// cannot be read is dropped rather than shown — an out-of-date special is worse
// than no special, because a shopper travels for it.

export const BOXER_ORIGIN = 'https://www.boxer.co.za'

// The province slugs Boxer's own filter uses. eSwatini sits in the same list on
// their site, and their stores there are real, so it is swept alongside.
export const BOXER_PROVINCES = [
  'eastern-cape',
  'free-state',
  'gauteng',
  'kzn',
  'limpopo',
  'mpumalanga',
  'northern-cape',
  'north-west',
  'western-cape',
  'eswatini',
] as const

const BOXER_HOSTS = ['boxer.co.za', 'www.boxer.co.za']
const boxerRetailerId = retailerSlug('boxer')

// One card: a thumbnail, a heading, the validity line, then the viewer link.
const CARD_PATTERN =
  /<img[^>]+promotions-thumbnail[^>]+src="([^"]+)"[\s\S]{0,400}?<h4[^>]*>([\s\S]{0,120}?)<\/h4>[\s\S]{0,300}?Valid:\s*([\d/]{8,10})\s*-\s*([\d/]{8,10})[\s\S]{0,400}?href="([^"]*promotion_details\/[^"]+)"/gi

export function buildBoxerPromotionsUrl(province: string): string {
  return `${BOXER_ORIGIN}/promotions/${encodeURIComponent(province)}/all-divisions`
}

/// Reads Boxer's "23/07/2026" into an ISO date. Day first, which is how South
/// African leaflets are written and the opposite of how a bare Date would read
/// it, so it is parsed by hand rather than guessed at.
export function parseBoxerDate(value: string): string | undefined {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())

  if (!match) {
    return undefined
  }

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return undefined
  }

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // A date the calendar rejects — 31 February — round-trips to something else.
  return new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso ? iso : undefined
}

export function parseBoxerLeaflets(
  html: string,
  context: RetailerFeedContext,
  province: string,
): RetailerFeedPage {
  const scope: RetailerDealScope = { regionIds: [province], type: 'province' }
  const catalogues: RetailerCatalogueRecord[] = []
  const seen = new Set<string>()

  CARD_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = CARD_PATTERN.exec(html)) !== null) {
    const imageUrl = officialUrl(decodeEntities(match[1]), BOXER_ORIGIN, BOXER_HOSTS)
    const title = cleanText(match[2])
    const validFrom = parseBoxerDate(match[3])
    const validTo = parseBoxerDate(match[4])
    const documentUrl = officialUrl(decodeEntities(match[5]), BOXER_ORIGIN, BOXER_HOSTS)
    const catalogueId = match[5].split('/').pop()?.trim()

    if (
      !title ||
      !documentUrl ||
      !catalogueId ||
      seen.has(catalogueId) ||
      // Both dates are required. Boxer leaves a lapsed leaflet on the page
      // beside the current one, and a shopper who drives out for last month's
      // prices is worse served than one shown nothing.
      !validFrom ||
      !validTo ||
      !isCatalogueWindowRelevant({ capturedAt: context.capturedAt, validFrom, validTo })
    ) {
      continue
    }

    seen.add(catalogueId)

    catalogues.push({
      capturedAt: context.capturedAt,
      catalogueId,
      documentUrl,
      evidenceText: buildRetailerEvidence({
        promotionMarker: catalogueId,
        scope,
        sourceId: catalogueId,
        validFrom,
        validTo,
      }),
      format: 'pdf',
      imageUrl,
      retailerId: boxerRetailerId,
      scope,
      sourceUrl: context.sourceUrl,
      title,
      validFrom,
      validTo,
    })
  }

  return { candidates: [], catalogues }
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#8211;/gi, '–')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
}
