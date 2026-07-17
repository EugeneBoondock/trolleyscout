import { parseMassmartFeed } from './massmart'
import type { RetailerFeedContext, RetailerFeedPage } from './types'

const INITIAL_STATE_MARKER = 'window.__INITIAL_STATE__'
const MAX_HTML_BYTES = 6 * 1024 * 1024
const MAKRO_ORIGIN = 'https://www.makro.co.za'

export function decodeMakroInitialState(body: string): unknown {
  if (body.length > MAX_HTML_BYTES) {
    throw new RangeError('Makro response exceeded the decoder limit')
  }

  const markerIndex = body.indexOf(INITIAL_STATE_MARKER)
  const equalsIndex = markerIndex < 0
    ? -1
    : body.indexOf('=', markerIndex + INITIAL_STATE_MARKER.length)
  const objectStart = equalsIndex < 0 ? -1 : findNextNonWhitespace(body, equalsIndex + 1)

  if (objectStart < 0 || body[objectStart] !== '{') {
    throw new TypeError('Invalid Makro initial-state response')
  }

  const objectEnd = findBalancedObjectEnd(body, objectStart)
  if (objectEnd < 0) {
    throw new TypeError('Invalid Makro initial-state response')
  }

  try {
    const payload: unknown = JSON.parse(body.slice(objectStart, objectEnd + 1))
    if (!makroRoot(payload)) {
      throw new TypeError()
    }
    return payload
  } catch {
    throw new TypeError('Invalid Makro initial-state response')
  }
}

export function parseMakroFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const root = makroRoot(payload)
  if (!root) {
    throw new TypeError('Invalid Makro catalogue payload')
  }

  const products: Record<string, unknown>[] = []
  let totalCount = 0

  for (const slot of Object.values(root)) {
    const widget = recordValue(slot, 'widget')
    const data = recordValue(widget, 'data')
    const components = arrayValue(data, 'renderableComponents')

    for (const component of components) {
      const value = recordValue(component, 'value')
      if (value && (firstText(value, ['type']) === 'ProductSummaryValue' || recordValue(value, 'pricing'))) {
        totalCount += 1
      }
      const normalized = normalizeProduct(value)
      if (normalized) {
        products.push(normalized)
      }
    }
  }

  const page = parseMassmartFeed(
    { products },
    { ...context, retailerId: 'makro' },
  )

  return { ...page, totalCount }
}

function normalizeProduct(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined
  }

  const pricing = recordValue(value, 'pricing')
  const finalPrice = recordValue(pricing, 'finalPrice')
  const mrp = recordValue(pricing, 'mrp')
  const titles = recordValue(value, 'titles')
  const productAction = recordValue(value, 'productAction')
  const action = recordValue(productAction, 'action')
  const params = recordValue(action, 'params')
  const tracking = recordValue(productAction, 'tracking')
  const productId = firstText(value, ['id', 'itemId']) || firstText(params, ['productId'])
  const title = firstText(titles, ['title', 'newTitle']) || firstText(tracking, ['itemName'])
  const path = firstText(value, ['smartUrl', 'baseUrl'])
  const productUrl = officialMakroUrl(path)

  if (!productId || !title || !productUrl || !pricing) {
    return undefined
  }

  return {
    finalPrice: firstValue(finalPrice, ['value', 'decimalValue']),
    imageUrl: productImageUrl(value),
    mrp: firstValue(mrp, ['value', 'decimalValue']),
    productId,
    title,
    totalDiscount: firstValue(pricing, ['totalDiscount', 'discountAmount']),
    url: productUrl,
  }
}

function productImageUrl(product: Record<string, unknown>) {
  const media = recordValue(product, 'media')
  const images = arrayValue(media, 'images')

  for (const image of images) {
    const path = firstText(isRecord(image) ? image : undefined, ['url'])
    const url = publicUrl(
      path
        .replaceAll('{@width}', '416')
        .replaceAll('{@height}', '416')
        .replaceAll('{@quality}', '80'),
    )
    if (url) {
      return url
    }
  }

  return undefined
}

function officialMakroUrl(value: string) {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value, MAKRO_ORIGIN)
    const host = url.hostname.toLocaleLowerCase()
    if (host !== 'makro.co.za' && !host.endsWith('.makro.co.za')) {
      return undefined
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined
    }
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return undefined
  }
}

function publicUrl(value: string) {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value, MAKRO_ORIGIN)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined
    }
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return undefined
  }
}

function makroRoot(value: unknown) {
  const pageData = recordValue(value, 'pageDataV4')
  const page = recordValue(pageData, 'page')
  const data = recordValue(page, 'data')
  return recordValue(data, 'ROOT')
}

function findBalancedObjectEnd(value: string, start: number) {
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
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
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

function findNextNonWhitespace(value: string, start: number) {
  for (let index = start; index < value.length; index += 1) {
    if (!/\s/.test(value[index])) {
      return index
    }
  }
  return -1
}

function recordValue(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined
  }
  const nested = value[key]
  return isRecord(nested) ? nested : undefined
}

function arrayValue(value: unknown, key: string) {
  if (!isRecord(value)) {
    return []
  }
  const nested = value[key]
  return Array.isArray(nested) ? nested : []
}

function firstText(value: Record<string, unknown> | undefined, keys: string[]) {
  const candidate = firstValue(value, keys)
  return typeof candidate === 'string' || typeof candidate === 'number'
    ? String(candidate).trim()
    : ''
}

function firstValue(value: Record<string, unknown> | undefined, keys: string[]) {
  if (!value) {
    return undefined
  }
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) {
      return value[key]
    }
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
