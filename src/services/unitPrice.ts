// Pure unit-price comparison logic for the in-store pack checker.
// Runs fully client-side so the tool keeps working offline.

export type PackUnit = 'g' | 'kg' | 'ml' | 'l' | 'each'
export type BaseUnit = 'kg' | 'L' | 'each'

export interface PackDraft {
  id: string
  priceText: string
  quantityText: string
  unit: PackUnit
}

export interface PackResult {
  id: string
  priceCents: number
  quantity: number
  unit: PackUnit
  baseUnit: BaseUnit
  unitPriceCents: number
  isBest: boolean
  percentMoreThanBest?: number
}

export interface PackComparison {
  results: PackResult[]
  bestId?: string
  hasMixedUnits: boolean
}

const BASE_UNIT_BY_PACK_UNIT: Record<PackUnit, BaseUnit> = {
  g: 'kg',
  kg: 'kg',
  ml: 'L',
  l: 'L',
  each: 'each',
}

const BASE_UNIT_FACTOR: Record<PackUnit, number> = {
  g: 1000,
  kg: 1,
  ml: 1000,
  l: 1,
  each: 1,
}

export function parseRandsToCents(text: string): number | undefined {
  const cleaned = text.replace(/[rR]/g, '').replace(/\s/g, '').replace(',', '.').trim()

  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) {
    return undefined
  }

  const rands = Number.parseFloat(cleaned)

  if (!Number.isFinite(rands) || rands < 0) {
    return undefined
  }

  return Math.round(rands * 100)
}

export function parseQuantity(text: string): number | undefined {
  const cleaned = text.replace(/\s/g, '').replace(',', '.').trim()

  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) {
    return undefined
  }

  const quantity = Number.parseFloat(cleaned)

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return undefined
  }

  return quantity
}

export function compareUnitPrices(drafts: PackDraft[]): PackComparison {
  const parsed = drafts.flatMap((pack) => {
    const priceCents = parseRandsToCents(pack.priceText)
    const quantity = parseQuantity(pack.quantityText)

    if (priceCents === undefined || quantity === undefined) {
      return []
    }

    const baseUnit = BASE_UNIT_BY_PACK_UNIT[pack.unit]
    const baseQuantity = quantity / BASE_UNIT_FACTOR[pack.unit]

    return [
      {
        baseUnit,
        id: pack.id,
        priceCents,
        quantity,
        unit: pack.unit,
        unitPriceCents: Math.round(priceCents / baseQuantity),
      },
    ]
  })

  const baseUnits = new Set(parsed.map((pack) => pack.baseUnit))
  const hasMixedUnits = baseUnits.size > 1

  if (hasMixedUnits || parsed.length === 0) {
    return {
      hasMixedUnits,
      results: parsed.map((pack) => ({ ...pack, isBest: false })),
    }
  }

  const bestUnitPrice = Math.min(...parsed.map((pack) => pack.unitPriceCents))
  const best = parsed.find((pack) => pack.unitPriceCents === bestUnitPrice)

  const results = parsed.map((pack) => {
    const isBest = pack.id === best?.id

    return {
      ...pack,
      isBest,
      percentMoreThanBest:
        isBest || bestUnitPrice === 0
          ? undefined
          : Math.round(((pack.unitPriceCents - bestUnitPrice) / bestUnitPrice) * 100),
    }
  })

  return {
    bestId: best?.id,
    hasMixedUnits: false,
    results,
  }
}

export function formatRandsFromCents(cents: number): string {
  return new Intl.NumberFormat('en-ZA', {
    currency: 'ZAR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  })
    .format(cents / 100)
    .replace(/ /g, '')
}

export function formatUnitPrice(unitPriceCents: number, baseUnit: BaseUnit): string {
  const amount = `R${(unitPriceCents / 100).toFixed(2)}`

  if (baseUnit === 'each') {
    return `${amount} each`
  }

  return `${amount} / ${baseUnit}`
}
