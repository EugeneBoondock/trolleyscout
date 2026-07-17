import { retailerById, retailers } from '../data/retailers'
import type { OfferDraft, OfferValidationIssue, OfferValidationResult, VerifiedOffer } from '../types'

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

export function validateOfferDraft(
  draft: OfferDraft,
  options: {
    now?: Date
  } = {},
): OfferValidationResult {
  const now = options.now ?? new Date()
  const issues: OfferValidationIssue[] = []
  const retailer = retailerById.get(draft.retailerId)

  if (!retailer) {
    issues.push({
      field: 'retailerId',
      message: 'Choose a supported retailer.',
      severity: 'error',
    })
  }

  if (draft.title.trim().length < 3) {
    issues.push({
      field: 'title',
      message: 'Add the offer title exactly as the source shows it.',
      severity: 'error',
    })
  }

  const sourceUrl = parseHttpsUrl(draft.sourceUrl)

  if (!sourceUrl) {
    issues.push({
      field: 'sourceUrl',
      message: 'Use a valid HTTPS source URL.',
      severity: 'error',
    })
  } else if (retailer && !isRetailerSourceUrl(draft.sourceUrl, retailer.sources.map((source) => source.url))) {
    issues.push({
      field: 'sourceUrl',
      message: 'The URL must belong to the selected retailer source list.',
      severity: 'error',
    })
  }

  const capturedAt = parseDate(draft.capturedAt)

  if (!capturedAt) {
    issues.push({
      field: 'capturedAt',
      message: 'Capture date must use YYYY-MM-DD.',
      severity: 'error',
    })
  } else if (capturedAt.getTime() > startOfDay(now).getTime()) {
    issues.push({
      field: 'capturedAt',
      message: 'Capture date cannot be in the future.',
      severity: 'error',
    })
  }

  const validFrom = draft.validFrom ? parseDate(draft.validFrom) : undefined
  const validTo = draft.validTo ? parseDate(draft.validTo) : undefined

  if (!draft.validFrom) {
    issues.push({
      field: 'validFrom',
      message: 'Add the start date before publishing this row.',
      severity: 'error',
    })
  } else if (!validFrom) {
    issues.push({
      field: 'validFrom',
      message: 'Start date must use YYYY-MM-DD.',
      severity: 'error',
    })
  }

  if (!draft.validTo) {
    issues.push({
      field: 'validTo',
      message: 'Add the expiry date before publishing this row.',
      severity: 'error',
    })
  } else if (!validTo) {
    issues.push({
      field: 'validTo',
      message: 'End date must use YYYY-MM-DD.',
      severity: 'error',
    })
  }

  if (validFrom && validTo && validTo.getTime() < validFrom.getTime()) {
    issues.push({
      field: 'validTo',
      message: 'End date must be after the start date.',
      severity: 'error',
    })
  }

  if (draft.priceText.trim().length < 2) {
    issues.push({
      field: 'priceText',
      message: 'Paste the price text from the retailer page.',
      severity: 'error',
    })
  }

  if (!draft.termsText.trim()) {
    issues.push({
      field: 'termsText',
      message: 'Add terms, loyalty rules, or a short source note.',
      severity: 'error',
    })
  }

  if (!draft.savingText?.trim()) {
    issues.push({
      field: 'savingText',
      message: 'Saving text is optional, but add it only if the source says it.',
      severity: 'warning',
    })
  }

  const accepted = issues.every((issue) => issue.severity !== 'error')

  return {
    accepted,
    issues,
    normalizedOffer: accepted
      ? normalizeOffer(draft, sourceUrl?.toString() ?? draft.sourceUrl)
      : undefined,
  }
}

export function isRetailerSourceUrl(candidateUrl: string, sourceUrls: string[]) {
  const candidate = parseHttpsUrl(candidateUrl)

  if (!candidate) {
    return false
  }

  return sourceUrls.some((sourceUrl) => {
    const source = parseHttpsUrl(sourceUrl)

    if (!source) {
      return false
    }

    return candidate.hostname === source.hostname || candidate.hostname.endsWith(`.${source.hostname}`)
  })
}

export function getSupportedRetailerIds() {
  return retailers.map((retailer) => retailer.id)
}

function normalizeOffer(draft: OfferDraft, sourceUrl: string): VerifiedOffer {
  return {
    capturedAt: draft.capturedAt,
    id: `${draft.retailerId}-${stableHash([
      draft.title,
      sourceUrl,
      draft.capturedAt,
      draft.priceText,
    ].join('|'))}`,
    // Optional; kept only when it is a real HTTPS URL, never an error.
    imageUrl: draft.imageUrl ? parseHttpsUrl(draft.imageUrl)?.toString() : undefined,
    priceText: draft.priceText.trim(),
    retailerId: draft.retailerId,
    savingText: draft.savingText?.trim() || undefined,
    sourceUrl,
    termsText: draft.termsText.trim(),
    title: draft.title.trim(),
    validFrom: draft.validFrom || undefined,
    validTo: draft.validTo || undefined,
  }
}

function parseHttpsUrl(value: string) {
  try {
    const url = new URL(value)

    return url.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

function parseDate(value: string) {
  if (!isoDatePattern.test(value)) {
    return undefined
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)

  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function stableHash(value: string) {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}
