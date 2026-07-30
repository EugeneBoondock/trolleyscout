import type {
  DiscoveredDeal,
  ScoutGroceryPlan,
  ScoutGroceryPlanItem,
} from '../../src/types'
import type { StoredDealItem } from './dealItemStore'

export type GroceryPlanKind = 'general' | 'meat' | 'vegetables' | 'vegan'

export interface GroceryPlanRequest {
  budgetCents?: number
  householdSize: number
  kind: GroceryPlanKind
  maxStores: number
}

type GroceryDeal = StoredDealItem | DiscoveredDeal

interface Candidate {
  currencyCode: string
  deal: GroceryDeal
  imageUrl?: string
  priceCents: number
  previousPriceText?: string
  priceText: string
  productUrl: string
  promotionText?: string
  retailerId: string
  retailerName: string
  sourceUrl: string
  title: string
}

interface GrocerySlot {
  label: string
  matches: (title: string) => boolean
}

const SLOT_SETS: Record<GroceryPlanKind, GrocerySlot[]> = {
  general: [
    slot('Rice, maize meal, pasta, or oats', /\b(rice|maize|pasta|oats?)\b/),
    slot('Bread', /\b(bread|loaf)\b/),
    slot('Milk', /\b(milk|maas)\b/),
    slot('Eggs', /\beggs?\b/),
    slot('Protein', /\b(chicken|beef|mince|fish|beans?|lentils?|tofu|soya)\b/),
    slot('Vegetables', /\b(tomato|potato|carrot|onion|spinach|cabbage|vegetable)\w*\b/),
  ],
  meat: [
    slot('Chicken', /\bchicken\b/),
    slot('Beef or mince', /\b(beef|mince)\b/),
    slot('Pork', /\b(pork|bacon|ham)\b/),
    slot('Fish', /\b(fish|hake|tuna|sardine)\w*\b/),
  ],
  vegetables: [
    slot('Tomatoes', /\btomato\w*\b/),
    slot('Potatoes', /\bpotato\w*\b/),
    slot('Carrots', /\bcarrot\w*\b/),
    slot('Onions', /\bonion\w*\b/),
  ],
  vegan: [
    slot('Staple', /\b(rice|maize|pasta|oats?|bread)\b/),
    slot('Beans or lentils', /\b(beans?|lentils?|chickpeas?)\b/),
    slot('Vegetables', /\b(tomato|potato|carrot|onion|spinach|cabbage|vegetable)\w*\b/),
    slot('Plant protein', /\b(tofu|soya|soy|tempeh|plant protein)\b/),
  ],
}

const NON_VEGAN =
  /\b(beef|chicken|pork|bacon|ham|fish|tuna|sardine|milk|cheese|yogh?urt|butter|cream|eggs?|honey)\b/

export function parseGroceryPlanRequest(
  message: string,
): GroceryPlanRequest | undefined {
  const normalized = message.normalize('NFKC').toLowerCase()
  const isPlan = (
    /\b(grocery|shopping)\s+list\b/.test(normalized) ||
    /\bmeal\s+plan\b/.test(normalized) ||
    /\b(?:create|build|make|plan|add)\b[\s\S]{0,40}\b(?:grocer|vegan|meat|vegetable)\w*\b/.test(normalized) ||
    /\bcheapest\b[\s\S]{0,30}\b(?:grocer|vegan|meat|vegetable)\w*\b/.test(normalized)
  )
  if (!isPlan) return undefined

  const kind: GroceryPlanKind = /\bvegan\b/.test(normalized)
    ? 'vegan'
    : /\b(meat|chicken|beef|pork|fish)\b/.test(normalized)
      ? 'meat'
      : /\b(vegetables?|veggies|produce)\b/.test(normalized)
        ? 'vegetables'
        : 'general'
  const householdMatch =
    /\b(?:family|household)\s+of\s+(\d{1,2})\b/.exec(normalized) ??
    /\bfor\s+(\d{1,2})\s+(?:people|persons?|adults?)\b/.exec(normalized)
  const storeMatch =
    /\b(?:up\s+to|maximum|max|use)\s+(\d{1,2})\s+stores?\b/.exec(normalized)
  const budgetMatch =
    /\b(?:under|within|budget(?:\s+of)?|for)\s*(?:r|zar|\$|usd)\s*([\d\s.,]+)/i.exec(normalized)

  return {
    budgetCents: budgetMatch ? moneyToCents(budgetMatch[1]) : undefined,
    householdSize: boundedInteger(householdMatch?.[1], 1, 20, 2),
    kind,
    maxStores: boundedInteger(storeMatch?.[1], 1, 6, 3),
  }
}

export function buildGroceryPlan(
  message: string,
  deals: readonly GroceryDeal[],
  fallbackCurrencyCode: string,
): ScoutGroceryPlan {
  const request = parseGroceryPlanRequest(message) ?? {
    householdSize: 2,
    kind: 'general' as const,
    maxStores: 3,
  }
  const currencyCode = validCurrency(fallbackCurrencyCode)
  const candidates = normalizeCandidates(deals, currencyCode)
    .filter((candidate) =>
      request.kind !== 'vegan' || !NON_VEGAN.test(normalize(candidate.title)),
    )
  const slots = SLOT_SETS[request.kind]
  const selected: Array<{ candidate: Candidate; slot: GrocerySlot }> = []
  const remaining = new Set(slots)
  const usedDealIds = new Set<string>()
  const selectedStores = new Set<string>()

  while (remaining.size > 0 && selectedStores.size < request.maxStores) {
    const storeOptions = new Map<string, Array<{ candidate: Candidate; slot: GrocerySlot }>>()
    for (const candidate of candidates) {
      if (selectedStores.has(candidate.retailerId)) continue
      for (const grocerySlot of remaining) {
        if (!grocerySlot.matches(normalize(candidate.title))) continue
        const storeRows = storeOptions.get(candidate.retailerId) ?? []
        const existing = storeRows.findIndex((row) => row.slot === grocerySlot)
        if (existing === -1 || candidate.priceCents < storeRows[existing].candidate.priceCents) {
          if (existing >= 0) storeRows.splice(existing, 1)
          storeRows.push({ candidate, slot: grocerySlot })
        }
        storeOptions.set(candidate.retailerId, storeRows)
      }
    }
    const bestStore = [...storeOptions.entries()].sort((a, b) =>
      b[1].length - a[1].length ||
      sum(a[1].map((row) => row.candidate.priceCents)) -
        sum(b[1].map((row) => row.candidate.priceCents)),
    )[0]
    if (!bestStore) break
    selectedStores.add(bestStore[0])
    for (const row of bestStore[1]) {
      const dealId = row.candidate.deal.id
      if (usedDealIds.has(dealId) || !remaining.has(row.slot)) continue
      usedDealIds.add(dealId)
      remaining.delete(row.slot)
      selected.push(row)
    }
  }

  const quantity = request.householdSize >= 5 ? 3 : request.householdSize >= 3 ? 2 : 1
  let items = selected.map(({ candidate, slot: grocerySlot }): ScoutGroceryPlanItem => ({
    assumption: `${grocerySlot.label} for a household of ${request.householdSize}`,
    group: grocerySlot.label,
    id: candidate.deal.id,
    imageUrl: candidate.imageUrl,
    lineTotalCents: candidate.priceCents * quantity,
    lineTotalText: formatMoney(candidate.priceCents * quantity, candidate.currencyCode),
    previousPriceText: candidate.previousPriceText,
    priceText: candidate.priceText,
    productUrl: candidate.productUrl,
    promotionText: candidate.promotionText,
    quantity,
    retailerId: candidate.retailerId,
    retailerName: candidate.retailerName,
    sourceUrl: candidate.sourceUrl,
    title: candidate.title,
    unitPriceCents: candidate.priceCents,
  }))
  const tradeOffs: string[] = []
  if (request.budgetCents !== undefined) {
    while (
      items.length > 1 &&
      sum(items.map((item) => item.lineTotalCents)) > request.budgetCents
    ) {
      const removed = [...items].sort((a, b) => b.lineTotalCents - a.lineTotalCents)[0]
      items = items.filter((item) => item.id !== removed.id)
      remaining.add(slots.find((grocerySlot) => grocerySlot.label === removed.group)!)
    }
    if (sum(items.map((item) => item.lineTotalCents)) > request.budgetCents) {
      tradeOffs.push('The cheapest available essentials are above the stated budget.')
    } else {
      tradeOffs.push('Higher-priced groups were left out to stay within the stated budget.')
    }
  }
  if (selectedStores.size > 1) {
    tradeOffs.push(
      `${selectedStores.size} stores are used because one store did not cover every selected group.`,
    )
  }

  const totalCents = sum(items.map((item) => item.lineTotalCents))
  const itemStoreCount = new Set(items.map((item) => item.retailerId)).size
  return {
    assumptions: [
      `${request.householdSize} people`,
      'One planning period',
      'Current in-stock prices only',
      `No more than ${request.maxStores} stores`,
    ],
    currencyCode,
    items,
    maxStores: request.maxStores,
    missingItems: [...remaining].map((grocerySlot) => grocerySlot.label),
    storeCount: itemStoreCount,
    subtotalCents: totalCents,
    subtotalText: formatMoney(totalCents, currencyCode),
    totalCents,
    totalText: formatMoney(totalCents, currencyCode),
    tradeOffs,
  }
}

function normalizeCandidates(
  deals: readonly GroceryDeal[],
  fallbackCurrency: string,
): Candidate[] {
  const seen = new Set<string>()
  return deals.flatMap((deal): Candidate[] => {
    if (
      ('status' in deal && deal.status !== 'active') ||
      deal.soldOut ||
      !isHttpUrl(deal.productUrl)
    ) return []
    const priceCents = 'priceCents' in deal
      ? deal.priceCents
      : moneyToCents(deal.priceText)
    if (!priceCents || priceCents <= 0) return []
    const retailerId = String(deal.retailerId)
    const duplicateKey = `${retailerId}|${normalizeVariant(deal.title)}|${priceCents}`
    if (seen.has(duplicateKey)) return []
    seen.add(duplicateKey)
    const currencyCode = 'currencyCode' in deal
      ? validCurrency(deal.currencyCode || fallbackCurrency)
      : currencyFromPrice(deal.priceText, fallbackCurrency)
    const previousPriceText = 'previousPriceCents' in deal
      ? deal.previousPriceCents === undefined
        ? undefined
        : formatMoney(deal.previousPriceCents, currencyCode)
      : 'previousPriceText' in deal
        ? deal.previousPriceText
        : undefined
    return [{
      currencyCode,
      deal,
      imageUrl: safeHttpUrl(deal.imageUrl),
      previousPriceText,
      priceCents,
      priceText: 'priceCents' in deal
        ? formatMoney(deal.priceCents, currencyCode)
        : deal.priceText ?? formatMoney(priceCents, currencyCode),
      productUrl: deal.productUrl,
      promotionText: deal.savingText ?? (previousPriceText
        ? `Was ${previousPriceText}`
        : undefined),
      retailerId,
      retailerName: 'retailerName' in deal
        ? deal.retailerName
        : humanizeRetailer(retailerId),
      sourceUrl: deal.sourceUrl,
      title: deal.title,
    }]
  })
}

function slot(label: string, pattern: RegExp): GrocerySlot {
  return { label, matches: (title) => pattern.test(title) }
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function normalizeVariant(value: string): string {
  return normalize(value).replace(/\b(\d+)\s+(kg|g|l|ml|pack)\b/g, '$1$2')
}

function moneyToCents(value: string | undefined): number | undefined {
  if (!value) return undefined
  const matches = value.match(/[\d][\d\s.,]*/g)
  const raw = matches?.at(-1)?.trim()
  if (!raw) return undefined
  const compact = raw.replace(/\s/g, '')
  let normalized = compact
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    normalized = compact.replace(/[.,]/g, '')
  } else if (compact.includes(',') && !compact.includes('.')) {
    normalized = compact.replace(',', '.')
  } else if (compact.includes(',') && compact.includes('.')) {
    const decimal = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.'
    normalized = compact
      .replaceAll(decimal === ',' ? '.' : ',', '')
      .replace(decimal, '.')
  }
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function currencyFromPrice(value: string | undefined, fallback: string): string {
  if (/\bUSD\b|US\$|\$/i.test(value ?? '')) return 'USD'
  if (/\bZWG\b/i.test(value ?? '')) return 'ZWG'
  if (/\bZAR\b|R\s*\d/i.test(value ?? '')) return 'ZAR'
  return validCurrency(fallback)
}

function formatMoney(cents: number, currencyCode: string): string {
  if (currencyCode === 'ZAR') return `R${(cents / 100).toFixed(2)}`
  return `${currencyCode} ${(cents / 100).toFixed(2)}`
}

function validCurrency(value: string): string {
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'ZAR'
}

function boundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function safeHttpUrl(value: string | undefined): string | undefined {
  return isHttpUrl(value) ? value : undefined
}

function humanizeRetailer(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
