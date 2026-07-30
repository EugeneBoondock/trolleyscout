import type { MarketplaceProductQuery } from './marketplaceProductSearch'

const MAX_PRODUCT_NAME_LENGTH = 120
const MAX_PRODUCT_TERMS = 8

export type ScoutSearchIntentKind =
  | 'catalogue'
  | 'general'
  | 'personal'
  | 'product'
  | 'property'

export interface ScoutSearchIntent {
  kind: ScoutSearchIntentKind
  productName: string
  productTerms: string[]
  requestedPackGrams: number | null
  requestedPackText: string | null
  sort: 'price-asc' | 'relevance'
}

export const scoutSearchIntentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: {
      type: 'string',
      enum: ['catalogue', 'general', 'personal', 'product', 'property'],
    },
    productName: { type: 'string', maxLength: MAX_PRODUCT_NAME_LENGTH },
    productTerms: {
      type: 'array',
      items: { type: 'string', maxLength: 40 },
      maxItems: MAX_PRODUCT_TERMS,
    },
    requestedPackGrams: { type: ['integer', 'null'], minimum: 1 },
    requestedPackText: { type: ['string', 'null'], maxLength: 30 },
    sort: { type: 'string', enum: ['price-asc', 'relevance'] },
  },
  required: [
    'kind',
    'productName',
    'productTerms',
    'requestedPackGrams',
    'requestedPackText',
    'sort',
  ],
} as const

export function parseScoutSearchIntent(payload: unknown): ScoutSearchIntent {
  if (!isRecord(payload)) {
    throw new TypeError('Mr Scout returned no search intent.')
  }
  const parsed = JSON.parse(extractResponseText(payload)) as unknown
  if (!isRecord(parsed)) {
    throw new TypeError('Mr Scout returned an invalid search intent.')
  }

  const kinds: ScoutSearchIntentKind[] = [
    'catalogue',
    'general',
    'personal',
    'product',
    'property',
  ]
  const kind = typeof parsed.kind === 'string' &&
    kinds.includes(parsed.kind as ScoutSearchIntentKind)
    ? parsed.kind as ScoutSearchIntentKind
    : undefined
  const sort = parsed.sort === 'price-asc' || parsed.sort === 'relevance'
    ? parsed.sort
    : undefined
  if (!kind || !sort) {
    throw new TypeError('Mr Scout returned an invalid search intent.')
  }

  const productName = normalizedText(parsed.productName, MAX_PRODUCT_NAME_LENGTH)
  const productTerms = Array.isArray(parsed.productTerms)
    ? Array.from(new Set(
        parsed.productTerms
          .flatMap((term) => normalizedText(term, 40)
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/gu)
            .map(singularProductTerm))
          .filter((term) => term.length >= 2),
      )).slice(0, MAX_PRODUCT_TERMS)
    : []
  if (kind === 'product' && (!productName || productTerms.length === 0)) {
    throw new TypeError('Mr Scout returned a product intent without a product name.')
  }

  const requestedPackGrams = parsed.requestedPackGrams === null
    ? null
    : positiveInteger(parsed.requestedPackGrams)
  const requestedPackText = parsed.requestedPackText === null
    ? null
    : normalizedText(parsed.requestedPackText, 30) || null
  if (
    parsed.requestedPackGrams !== null &&
    requestedPackGrams === null
  ) {
    throw new TypeError('Mr Scout returned an invalid requested pack size.')
  }

  return {
    kind,
    productName,
    productTerms,
    requestedPackGrams,
    requestedPackText,
    sort,
  }
}

export function productQueryFromIntent(
  intent: ScoutSearchIntent,
): MarketplaceProductQuery | undefined {
  if (intent.kind !== 'product') return undefined
  return {
    productName: intent.productName,
    productTerms: intent.productTerms,
    ...(intent.requestedPackGrams === null
      ? {}
      : {
          requestedPackGrams: intent.requestedPackGrams,
          requestedPackText: intent.requestedPackText ?? undefined,
        }),
    sort: intent.sort,
  }
}

function extractResponseText(payload: Record<string, unknown>): string {
  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (!isRecord(content)) continue
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text
      }
      if (content.type === 'refusal' && typeof content.refusal === 'string') {
        throw new TypeError(content.refusal)
      }
    }
  }
  throw new TypeError('Mr Scout returned no search intent.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : ''
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null
}

function singularProductTerm(value: string): string {
  if (value.length > 4 && value.endsWith('ies')) {
    return `${value.slice(0, -3)}y`
  }
  if (
    value.length > 3 &&
    value.endsWith('s') &&
    !value.endsWith('ss')
  ) {
    return value.slice(0, -1)
  }
  return value
}
