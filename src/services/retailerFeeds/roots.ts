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

// Roots Butchery runs 175 stores off one national month-end leaflet, published
// as a heading followed by a link to the PDF:
//
//   <h2>National Month End Specials 24th July - 6th August 2026</h2>
//   <a href=".../Roots_Butchery_July_National_Month_End_compressed.pdf">
//
// The dates live in that heading and nowhere else, written the way a person
// would say them. They are read before anything is published, because the page
// keeps last month's heading until the new one replaces it, and a leaflet that
// has run out is worse than none: a shopper travels for it.

export const ROOTS_ORIGIN = 'https://rootsbutchery.co.za'
export const ROOTS_SPECIALS_URL = `${ROOTS_ORIGIN}/specials/`

const ROOTS_HOSTS = ['rootsbutchery.co.za', 'www.rootsbutchery.co.za']
const rootsRetailerId = retailerSlug('roots-butchery')
const rootsScope: RetailerDealScope = { type: 'national' }

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// "24th July - 6th August 2026", and the hyphen may arrive as an en dash.
const RANGE_PATTERN =
  /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*(?:\d{4})?\s*[-–—]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})/i

const HEADING_PATTERN = /<h[12][^>]*>([\s\S]{0,200}?)<\/h[12]>/gi
const PDF_PATTERN = /href="([^"]+\.pdf)"/gi

export interface RootsLeafletWindow {
  title: string
  validFrom: string
  validTo: string
}

/// Reads "24th July - 6th August 2026" into the two dates it names.
///
/// Only the closing year is written, so the opening date borrows it — and when
/// that would put the start after the end, the leaflet runs over New Year and
/// the start belongs to the year before.
export function parseRootsWindow(heading: string): RootsLeafletWindow | undefined {
  const match = RANGE_PATTERN.exec(heading)

  if (!match) {
    return undefined
  }

  const fromMonth = MONTHS.indexOf(match[2].toLowerCase())
  const toMonth = MONTHS.indexOf(match[4].toLowerCase())
  const year = Number(match[5])

  if (fromMonth < 0 || toMonth < 0) {
    return undefined
  }

  const fromYear = fromMonth > toMonth ? year - 1 : year
  const validFrom = isoDate(fromYear, fromMonth + 1, Number(match[1]))
  const validTo = isoDate(year, toMonth + 1, Number(match[3]))

  if (!validFrom || !validTo) {
    return undefined
  }

  return { title: heading.replace(/\s+/g, ' ').trim(), validFrom, validTo }
}

export function parseRootsLeaflets(
  html: string,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const catalogues: RetailerCatalogueRecord[] = []
  const headings: RootsLeafletWindow[] = []

  HEADING_PATTERN.lastIndex = 0
  let heading: RegExpExecArray | null

  while ((heading = HEADING_PATTERN.exec(html)) !== null) {
    const window = parseRootsWindow(stripTags(heading[1]))

    if (window) {
      headings.push(window)
    }
  }

  PDF_PATTERN.lastIndex = 0
  const documents: string[] = []
  let pdf: RegExpExecArray | null

  while ((pdf = PDF_PATTERN.exec(html)) !== null) {
    const url = officialUrl(pdf[1], ROOTS_ORIGIN, ROOTS_HOSTS)

    if (url && !documents.includes(url)) {
      documents.push(url)
    }
  }

  // Each heading owns the PDF published under it, so they are paired in order.
  // A heading with no document, or a document with no dated heading above it,
  // is left alone rather than guessed at.
  for (const [index, window] of headings.entries()) {
    const documentUrl = documents[index]

    if (
      !documentUrl ||
      !isCatalogueWindowRelevant({
        capturedAt: context.capturedAt,
        validFrom: window.validFrom,
        validTo: window.validTo,
      })
    ) {
      continue
    }

    const catalogueId = documentUrl.split('/').pop() ?? window.title

    catalogues.push({
      capturedAt: context.capturedAt,
      catalogueId,
      documentUrl,
      evidenceText: buildRetailerEvidence({
        promotionMarker: catalogueId,
        scope: rootsScope,
        sourceId: catalogueId,
        validFrom: window.validFrom,
        validTo: window.validTo,
      }),
      format: 'pdf',
      retailerId: rootsRetailerId,
      scope: rootsScope,
      sourceUrl: context.sourceUrl,
      title: window.title,
      validFrom: window.validFrom,
      validTo: window.validTo,
    })
  }

  return { candidates: [], catalogues }
}

function isoDate(year: number, month: number, day: number): string | undefined {
  if (day < 1 || day > 31 || month < 1 || month > 12 || !Number.isFinite(year)) {
    return undefined
  }

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // A day the calendar does not have rolls into the next month, so it is only
  // accepted when it survives the round trip.
  return new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso ? iso : undefined
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&#8211;/gi, '–').replace(/&nbsp;/gi, ' ')
}
