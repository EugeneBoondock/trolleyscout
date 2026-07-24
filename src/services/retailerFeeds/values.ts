// Small parsing primitives shared by the online-storefront adapters. Every
// adapter still owns its own discount rules; only the boring "read a field out
// of an untyped payload" work lives here.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function recordValue(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const nested = value[key]
  return isRecord(nested) ? nested : undefined
}

export function arrayValue(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return []
  }

  const nested = value[key]
  return Array.isArray(nested) ? nested : []
}

export function textValue(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return ''
  }

  const nested = value[key]
  return typeof nested === 'string' || typeof nested === 'number'
    ? String(nested).trim()
    : ''
}

export function firstText(value: unknown, keys: readonly string[]): string {
  for (const key of keys) {
    const text = textValue(value, key)

    if (text) {
      return text
    }
  }

  return ''
}

export function integerValue(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const nested = Number(value[key])
  return Number.isSafeInteger(nested) ? nested : undefined
}

/**
 * Rand amount to whole cents. Accepts the numbers and the "R 2 699.00" style
 * strings that storefront payloads mix freely. Zero and negative amounts are
 * rejected because no adapter has a use for them.
 */
export function randToCents(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? centsOf(value) : undefined
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const cleaned = value.replace(/[^\d.,]/g, '')
  if (!cleaned) {
    return undefined
  }

  // "1 299,50" and "1,299.50" both mean the same amount: the last separator
  // followed by exactly two digits is the decimal point.
  const normalized = /[.,]\d{2}$/.test(cleaned)
    ? `${cleaned.slice(0, -3).replace(/[.,]/g, '')}.${cleaned.slice(-2)}`
    : cleaned.replace(/[.,]/g, '')
  const amount = Number(normalized)

  return Number.isFinite(amount) && amount > 0 ? centsOf(amount) : undefined
}

function centsOf(amount: number): number | undefined {
  const cents = Math.round(amount * 100)
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined
}

/**
 * Resolves a link against its storefront and keeps it only when it stays on
 * that retailer over https. Protocol-relative "//host/path" links resolve too.
 */
export function officialUrl(
  value: string,
  origin: string,
  allowedHosts: readonly string[],
): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value, origin)
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

/** "FOUGANZA" + "Kids' Jodhpurs" reads better than the bare product name. */
export function brandedTitle(brand: string, name: string): string {
  if (!brand || name.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase())) {
    return name
  }

  return `${brand} ${name}`.trim()
}

export function percentOffText(
  priceCents: number,
  previousPriceCents: number | undefined,
  quotedPercent?: number,
): string | undefined {
  if (
    typeof quotedPercent === 'number' &&
    Number.isFinite(quotedPercent) &&
    quotedPercent > 0
  ) {
    return `${Math.round(quotedPercent)}% off`
  }

  if (previousPriceCents === undefined || previousPriceCents <= priceCents) {
    return undefined
  }

  const percent = Math.round(
    ((previousPriceCents - priceCents) / previousPriceCents) * 100,
  )
  return percent > 0 ? `${percent}% off` : undefined
}

/**
 * End of a balanced `{...}` or `[...]` literal starting at `start`, skipping
 * over string contents. Returns -1 when the literal never closes.
 */
export function balancedLiteralEnd(value: string, start: number): number {
  let depth = 0
  let escaped = false
  let quoted = false

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]

    if (quoted) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        quoted = false
      }
      continue
    }

    if (character === '"') {
      quoted = true
    } else if (character === '{' || character === '[') {
      depth += 1
    } else if (character === '}' || character === ']') {
      depth -= 1
      if (depth === 0) {
        return index
      }
      if (depth < 0) {
        return -1
      }
    }
  }

  return -1
}
