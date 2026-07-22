import type { VoucherCandidate } from './types'

const AMAZON_COUPON_SOURCE = 'https://www.amazon.co.za/coupons'

export function extractAmazonVoucherCandidates(
  html: string,
  capturedAt: string,
  limit = 100,
): VoucherCandidate[] {
  const products = extractJsonObjectsWithKey(html, 'asin')
  const vouchers: VoucherCandidate[] = []
  const seen = new Set<string>()

  for (const product of products) {
    if (vouchers.length >= limit) {
      break
    }

    const coupon = recordValue(product, 'coupon')
    const asin = stringValue(product, 'asin')
    const productTitle = normalizeText(stringValue(product, 'title'))
    const link = stringValue(product, 'link')
    const couponId = normalizeCouponId(stringValue(coupon, 'id'))
    const redemptionUrl = officialAmazonUrl(link)
    const benefitText = amazonBenefitText(coupon)

    if (!asin || !productTitle || !couponId || !redemptionUrl || !benefitText) {
      continue
    }

    const identity = `${asin}:${couponId}`
    if (seen.has(identity)) {
      continue
    }
    seen.add(identity)

    vouchers.push({
      accountRequired: true,
      benefitText,
      capturedAt,
      evidenceText: `${productTitle}. ${benefitText}. Coupon ${couponId}.`,
      externalId: couponId,
      imageUrl: amazonImageUrl(product),
      productId: asin,
      productTitle,
      publicReusable: false,
      redemptionMode: 'clip',
      redemptionUrl,
      retailerId: 'amazon-za',
      sourceUrl: AMAZON_COUPON_SOURCE,
      title: productTitle,
      voucherKind: 'product_coupon',
    })
  }

  return vouchers
}

export function extractPublicVoucherCandidates(input: {
  capturedAt: string
  html: string
  retailerId: string
  sourceUrl: string
  limit?: number
}): VoucherCandidate[] {
  const sourceUrl = publicHttpsUrl(input.sourceUrl)
  if (!sourceUrl) {
    return []
  }
  const limit = Math.max(1, Math.min(1_000, Math.trunc(input.limit ?? 50)))
  const blocks = publicVoucherBlocks(input.html)
  const vouchers: VoucherCandidate[] = []
  const seen = new Set<string>()

  for (const block of blocks) {
    if (vouchers.length >= limit) {
      break
    }

    const plainText = normalizeText(stripTags(block.body))
    const code = attribute(block.attributes, 'data-voucher-code')?.trim()
    const externalId = attribute(block.attributes, 'data-voucher-id')?.trim()
    const hasVoucherProof = /\b(voucher|coupon|promo\s+code)\b/i.test(plainText)
    const isPrivate = isPrivateVoucherText(plainText)

    if (
      !code ||
      !externalId ||
      !hasVoucherProof ||
      isPrivate ||
      !/^[A-Za-z0-9_-]{3,40}$/.test(code)
    ) {
      continue
    }

    const title = firstElementText(block.body, /h[1-4]/i)
    const benefitText = firstMatchingParagraph(block.body, code)
    const redemptionPath = firstHref(block.body)
    const redemptionUrl = redemptionPath
      ? sameOriginHttpsUrl(redemptionPath, sourceUrl)
      : sourceUrl
    const validTo = firstDatetime(block.body)

    if (!title || !benefitText || !redemptionUrl) {
      continue
    }

    const identity = `${input.retailerId}:${externalId}`
    if (seen.has(identity)) {
      continue
    }
    seen.add(identity)

    vouchers.push({
      accountRequired: false,
      benefitText,
      capturedAt: input.capturedAt,
      code,
      evidenceText: plainText,
      externalId,
      publicReusable: true,
      redemptionMode: 'code',
      redemptionUrl,
      retailerId: input.retailerId,
      sourceUrl,
      termsText: plainText,
      title,
      validTo,
      voucherKind: 'public_code',
    })
  }

  // Real retailer pages rarely mark vouchers up with data attributes — they
  // write "use code SAVE20 for 20% off" in plain prose. Scan the page text
  // for those announcements as well.
  const capturedCodes = new Set(
    vouchers.map((voucher) => voucher.code?.toLocaleUpperCase()).filter(Boolean),
  )
  for (const inline of extractInlineCodeCandidates(input.html)) {
    if (vouchers.length >= limit) {
      break
    }

    const identity = `${input.retailerId}:${inline.code}`
    if (seen.has(identity) || capturedCodes.has(inline.code.toLocaleUpperCase())) {
      continue
    }
    seen.add(identity)
    capturedCodes.add(inline.code.toLocaleUpperCase())

    vouchers.push({
      accountRequired: false,
      benefitText: inline.benefitText,
      capturedAt: input.capturedAt,
      code: inline.code,
      evidenceText: inline.benefitText,
      externalId: inline.code,
      publicReusable: true,
      redemptionMode: 'code',
      redemptionUrl: sourceUrl,
      retailerId: input.retailerId,
      sourceUrl,
      termsText: inline.benefitText,
      title: `Promo code ${inline.code}`,
      voucherKind: 'public_code',
    })
  }

  return vouchers
}

// Finds prose-announced promo codes ("use code SAVE20 and get 20% off").
// Requires a benefit signal in the surrounding sentence so incidental
// mentions of the word "code" never turn into a voucher.
function extractInlineCodeCandidates(html: string) {
  const text = normalizeText(stripTags(html))
  const pattern =
    /\b(?:use|with|enter|apply)\s+(?:the\s+)?(?:promo\s+|voucher\s+|discount\s+|coupon\s+)?code\s*[:\-]?\s*([A-Z0-9][A-Z0-9-]{2,19})\b/gi
  const found: Array<{ benefitText: string; code: string }> = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null && found.length < 20) {
    const code = match[1]
    if (seen.has(code) || /^\d+$/.test(code)) {
      continue
    }

    const windowStart = Math.max(0, match.index - 160)
    const windowEnd = Math.min(text.length, match.index + match[0].length + 160)
    const context = text.slice(windowStart, windowEnd).trim()

    if (
      !/\b(off|save|saving|discount|free|less)\b/i.test(context) ||
      isPrivateVoucherText(context)
    ) {
      continue
    }

    seen.add(code)
    found.push({ benefitText: context, code })
  }

  return found
}

function publicVoucherBlocks(html: string) {
  const blocks: Array<{ attributes: string; body: string }> = []
  const pattern = /<(section|article|div)\b([^>]*\bdata-voucher-code\s*=\s*["'][^"']+["'][^>]*)>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    blocks.push({ attributes: match[2], body: match[3] })
  }

  return blocks
}

function attribute(attributes: string, name: string) {
  const match = new RegExp(`${escapeRegExp(name)}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attributes)
  return match?.[1]
}

function firstElementText(html: string, tagPattern: RegExp) {
  const match = new RegExp(`<(${tagPattern.source})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i').exec(html)
  return match ? normalizeText(stripTags(match[2])) : ''
}

function firstMatchingParagraph(html: string, code: string) {
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi), (match) =>
    normalizeText(stripTags(match[1])),
  )
  return paragraphs.find((paragraph) =>
    paragraph.toLowerCase().includes(code.toLowerCase()) &&
    /\b(off|save|voucher|coupon|promo\s+code)\b/i.test(paragraph),
  ) ?? ''
}

function firstHref(html: string) {
  return /<a\b[^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]
}

function firstDatetime(html: string) {
  const value = /<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]?.trim()
  return value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) ? value : undefined
}

function extractJsonObjectsWithKey(html: string, key: string) {
  const objects: unknown[] = []
  const pattern = new RegExp(`["']${escapeRegExp(key)}["']\\s*:`, 'g')
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    const start = html.lastIndexOf('{', match.index)
    if (start < 0) {
      continue
    }
    const objectText = balancedJsonObject(html, start)
    if (!objectText) {
      continue
    }
    try {
      objects.push(JSON.parse(objectText) as unknown)
      pattern.lastIndex = start + objectText.length
    } catch {
      pattern.lastIndex = match.index + match[0].length
    }
  }

  return objects
}

function balancedJsonObject(value: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return value.slice(start, index + 1)
      }
    }
  }

  return undefined
}

function amazonBenefitText(coupon: unknown) {
  const fragments = recordValue(recordValue(coupon, 'label'), 'fragments')
  const pieces: string[] = []

  if (Array.isArray(fragments)) {
    for (const fragment of fragments) {
      const text = stringValue(fragment, 'text')
      const money = recordValue(fragment, 'money')
      const amount = stringValue(money, 'amount')
      const currency = stringValue(money, 'currencyCode')
      if (text) {
        pieces.push(text)
      }
      if (amount) {
        pieces.push(currency === 'ZAR' ? `R${amount}` : `${currency} ${amount}`.trim())
      }
    }
  }

  const message = normalizeText(stringValue(recordValue(coupon, 'messaging'), 'text'))
  const label = normalizeText(pieces.join(''))
  return normalizeText([label, message].filter(Boolean).join(' '))
}

function amazonImageUrl(product: unknown) {
  const image = recordValue(product, 'image')
  for (const key of ['hiRes', 'lowRes']) {
    const rendition = recordValue(image, key)
    const baseUrl = stringValue(rendition, 'baseUrl')
    const extension = stringValue(rendition, 'extension')
    if (baseUrl && extension) {
      return officialAmazonImageUrl(`${baseUrl}.${extension}`)
    }
  }
  return undefined
}

function normalizeCouponId(value: string) {
  return value.replace(/^\/?promo\//i, '').trim()
}

function recordValue(value: unknown, key: string): Record<string, unknown> | unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function stringValue(value: unknown, key: string) {
  const candidate = recordValue(value, key)
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : ''
}

function normalizeText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim()
}

function stripTags(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;|&apos;/gi, '’')
}

function officialAmazonUrl(value: string) {
  try {
    const url = new URL(value, AMAZON_COUPON_SOURCE)
    const host = url.hostname.toLocaleLowerCase()
    return url.protocol === 'https:' &&
      (host === 'amazon.co.za' || host.endsWith('.amazon.co.za'))
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function officialAmazonImageUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLocaleLowerCase()
    const officialHost = host === 'media-amazon.com' ||
      host.endsWith('.media-amazon.com') ||
      host === 'ssl-images-amazon.com' ||
      host.endsWith('.ssl-images-amazon.com')
    return url.protocol === 'https:' && officialHost ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function publicHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      isPublicHostname(url.hostname)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function isPrivateVoucherText(value: string) {
  return /\b(personali[sz]ed|single[ -]use|one[ -]time|unique\s+to|your\s+account|your\s+personal|member[ -]specific|account[ -]specific|customer[ -]specific|assigned\s+to\s+you|issued\s+to\s+you|sent\s+to\s+you|do\s+not\s+share|non[ -]transferable)\b/i.test(value) ||
    /\b(?:personal|private)\s+(?:voucher|coupon|promo(?:\s+code)?|code|offer)\b/i.test(value) ||
    /\b(?:only|exclusively)\s+for\s+you\b|\bfor\s+you\s+only\b/i.test(value)
}

function isPublicHostname(value: string) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '')
  return hostname.includes('.') &&
    !hostname.includes(':') &&
    !/^[\d.]+$/.test(hostname) &&
    hostname !== 'localhost' &&
    !hostname.endsWith('.localhost') &&
    !hostname.endsWith('.local') &&
    !hostname.endsWith('.internal') &&
    !hostname.endsWith('.lan')
}

function sameOriginHttpsUrl(value: string, base: string) {
  try {
    const baseUrl = new URL(base)
    const url = new URL(value, baseUrl)
    return url.origin === baseUrl.origin && url.protocol === 'https:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
