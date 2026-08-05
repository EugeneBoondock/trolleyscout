// Normalizers for public South African deal, flight and hotel offer pages into a single
// shape the app already renders. Each site is read from public data that its own
// logged-out website serves:
//   - OneDayOnly: Next.js — products live in the page's __NEXT_DATA__ blob.
//   - Hyperli: Shopify — the public /products.json feed.
//   - Daddy's Deals: WordPress — the `product` custom post type via wp-json.
//   - MyRunway: a REST API (/v1/products) that accepts a self-issued guest token.
//   - Travelstart and Southern Sun: their public offer-page markup.
//   - Flight Centre: the public deal tiles in its Next.js page data.
//   - City Lodge: the public specials endpoint used by its own offers page.
//   - ANEW Hotels, BushBreaks and Sun International: their public offer cards.
// Parsing is kept pure and injectable here; fetching lives in the scout.

export type DealSiteId =
  | 'onedayonly'
  | 'hyperli'
  | 'daddysdeals'
  | 'myrunway'
  | 'travelstart'
  | 'southernsun'
  | 'flightcentre'
  | 'citylodge'
  | 'anewhotels'
  | 'bushbreaks'
  | 'suninternational'
export type WindowShoppingSource = DealSiteId | 'trolleyscout-business'

export interface DealSiteItem {
  capturedAt?: string
  id: string
  source: WindowShoppingSource
  retailerName: string
  sourceLabel: string
  title: string
  priceText?: string
  previousPriceText?: string
  savingText?: string
  productUrl: string
  imageUrl?: string
  images?: string[]
  category?: string
  expiresAt?: string
  // True only where the site states it. Left absent by the sites that say
  // nothing about stock rather than guessed at, because a wrong sold-out badge
  // sends a shopper away from something they could have bought.
  soldOut?: boolean
}

const SITE_LABEL: Record<DealSiteId, string> = {
  onedayonly: 'OneDayOnly',
  hyperli: 'Hyperli',
  daddysdeals: "Daddy's Deals",
  myrunway: 'MyRunway',
  travelstart: 'Travelstart',
  southernsun: 'Southern Sun',
  flightcentre: 'Flight Centre',
  citylodge: 'City Lodge Hotels',
  anewhotels: 'ANEW Hotels & Resorts',
  bushbreaks: 'BushBreaks',
  suninternational: 'Sun International',
}

// ---------- OneDayOnly ----------

export function parseOneDayOnly(html: string): DealSiteItem[] {
  const data = extractNextData(html)
  if (!data) return []

  const items = pathValue(data, ['props', 'pageProps', 'homePage', 'items'])
  if (!Array.isArray(items)) return []

  const products: Record<string, unknown>[] = []
  collectObjects(items, (obj) => {
    if (obj.realId !== undefined && obj.name && obj.price) {
      products.push(obj)
    }
  }, 6)

  const seen = new Set<string>()
  const out: DealSiteItem[] = []

  for (const product of products) {
    const realId = String(product.realId ?? product.id ?? '')
    if (!realId || seen.has(realId)) continue
    seen.add(realId)

    const slug = typeof product.id === 'string' ? product.id : realId
    const externalListingUrl = webUrl(product.externalListingLink)
    const price = moneyText(pathValue(product, ['price', 'formattedValue']))
    const wasPrice = moneyText(pathValue(product, ['retailPrice', 'formattedValue']))
    const saving = oneDayOnlySaving(product.saving)
    const gallery = uniqueImageUrls([
      pathValue(product, ['image', 'url']),
      ...(Array.isArray(product.gallery)
        ? [...product.gallery]
            .filter((entry) =>
              pathValue(entry, ['type']) === 'IMAGE' &&
              pathValue(entry, ['file', 'isCensored']) !== true,
            )
            .sort((left, right) =>
              numberValue(pathValue(left, ['position'])) - numberValue(pathValue(right, ['position'])),
            )
            .map((entry) => pathValue(entry, ['file', 'url']))
        : []),
    ])

    out.push({
      capturedAt: sourceCapturedAt(
        product.activeFromDate,
        product.updatedAt,
        product.createdAt,
      ),
      category: firstString(product.topLevelCategories) ?? undefined,
      expiresAt: typeof product.activeToDate === 'string' ? product.activeToDate : undefined,
      id: `onedayonly-${realId}`,
      imageUrl: gallery[0],
      images: gallery.length > 0 ? gallery : undefined,
      previousPriceText: wasPrice,
      priceText: price,
      productUrl: externalListingUrl ?? `https://www.onedayonly.co.za/products/${slug}`,
      retailerName: SITE_LABEL.onedayonly,
      savingText: saving,
      // OneDayOnly is the one reel source that says whether a thing is gone —
      // selling out is the whole shape of the site, and `isSoldOut` is its own
      // word for it. These used to be dropped here, silently, which is why the
      // reel could never badge one: a shopper saw the card vanish between
      // scrolls rather than being told it had gone.
      ...(product.isSoldOut === true ? { soldOut: true } : {}),
      source: 'onedayonly',
      sourceLabel: SITE_LABEL.onedayonly,
      title: String(product.name),
    })
  }

  return out
}

function oneDayOnlySaving(saving: unknown): string | undefined {
  if (!saving || typeof saving !== 'object') return undefined
  const record = saving as Record<string, unknown>
  const percent = typeof record.percent === 'number' ? record.percent : undefined
  const fixed = moneyText(pathValue(record, ['fixed', 'formattedValue']))
  if (fixed && percent) return `Save ${fixed} (${percent}% off)`
  if (percent) return `${percent}% off`
  if (fixed) return `Save ${fixed}`
  return undefined
}

function webUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const candidate = value.trim()
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? candidate
      : undefined
  } catch {
    return undefined
  }
}

// ---------- Hyperli (Shopify) ----------

export function parseHyperli(payload: unknown): DealSiteItem[] {
  const products = pathValue(payload, ['products'])
  if (!Array.isArray(products)) return []

  const out: DealSiteItem[] = []
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue
    const product = raw as Record<string, unknown>
    const variants = Array.isArray(product.variants) ? product.variants : []
    const variant = (variants[0] ?? {}) as Record<string, unknown>
    const price = randFromDecimal(variant.price)
    const compare = randFromDecimal(variant.compare_at_price)
    const priceCents = decimalToCents(variant.price)
    const compareCents = decimalToCents(variant.compare_at_price)
    const images = Array.isArray(product.images) ? product.images : []
    const gallery = uniqueImageUrls(
      [...images]
        .sort((left, right) =>
          numberValue(pathValue(left, ['position'])) - numberValue(pathValue(right, ['position'])),
        )
        .map((image) => pathValue(image, ['src'])),
    )
    const handle = typeof product.handle === 'string' ? product.handle : ''
    if (!product.title || !handle) continue
    if (variant.available === false) continue

    out.push({
      capturedAt: sourceCapturedAt(
        product.published_at,
        product.updated_at,
        product.created_at,
      ),
      category: typeof product.product_type === 'string' ? product.product_type : undefined,
      id: `hyperli-${String(product.id ?? handle)}`,
      imageUrl: gallery[0],
      images: gallery.length > 0 ? gallery : undefined,
      previousPriceText: compare,
      priceText: price,
      productUrl: `https://hyperli.com/products/${handle}`,
      retailerName: SITE_LABEL.hyperli,
      savingText:
        priceCents !== undefined && compareCents !== undefined && compareCents > priceCents
          ? `Save R${((compareCents - priceCents) / 100).toFixed(0)}`
          : undefined,
      source: 'hyperli',
      sourceLabel:
        typeof product.vendor === 'string' && product.vendor
          ? `Hyperli · ${product.vendor}`
          : SITE_LABEL.hyperli,
      title: String(product.title),
    })
  }
  return out
}

// ---------- Daddy's Deals (WordPress) ----------

export function parseDaddysDeals(payload: unknown): DealSiteItem[] {
  if (!Array.isArray(payload)) return []

  const out: DealSiteItem[] = []
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue
    const post = raw as Record<string, unknown>
    const title = decodeEntities(String(pathValue(post, ['title', 'rendered']) ?? '')).trim()
    const link = typeof post.link === 'string' ? post.link : ''
    if (!title || !link) continue

    const excerpt = decodeEntities(
      String(pathValue(post, ['excerpt', 'rendered']) ?? '').replace(/<[^>]+>/g, ''),
    ).replace(/\s+/g, ' ').trim()
    const image = embeddedImage(post)
    const price = firstRand(`${title} ${excerpt}`)

    out.push({
      capturedAt: sourceCapturedAt(
        post.modified_gmt,
        post.date_gmt,
        post.modified,
        post.date,
      ),
      category: embeddedTerm(post),
      id: `daddysdeals-${String(post.id ?? link)}`,
      imageUrl: image,
      images: image ? [image] : undefined,
      priceText: price,
      productUrl: link,
      retailerName: SITE_LABEL.daddysdeals,
      savingText: undefined,
      source: 'daddysdeals',
      sourceLabel: SITE_LABEL.daddysdeals,
      title,
    })
  }
  return out
}

// ---------- Travelstart (public flight-deals page) ----------

export function parseTravelstart(html: string): DealSiteItem[] {
  const out: DealSiteItem[] = []
  const seen = new Set<string>()
  const anchors = html.matchAll(
    /<a\b([^>]*\bclass=(?:"[^"]*\bfare-card\b[^"]*"|'[^']*\bfare-card\b[^']*')[^>]*)>([\s\S]*?)<\/a>/gi,
  )

  for (const match of anchors) {
    const attributes = match[1]
    const body = match[2]
    const productUrl = htmlAttribute(attributes, 'href')
    if (!productUrl || !/^https:\/\/(?:www\.)?travelstart\.co\.za\/search\?/i.test(productUrl)) {
      continue
    }

    const url = new URL(productUrl)
    const date = url.searchParams.get('depart_date') ?? ''
    const departure = htmlTextCapture(body, /<h3\b[^>]*class=(?:"[^"]*\bdeparture\b[^"]*"|'[^']*\bdeparture\b[^']*')[^>]*>([\s\S]*?)<\/h3>/i)
    const destination = htmlTextCapture(body, /<h3\b[^>]*class=(?:"[^"]*\bdestination\b[^"]*"|'[^']*\bdestination\b[^']*')[^>]*>([\s\S]*?)<\/h3>/i)
    const airlineTag = body.match(/<img\b[^>]*\bclass=(?:"[^"]*\bairline-image\b[^"]*"|'[^']*\bairline-image\b[^']*')[^>]*>/i)?.[0] ?? ''
    const airline = decodeEntities(htmlAttribute(airlineTag, 'alt') ?? 'Airline')
    const imageUrl = htmlAttribute(airlineTag, 'data-lazy-src')
    const priceText = htmlTextCapture(body, /<div\b[^>]*class=(?:"[^"]*\bfare-card-price\b[^"]*"|'[^']*\bfare-card-price\b[^']*')[^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>/i)
    if (!departure || !destination || !priceText) continue

    const id = `travelstart-${date || 'open'}-${departure}-${destination}-${airline}-${priceText}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (!id || seen.has(id)) continue
    seen.add(id)

    out.push({
      category: 'Flights',
      ...(date ? { expiresAt: `${date} 23:59:59` } : {}),
      id,
      ...(imageUrl && /^https?:\/\//i.test(imageUrl) ? { imageUrl, images: [imageUrl] } : {}),
      priceText,
      productUrl,
      retailerName: airline,
      source: 'travelstart',
      sourceLabel: 'Travelstart flight deals',
      title: `${airline} flight: ${departure} to ${destination}`,
    })
  }
  return out
}

// ---------- Southern Sun (public hotel-offers page) ----------

export function parseSouthernSun(html: string): DealSiteItem[] {
  const out: DealSiteItem[] = []
  const articles = html.matchAll(
    /<article\b[^>]*\bclass=(?:"[^"]*\bspecial-entry\b[^"]*"|'[^']*\bspecial-entry\b[^']*')[^>]*>([\s\S]*?)<\/article>/gi,
  )

  for (const match of articles) {
    const body = match[1]
    const title = htmlTextCapture(body, /<h3\b[^>]*\bclass=(?:"[^"]*\bspecial-title\b[^"]*"|'[^']*\bspecial-title\b[^']*')[^>]*>([\s\S]*?)<\/h3>/i)
    const description = htmlTextCapture(body, /<p\b[^>]*\bclass=(?:"[^"]*\bspecial-descr\b[^"]*"|'[^']*\bspecial-descr\b[^']*')[^>]*>([\s\S]*?)<\/p>/i)
    if (!title || !/(?:travel|stay|accommodation|resort|room|package|getaway|holiday|rate of the day|frequentguest|sungift)/i.test(`${title} ${description}`)) {
      continue
    }

    const linkTag = body.match(/<a\b[^>]*\blearn-more-link\b[^>]*>/i)?.[0] ?? ''
    const href = htmlAttribute(linkTag, 'href')
    if (!href) continue
    const productUrl = absoluteWebUrl(href, 'https://www.southernsun.com')
    if (!productUrl) continue
    const imageTag = body.match(/<img\b[^>]*>/i)?.[0] ?? ''
    const imageUrl = absoluteWebUrl(
      htmlAttribute(imageTag, 'data-src') ?? htmlAttribute(imageTag, 'src') ?? '',
      'https://www.southernsun.com',
    )
    const id = `southernsun-${new URL(productUrl).pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    out.push({
      category: 'Hotel stays',
      id,
      ...(imageUrl ? { imageUrl, images: [imageUrl] } : {}),
      priceText: firstRand(`${title} ${description}`),
      productUrl,
      retailerName: 'Southern Sun',
      savingText: percentageSaving(`${title} ${description}`),
      source: 'southernsun',
      sourceLabel: 'Southern Sun hotel specials',
      title,
    })
  }
  return out
}

// ---------- Flight Centre (public travel-deals page data) ----------

export function parseFlightCentre(html: string): DealSiteItem[] {
  const data = extractNextData(html)
  const deals = pathValue(data, ['props', 'pageProps', 'deals'])
  if (!Array.isArray(deals)) return []

  const out: DealSiteItem[] = []
  const seen = new Set<string>()
  const seenTitles = new Set<string>()
  for (const raw of deals) {
    if (!raw || typeof raw !== 'object') continue
    const deal = raw as Record<string, unknown>
    const id = String(deal.id ?? '').trim()
    const productUrl = webUrl(deal.link)
    if (!id || !productUrl || seen.has(id) || !isFlightCentreDealUrl(productUrl)) continue

    const title = flightCentreTitle(deal)
    if (!title) continue
    const titleKey = title.toLocaleLowerCase('en-ZA')
    if (seenTitles.has(titleKey)) continue
    seen.add(id)
    seenTitles.add(titleKey)
    const imageUrl = webUrl(deal.image)
    const category = firstString(pathValue(deal, ['productType', 'holidayType'])) ??
      firstString(pathValue(deal, ['productType', 'tourType'])) ??
      firstString(pathValue(deal, ['productType', 'travellerType'])) ??
      (/flight/i.test(`${title} ${new URL(productUrl).pathname}`) ? 'Flights' : 'Travel')

    out.push({
      category,
      id: `flightcentre-${id}`,
      ...(imageUrl ? { imageUrl, images: [imageUrl] } : {}),
      productUrl,
      retailerName: SITE_LABEL.flightcentre,
      source: 'flightcentre',
      sourceLabel: 'Flight Centre travel deals',
      title,
    })
  }
  return out
}

function isFlightCentreDealUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (!/(?:^|\.)flightcentre\.co\.za$/i.test(url.hostname)) return false
    return /^\/(?:deals(?:\/|$)|holidays(?:\/|\?|$)|flights(?:\/|$)|promotions\/flight-deals(?:\/|$)|product\/\d+(?:\/|$))/i
      .test(`${url.pathname}${url.search}`)
  } catch {
    return false
  }
}

function flightCentreTitle(deal: Record<string, unknown>): string | undefined {
  const alt = typeof deal.alt === 'string' ? deal.alt.trim() : ''
  const raw = typeof deal.title === 'string' ? deal.title.trim() : ''
  const altIsAssetCopy =
    /\.(?:jpe?g|png|webp|gif)$/i.test(alt) ||
    /^(?:a|an|the)\s+(?:view|couple|person|family|group|picture|photo|image)\b/i.test(alt) ||
    /\bregarding\b/i.test(alt) ||
    alt.length > 70
  const title = alt && !altIsAssetCopy ? alt : raw
  return title
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\s+(?:deals?\s+tile|banner(?:\s*&\s*deals?\s+tile)?)(?:\s+.*)?$/i, '')
    .trim() || undefined
}

// ---------- City Lodge Hotels (public specials endpoint) ----------

export function parseCityLodge(payload: unknown): DealSiteItem[] {
  const offers = pathValue(payload, ['special_offers'])
  if (!Array.isArray(offers)) return []

  const out: DealSiteItem[] = []
  for (const raw of offers) {
    if (!raw || typeof raw !== 'object') continue
    const offer = raw as Record<string, unknown>
    if (offer.is_active !== true || offer.special_type === 'not_visible') continue

    const id = String(offer.id ?? '').trim()
    const title = typeof offer.name === 'string' ? offer.name.trim() : ''
    const slug = typeof offer.slug === 'string' ? offer.slug.trim() : ''
    if (!id || !title || !slug) continue

    const description = typeof offer.description === 'string' ? offer.description : ''
    const imageUrl = webUrl(pathValue(offer, ['image', 'url'])) ??
      webUrl(pathValue(offer, ['banner_image', 'url']))
    const expiresAt = typeof offer.end_at === 'string' ? offer.end_at : undefined

    out.push({
      category: 'Hotel stays',
      ...(expiresAt ? { expiresAt } : {}),
      id: `citylodge-${id}`,
      ...(imageUrl ? { imageUrl, images: [imageUrl] } : {}),
      productUrl: `https://citylodgehotels.com/special-offers/${encodeURIComponent(slug)}`,
      retailerName: SITE_LABEL.citylodge,
      savingText: percentageSaving(`${title} ${description}`),
      source: 'citylodge',
      sourceLabel: 'City Lodge hotel specials',
      title,
    })
  }
  return out
}

// ---------- ANEW Hotels & Resorts (public accommodation specials page) ----------

export function parseAnewHotels(html: string): DealSiteItem[] {
  const out: DealSiteItem[] = []
  const seenTitles = new Set<string>()
  const cards = html.split(/<div\s+data-elementor-type=(?:"loop-item"|'loop-item')/i).slice(1)

  for (const card of cards) {
    if (!/\bdeals\s+type-deals\b/i.test(card.slice(0, 700))) continue
    const id = /\bpost-(\d+)\b/i.exec(card.slice(0, 700))?.[1]
    const title = htmlTextCapture(
      card,
      /elementor-widget-theme-post-title[\s\S]*?<h3\b[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!id || !title || /^book now$/i.test(title)) continue
    const titleKey = title.toLocaleLowerCase('en-ZA')
    if (seenTitles.has(titleKey)) continue
    seenTitles.add(titleKey)

    const imageTag = card.match(/<img\b[^>]*(?:data-lazy-src|data-src|src)\s*=\s*(?:"[^"]+"|'[^']+')[^>]*>/i)?.[0] ?? ''
    const rawImage = htmlAttribute(imageTag, 'data-lazy-src') ??
      htmlAttribute(imageTag, 'data-src') ??
      htmlAttribute(imageTag, 'src')
    const imageUrl = rawImage && !rawImage.startsWith('data:')
      ? absoluteWebUrl(rawImage, 'https://anewhotels.com')
      : undefined
    const excerpt = htmlText(card)

    out.push({
      category: 'Hotel stays',
      ...(offerExpiry(excerpt) ? { expiresAt: offerExpiry(excerpt) } : {}),
      id: `anewhotels-${id}`,
      ...(imageUrl ? { imageUrl, images: [imageUrl] } : {}),
      priceText: firstRand(excerpt),
      productUrl: `https://anewhotels.com/all-specials/#deal-${id}`,
      retailerName: SITE_LABEL.anewhotels,
      savingText: percentageSaving(excerpt) ?? randSaving(excerpt),
      source: 'anewhotels',
      sourceLabel: 'ANEW accommodation specials',
      title,
    })
  }
  return out
}

// ---------- BushBreaks (public lodge specials page) ----------

export function parseBushBreaks(html: string): DealSiteItem[] {
  const out: DealSiteItem[] = []
  const cards = html.split(
    /<div\b[^>]*class=(?:"[^"]*\bcard-column\b[^"]*\bcard_column_bush_break\b[^"]*"|'[^']*\bcard-column\b[^']*\bcard_column_bush_break\b[^']*')[^>]*>/i,
  ).slice(1)

  for (const card of cards) {
    const title = htmlTextCapture(
      card,
      /<h5\b[^>]*\bcard-title\b[^>]*>([\s\S]*?)<br\s*\/?\s*>/i,
    )
    const linkTag = card.match(/<a\b[^>]*href=(?:"\/listing\/[^"]+"|'\/listing\/[^']+')[^>]*>\s*View\s*<\/a>/i)?.[0] ?? ''
    const href = htmlAttribute(linkTag, 'href')
    if (!title || !href) continue
    const productUrl = absoluteWebUrl(href, 'https://www.bushbreaks.co.za')
    if (!productUrl) continue

    const specialName = htmlTextCapture(
      card,
      /<small\b[^>]*\bspecial-name\b[^>]*>([\s\S]*?)<\/small>/i,
    )
    const validity = htmlTextCapture(
      card,
      /<small\b[^>]*\bvalid-until\b[^>]*>([\s\S]*?)<\/small>/i,
    )
    const saving = htmlTextCapture(
      card,
      /<span\b[^>]*\bsavings-percent\b[^>]*>([\s\S]*?)<\/span>/i,
    )
    const priceText = htmlTextCapture(
      card,
      /<strong\b[^>]*\bfrom-price\b[^>]*>([\s\S]*?)<\/strong>/i,
    )
    const gallery = uniqueImageUrls(
      [...card.matchAll(/data-flickity-bg-lazyload\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)]
        .map((match) => decodeEntities(match[1] ?? match[2] ?? '')),
    )
    const id = `bushbreaks-${new URL(productUrl).pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    out.push({
      category: 'Safari and lodge stays',
      ...(validity && offerExpiry(validity) ? { expiresAt: offerExpiry(validity) } : {}),
      id,
      imageUrl: gallery[0],
      images: gallery.length > 0 ? gallery : undefined,
      priceText,
      productUrl,
      retailerName: title,
      savingText: saving ? `${saving.replace(/\s+/g, '')} off` : undefined,
      source: 'bushbreaks',
      sourceLabel: 'BushBreaks lodge specials',
      title: specialName ? `${title}: ${specialName}` : title,
    })
  }
  return out
}

// ---------- Sun International (public specials page) ----------

export function parseSunInternational(html: string): DealSiteItem[] {
  const out: DealSiteItem[] = []
  const main = html.split(/<\/main>/i)[0] ?? html
  const cards = main.matchAll(
    /<a\b([^>]*\bOfferCard_offer-card__link[^>]*)>([\s\S]*?)<\/a>/gi,
  )

  for (const match of cards) {
    const href = htmlAttribute(match[1], 'href')
    const body = match[2]
    const property = htmlTextCapture(
      body,
      /<span\b[^>]*\bOfferCard_offer-card__property[^>]*>([\s\S]*?)<\/span>/i,
    )
    const title = htmlTextCapture(
      body,
      /<p\b[^>]*\bOfferCard_offer-card__title[^>]*>([\s\S]*?)<\/p>/i,
    )
    const timing = htmlTextCapture(
      body,
      /<p\b[^>]*\bOfferCard_offer-card__date[^>]*>([\s\S]*?)<\/p>/i,
    )
    if (!href || !property || !title) continue
    if (!/(?:accommodation|escape|getaway|holiday|hotel|lodge|package|pay\d*stay|resort|room|stay|vacation|villa)/i
      .test(`${property} ${title} ${href}`)) continue
    const productUrl = absoluteWebUrl(href, 'https://www.suninternational.com')
    if (!productUrl) continue
    const imageTag = body.match(/<img\b[^>]*>/i)?.[0] ?? ''
    const imageUrl = absoluteWebUrl(
      htmlAttribute(imageTag, 'src') ?? htmlAttribute(imageTag, 'data-src') ?? '',
      'https://www.suninternational.com',
    )
    const id = `suninternational-${new URL(productUrl).pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    out.push({
      category: 'Resort and hotel stays',
      ...(timing && offerExpiry(timing) ? { expiresAt: offerExpiry(timing) } : {}),
      id,
      ...(imageUrl ? { imageUrl, images: [imageUrl] } : {}),
      priceText: firstRand(`${title} ${timing ?? ''}`),
      productUrl,
      retailerName: property,
      savingText: percentageSaving(`${title} ${timing ?? ''}`),
      source: 'suninternational',
      sourceLabel: 'Sun International stay specials',
      title,
    })
  }
  return out
}

function percentageSaving(text: string): string | undefined {
  const match = /\b(up\s+to\s+)?(?:save\s+)?(\d{1,3})\s*%(?:\s*off\b)?/i.exec(text)
  if (!match) return undefined
  return `${match[1] ? 'Up to ' : ''}${match[2]}% off`
}

function randSaving(text: string): string | undefined {
  const match = /\bsave\s+(up\s+to\s+)?(R\s?\d[\d\s,.]*)/i.exec(text)
  if (!match) return undefined
  return `Save ${match[1] ? 'up to ' : ''}${match[2].replace(/\s+/g, '')}`
}

function offerExpiry(text: string): string | undefined {
  const matches = [...text.matchAll(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/gi)]
  const last = matches.at(-1)
  if (!last) return undefined
  const month = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ].indexOf(last[2].slice(0, 3).toLowerCase()) + 1
  if (month <= 0) return undefined
  return `${last[3]}-${String(month).padStart(2, '0')}-${String(Number(last[1])).padStart(2, '0')} 23:59:59`
}

// ---------- MyRunway ----------

export function parseMyRunway(payload: unknown): DealSiteItem[] {
  const products = pathValue(payload, ['products']) ?? payload
  if (!Array.isArray(products)) return []

  const out: DealSiteItem[] = []
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue
    const product = raw as Record<string, unknown>
    const name = typeof product.name === 'string'
      ? product.name
      : typeof product.title === 'string'
        ? product.title
        : ''
    if (!name || product.is_sold_out === true) continue

    const sellingCents = decimalToCents(product.selling_price)
    const retailCents = decimalToCents(product.retail_price)
    const id = String(product.id ?? product.sku ?? '')
    const productImages = Array.isArray(product.product_images)
      ? [...product.product_images]
          .filter((entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            pathValue(entry, ['is_include']) !== 0 &&
            pathValue(entry, ['deleteflag']) !== 1,
          )
          .sort((left, right) =>
            numberValue(pathValue(left, ['position'])) - numberValue(pathValue(right, ['position'])),
          )
          .map((entry) => pathValue(entry, ['image_url']))
      : []
    const gallery = uniqueImageUrls([product.image_url, ...productImages])

    out.push({
      capturedAt: sourceCapturedAt(
        product.updated_at,
        product.created_at,
        product.start_date,
      ),
      category: firstString(product.product_category_name) ??
        firstString(pathValue(product, ['product_category', 'name'])) ?? undefined,
      id: `myrunway-${id}`,
      imageUrl: gallery[0],
      images: gallery.length > 0 ? gallery : undefined,
      previousPriceText:
        retailCents !== undefined && (sellingCents === undefined || retailCents > sellingCents)
          ? `R${(retailCents / 100).toFixed(0)}`
          : undefined,
      priceText: sellingCents !== undefined ? `R${(sellingCents / 100).toFixed(0)}` : undefined,
      productUrl: myRunwayUrl(product),
      retailerName: firstString(pathValue(product, ['brand', 'name'])) ?? SITE_LABEL.myrunway,
      savingText: myRunwaySaving(product, sellingCents, retailCents),
      source: 'myrunway',
      sourceLabel: SITE_LABEL.myrunway,
      title: name,
    })
  }
  return out
}

function myRunwaySaving(
  product: Record<string, unknown>,
  sellingCents: number | undefined,
  retailCents: number | undefined,
): string | undefined {
  // The percentage computed from the two prices is authoritative. (MyRunway's
  // `discount` field is the rand amount saved, not a percentage — using it
  // directly reads as e.g. "241% off".)
  if (sellingCents !== undefined && retailCents !== undefined && retailCents > sellingCents) {
    const percent = Math.round(((retailCents - sellingCents) / retailCents) * 100)
    if (percent > 0) return `${percent}% off`
  }
  const discount = decimalToCents(product.discount)
  if (discount !== undefined && discount > 0) {
    return `Save R${(discount / 100).toFixed(0)}`
  }
  return undefined
}

function htmlAttribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
  const value = decodeEntities(match?.[1] ?? match?.[2] ?? '').trim()
  return value || undefined
}

function htmlTextCapture(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html)
  if (!match?.[1]) return undefined
  const value = decodeEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
  return value || undefined
}

function htmlText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}

function absoluteWebUrl(value: string, base: string): string | undefined {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim(), base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function myRunwayUrl(product: Record<string, unknown>): string {
  const sku = typeof product.sku === 'string' ? product.sku.trim() : ''
  if (sku) return `https://myrunway.co.za/product/${encodeURIComponent(sku)}`

  const params = product.url_params
  if (typeof params === 'string' && params.trim()) {
    const routeKey = params
      .trim()
      .replace(/^https?:\/\/(?:www\.)?myrunway\.co\.za\//i, '')
      .replace(/^\/+/, '')
      .replace(/^products?\//i, '')
      .replace(/[?#].*$/, '')
    if (routeKey) return `https://myrunway.co.za/product/${routeKey}`
  }
  return 'https://myrunway.co.za/'
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function uniqueImageUrls(values: unknown[]): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const url = value.trim()
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

function sourceCapturedAt(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue
    const raw = value.trim()
    const normalized = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(raw)
      ? `${raw}Z`
      : raw
    const parsed = Date.parse(normalized)
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString()
    }
  }
  return undefined
}

// ---------- shared helpers ----------

export function extractNextData(html: string): unknown {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
  )
  if (!match) return undefined
  try {
    return JSON.parse(match[1])
  } catch {
    return undefined
  }
}

function collectObjects(
  value: unknown,
  visit: (obj: Record<string, unknown>) => void,
  maxDepth: number,
  depth = 0,
): void {
  if (depth > maxDepth || !value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, visit, maxDepth, depth + 1)
    return
  }
  const obj = value as Record<string, unknown>
  visit(obj)
  for (const key of Object.keys(obj)) {
    collectObjects(obj[key], visit, maxDepth, depth + 1)
  }
}

function pathValue(value: unknown, path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item)
      if (found) return found
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return firstString(record.name) ?? firstString(record.title)
  }
  return undefined
}

function moneyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function randFromDecimal(value: unknown): string | undefined {
  const cents = decimalToCents(value)
  if (cents === undefined) return undefined
  return `R${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

function decimalToCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100)
  if (typeof value === 'string') {
    const amount = Number(value.replace(/[^0-9.]/g, ''))
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100)
  }
  return undefined
}

function firstRand(text: string): string | undefined {
  const match = /R\s?\d[\d\s,.]*/.exec(text)
  return match ? match[0].replace(/\s+/g, '').replace(/(\d)R/, '$1') : undefined
}

function embeddedImage(post: Record<string, unknown>): string | undefined {
  const media = pathValue(post, ['_embedded', 'wp:featuredmedia'])
  if (Array.isArray(media)) {
    const src = pathValue(media[0], ['source_url'])
    if (typeof src === 'string') return src
  }
  return undefined
}

function embeddedTerm(post: Record<string, unknown>): string | undefined {
  const terms = pathValue(post, ['_embedded', 'wp:term'])
  if (Array.isArray(terms)) {
    for (const group of terms) {
      if (Array.isArray(group)) {
        for (const term of group) {
          const name = pathValue(term, ['name'])
          if (typeof name === 'string' && name && name.toLowerCase() !== 'uncategorized') {
            return decodeEntities(name)
          }
        }
      }
    }
  }
  return undefined
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#038;/g, '&')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
