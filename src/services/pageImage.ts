// Extracts a page's representative product image (og:image / twitter:image /
// first product img) so verified offers can show what the shopper is buying
// without anyone uploading pictures by hand.

export function extractPageImage(html: string, pageUrl: string): string | undefined {
  const meta =
    metaContent(html, 'og:image:secure_url') ??
    metaContent(html, 'og:image') ??
    metaContent(html, 'twitter:image')

  if (!meta) {
    return undefined
  }

  try {
    const resolved = new URL(meta, pageUrl)
    return resolved.protocol === 'https:' ? resolved.toString() : undefined
  } catch {
    return undefined
  }
}

function metaContent(html: string, property: string): string | undefined {
  // Attribute order varies by site: property before content and vice versa.
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(html)

    if (match?.[1]) {
      return decodeEntities(match[1].trim())
    }
  }

  return undefined
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
}
