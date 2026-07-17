import {
  extractCatalogueDeals,
  extractVisionCatalogueDeals,
} from '../../src/services/catalogueDeals'
import {
  parseRetailerSlug,
  type FeedCursor,
  type RetailerDealCandidate,
} from '../../src/services/retailerFeeds/types'
import {
  externalRetailerTargets,
  extractRetailerLeafletsFromHtml,
} from '../../src/services/scoutSources'
import type { CataloguePage, StoreLeaflet } from '../../src/types'
import {
  type DealSnapshot,
} from './dealSnapshotStore'
import {
  readSourceCursor,
  upsertDealItems,
  writeSourceCursor,
} from './dealItemStore'
import type { TrolleyScoutEnv } from './env'

const MAX_DOCUMENT_BYTES = 18 * 1024 * 1024
const MAX_PAGE_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_DOCUMENTS_PER_RUN = 4
const CATALOGUE_QUEUE_CURSOR_KEY = 'catalogue-scout::document-window'
const MAX_PAGES_PER_CATALOGUE = 1
const MAX_PAGER_BYTES = 512 * 1024
const MAX_EXTERNAL_HTML_BYTES = 1024 * 1024
const MAX_HTML_LINK_CANDIDATES = 24
const MAX_HTML_IMAGE_CANDIDATES = 4
const REQUEST_TIMEOUT_MS = 12_000
const LEASE_TTL_MS = 5 * 60 * 1000
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface VisionChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}
const CATALOGUE_VISION_PROMPT = `You are reading a South African supermarket catalogue page. Return only valid JSON in this exact shape:
{"deals":[{"title":"Brand and product with size","price":"R0.00","previousPrice":"R0.00","box":{"x":0.0,"y":0.0,"width":0.1,"height":0.1}}]}

The "title" must be the product's printed name exactly as a shopper would read it on the pack or label — brand, product and pack size, e.g. "Huggies Baby Soft Diapers Size 4 44s" or "Sunfoil Sunflower Oil 2L".

Hard rules:
- title MUST be the actual product name copied from the label. NEVER describe the picture, position or appearance. Reject phrases like "red boxed product", "displayed at the top right", "is shown", "located", "various items". If you cannot read a real product name, omit that deal entirely.
- Do NOT output banner text as a title: skip "Any 2 for", "Any 3 for", "SAVE", "SPECIAL", "DEAL", "FROM", "%", category headings, dates and terms.
- price is the single selling price shown for that product, formatted like "R69.99".
- Omit previousPrice unless a struck-through or "was" price is printed for that product.
- box is the tight product-and-price crop in normalized page coordinates. x, y, width, and height must each be between 0 and 1.
- Never guess obscured text or a price. Only include products whose name AND price you can read clearly.
- Return at most 30 deals and no prose outside the JSON.`

export interface CatalogueScoutResult {
  dealCount: number
  discoveredLeafletCount: number
  scannedDocumentCount: number
}

export function selectUnscannedLeaflets(
  leaflets: StoreLeaflet[],
  snapshots: Map<string, DealSnapshot>,
  limit = MAX_DOCUMENTS_PER_RUN,
) {
  const scannedUrls = new Set(
    Array.from(snapshots.values()).flatMap((snapshot) =>
      snapshot.deals
        .filter((deal) => deal.sourceLabel === 'Catalogue scan')
        .map((deal) => deal.productUrl),
    ),
  )
  const selectedRetailers = new Set<string>()

  return leaflets.filter((leaflet) => {
    const documentUrl = catalogueEntryUrl(leaflet)

    if (
      !documentUrl ||
      scannedUrls.has(documentUrl) ||
      selectedRetailers.has(leaflet.retailerId) ||
      !isPublicDocumentUrl(documentUrl) ||
      selectedRetailers.size >= limit
    ) {
      return false
    }

    selectedRetailers.add(leaflet.retailerId)
    return true
  })
}

export function flippingBookPagerUrl(leaflet: StoreLeaflet) {
  try {
    const url = new URL(leaflet.url)

    if (!url.pathname.toLowerCase().endsWith('/index.html')) {
      return undefined
    }

    return new URL('files/assets/pager.js', url).toString()
  } catch {
    return undefined
  }
}

export function flippingBookPageUrls(
  leaflet: StoreLeaflet,
  pager: unknown,
  limit = MAX_PAGES_PER_CATALOGUE,
) {
  return buildFlippingBookPages(leaflet, pager, limit).map((page) => page.imageUrl)
}

interface CatalogueCursorState {
  documentFingerprint: string
  nextPage: number
  pageCount: number
  version: 1
}

interface DownloadedPage {
  bytes: Uint8Array
  contentType: string
  imageUrl: string
}

interface CatalogueScanOutcome {
  dealCount: number
  scanned: boolean
}

export interface CatalogueScoutDependencies {
  claimLease: typeof claimCatalogueScanLease
  discoverExternalLeaflets: (fetcher: typeof fetch) => Promise<StoreLeaflet[]>
  fetcher: typeof fetch
  now: () => string
  ownerToken: string
  readSourceCursor: typeof readSourceCursor
  releaseLease: typeof releaseCatalogueScanLease
  runVision: (ai: Ai | undefined, page: DownloadedPage) => Promise<string>
  toMarkdown: (ai: Ai | undefined, document: ArrayBuffer, name: string) => Promise<string>
  upsertDealItems: typeof upsertDealItems
  writeSourceCursor: typeof writeSourceCursor
}

export interface CatalogueLeaseClaim {
  expiresAt: string
  now: string
  ownerToken: string
  sourceKey: string
}

export async function claimCatalogueScanLease(
  db: D1Database,
  claim: CatalogueLeaseClaim,
) {
  try {
    const result = await db.prepare(
      `INSERT INTO catalogue_scan_leases (source_key, owner_token, claimed_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (source_key) DO UPDATE SET
          owner_token = excluded.owner_token,
          claimed_at = excluded.claimed_at,
          expires_at = excluded.expires_at
        WHERE catalogue_scan_leases.expires_at <= excluded.claimed_at`,
    ).bind(
      claim.sourceKey,
      claim.ownerToken,
      claim.now,
      claim.expiresAt,
    ).run()
    return result.meta.changes > 0
  } catch {
    // During migration rollout, skipping is safer than running duplicate scans.
    return false
  }
}

export async function releaseCatalogueScanLease(
  db: D1Database,
  sourceKey: string,
  ownerToken: string,
) {
  try {
    const result = await db.prepare(
      'DELETE FROM catalogue_scan_leases WHERE source_key = ? AND owner_token = ?',
    ).bind(sourceKey, ownerToken).run()
    return result.meta.changes > 0
  } catch {
    return false
  }
}

export async function catalogueSourceKey(leaflet: StoreLeaflet) {
  const identity = JSON.stringify({
    id: leaflet.id.trim().toLowerCase(),
    scope: canonicalScope(leaflet.priceScope),
    url: canonicalCatalogueUrl(leaflet.documentUrl ?? leaflet.url),
  })
  return `catalogue::${leaflet.retailerId}::${await fingerprintText(identity)}`
}

export async function catalogueLeaseOwnerToken(runToken: string, sourceKey: string) {
  return `catalogue-owner:${await fingerprintText(`${runToken}:${sourceKey}`)}`
}

function canonicalScope(scope: StoreLeaflet['priceScope']) {
  if (!scope) {
    return 'national'
  }
  if (scope.type === 'national' || scope.type === 'online') {
    return scope.type
  }
  const included = scope.type === 'province' ? scope.regionIds : scope.storeIds
  return `${scope.type}:${[...included].sort().join(',')}:exclude:${[
    ...(scope.excludedStoreIds ?? []),
  ].sort().join(',')}`
}

function canonicalCatalogueUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    return url.toString()
  } catch {
    return value.trim()
  }
}

async function fingerprintText(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function buildFlippingBookPages(
  leaflet: StoreLeaflet,
  pager: unknown,
  limit = MAX_PAGES_PER_CATALOGUE,
): CataloguePage[] {
  const pagerUrl = flippingBookPagerUrl(leaflet)
  const pages = recordValue(pager, 'pages')
  const structure = recordValue(pages, 'structure')
  const defaults = recordValue(pages, 'defaults')
  const sizes = numberArray(recordValue(defaults, 'substrateSizes'))
  const ready = readySubstrateIndexes(recordValue(defaults, 'substrateSizesReady'), sizes.length)
  const selectedIndex = sizes.findIndex((size, index) => size >= 1350 && ready.has(index))

  if (!pagerUrl || !Array.isArray(structure) || selectedIndex < 0) {
    return []
  }

  const format = declaredSubstrateFormat(recordValue(defaults, 'substrateFormat'))
  const webpCount = integerValue(recordValue(defaults, 'substrateWebPCount')) ?? 0
  return structure.slice(0, limit).map((_page, index) => {
    const pageNumber = String(index + 1).padStart(4, '0')
    const substrateUrl = (slot: number, extension: string) => new URL(
      `common/page-html5-substrates/page${pageNumber}_${slot + 1}.${extension}`,
      pagerUrl,
    ).toString()
    const imageUrl = substrateUrl(selectedIndex, 'webp')
    const fallbacks = [substrateUrl(selectedIndex, format)]

    for (let slot = selectedIndex + 1; slot < sizes.length; slot += 1) {
      if (!ready.has(slot)) {
        continue
      }
      if (slot < webpCount) {
        fallbacks.push(substrateUrl(slot, 'webp'))
      }
      fallbacks.push(substrateUrl(slot, format))
    }
    const pdfUrl = cataloguePdfUrl(leaflet)
    if (pdfUrl) {
      fallbacks.push(pdfUrl)
    }

    return {
      fallbacks: Array.from(new Set(fallbacks.filter((url) => url !== imageUrl))),
      height: Math.round(sizes[selectedIndex] * Math.SQRT2),
      imageUrl,
      pageNumber: index + 1,
      width: sizes[selectedIndex],
    }
  })
}

export function parseFlippingBookPager(value: string): unknown {
  const trimmed = value.trim()
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const objectStart = trimmed.indexOf('{')
    if (objectStart < 0) {
      throw new TypeError('Invalid FlippingBook pager manifest')
    }
    const objectEnd = balancedJsonObjectEnd(trimmed, objectStart)
    if (objectEnd < 0) {
      throw new TypeError('Invalid FlippingBook pager manifest')
    }
    try {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as unknown
    } catch {
      throw new TypeError('Invalid FlippingBook pager manifest')
    }
  }
}

export function readHighResolutionImageDimensions(
  bytes: Uint8Array,
  contentType?: string,
): { height: number; width: number } {
  const normalizedType = contentType?.split(';')[0].trim().toLowerCase()
  const dimensions = normalizedType === 'image/png'
    ? pngDimensions(bytes)
    : normalizedType === 'image/jpeg' || normalizedType === 'image/jpg'
      ? jpegDimensions(bytes)
      : normalizedType === 'image/webp'
        ? webpDimensions(bytes)
        : pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes)

  if (!dimensions || Math.max(dimensions.width, dimensions.height) < 1350) {
    throw new RangeError('Catalogue page image must be at least 1350px')
  }
  return dimensions
}

function balancedJsonObjectEnd(value: string, start: number) {
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
    }
  }
  return -1
}

function pngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  ) {
    return undefined
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { height: view.getUint32(20), width: view.getUint32(16) }
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 11 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined
  }
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2 || offset + length + 2 > bytes.length) {
      return undefined
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      }
    }
    offset += length + 2
  }
  return undefined
}

function webpDimensions(bytes: Uint8Array) {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length))
  if (bytes.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') {
    return undefined
  }
  const read24 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
  const chunk = ascii(12, 4)
  if (chunk === 'VP8X') {
    return { height: read24(27) + 1, width: read24(24) + 1 }
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      height: ((bytes[29] << 8) | bytes[28]) & 0x3fff,
      width: ((bytes[27] << 8) | bytes[26]) & 0x3fff,
    }
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { height: ((bits >> 14) & 0x3fff) + 1, width: (bits & 0x3fff) + 1 }
  }
  return undefined
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0)
    : []
}

function readySubstrateIndexes(value: unknown, sizeCount: number) {
  if (Array.isArray(value)) {
    return new Set(value.flatMap((item, index) => item === true || item === 1 ? [index] : []))
  }
  const count = integerValue(value)
  return new Set(Array.from({ length: Math.min(count ?? 0, sizeCount) }, (_, index) => index))
}

function declaredSubstrateFormat(value: unknown) {
  const format = typeof value === 'string' ? value.toLowerCase().replace(/^\./, '') : 'jpg'
  return format === 'jpeg' || format === 'png' ? format : 'jpg'
}

function integerValue(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export async function runCatalogueScout(
  env: TrolleyScoutEnv,
  leaflets: StoreLeaflet[],
  dependencyOverrides: Partial<CatalogueScoutDependencies> = {},
): Promise<CatalogueScoutResult> {
  if (!env.DB || (!env.AI && !dependencyOverrides.runVision && !dependencyOverrides.toMarkdown)) {
    return { dealCount: 0, discoveredLeafletCount: 0, scannedDocumentCount: 0 }
  }
  const dependencies: CatalogueScoutDependencies = {
    claimLease: claimCatalogueScanLease,
    discoverExternalLeaflets: discoverExternalRetailerLeaflets,
    fetcher: fetch,
    now: () => new Date().toISOString(),
    ownerToken: `catalogue-scout:${crypto.randomUUID()}`,
    readSourceCursor,
    releaseLease: releaseCatalogueScanLease,
    runVision: defaultRunVision,
    toMarkdown: defaultPdfMarkdown,
    upsertDealItems,
    writeSourceCursor,
    ...dependencyOverrides,
  }
  const externalLeaflets = await dependencies.discoverExternalLeaflets(dependencies.fetcher)
  const databaseEnv = env as TrolleyScoutEnv & { DB: D1Database }
  // Leaflets with a page manifest are read page-by-page through the vision
  // path, which is the only route that reliably yields deals: image-only PDFs
  // extract no text, and store-scouted pages are mostly dead links (404/302).
  // Give those first claim on every run, or the rotating queue spends its
  // whole budget on candidates that can never produce a deal.
  const pagerLeaflets = uniqueCatalogueLeaflets(
    leaflets.filter((leaflet) => flippingBookPagerUrl(leaflet)),
  )
  const candidates = uniqueCatalogueLeaflets([
    ...externalLeaflets,
    ...leaflets.filter((leaflet) => !flippingBookPagerUrl(leaflet)),
  ])
  let queueStart = 0
  try {
    const queueCursor = await dependencies.readSourceCursor(env, CATALOGUE_QUEUE_CURSOR_KEY)
    if (queueCursor?.kind === 'page' && candidates.length > 0) {
      queueStart = queueCursor.page % candidates.length
    }
  } catch {
    // A rollout without cursor storage still scans the first bounded window.
  }
  const priority = pagerLeaflets.slice(0, MAX_DOCUMENTS_PER_RUN)
  const selected = [
    ...priority,
    ...selectCatalogueWindow(candidates, queueStart, MAX_DOCUMENTS_PER_RUN - priority.length),
  ]
  let dealCount = 0
  let scannedDocumentCount = 0

  for (const leaflet of selected) {
    const sourceKey = await catalogueSourceKey(leaflet)
    const leaseOwnerToken = await catalogueLeaseOwnerToken(dependencies.ownerToken, sourceKey)
    const now = dependencies.now()
    const expiresAt = new Date(Date.parse(now) + LEASE_TTL_MS).toISOString()
    const claimed = await dependencies.claimLease(env.DB, {
      expiresAt,
      now,
      ownerToken: leaseOwnerToken,
      sourceKey,
    })
    if (!claimed) {
      continue
    }
    try {
      const scan = await scanResumableCatalogue(databaseEnv, leaflet, sourceKey, dependencies)
      dealCount += scan.dealCount
      scannedDocumentCount += scan.scanned ? 1 : 0
    } catch (error) {
      debugCatalogue(env.SCOUT_DEBUG === 'true', leaflet, {
        error: error instanceof Error ? error.message : String(error),
        eventStage: 'resumable_scan',
      })
    } finally {
      await dependencies.releaseLease(env.DB, sourceKey, leaseOwnerToken)
    }
  }

  if (candidates.length > 0) {
    try {
      await dependencies.writeSourceCursor(env, {
        cursor: {
          kind: 'page',
          // Advance only past the rotated candidates: the priority leaflets are
          // taken every run and are not part of this queue.
          page: (queueStart + (selected.length - priority.length)) % candidates.length,
        },
        sourceKey: CATALOGUE_QUEUE_CURSOR_KEY,
        updatedAt: dependencies.now(),
      })
    } catch {
      // Per-document progress remains valid if the queue cursor write fails.
    }
  }

  return {
    dealCount,
    discoveredLeafletCount: externalLeaflets.length,
    scannedDocumentCount,
  }
}

export function selectCatalogueWindow(
  leaflets: StoreLeaflet[],
  start: number,
  limit = MAX_DOCUMENTS_PER_RUN,
): StoreLeaflet[] {
  if (leaflets.length === 0 || limit <= 0) {
    return []
  }
  const offset = Number.isSafeInteger(start) && start >= 0 ? start % leaflets.length : 0
  const count = Math.min(Math.floor(limit), leaflets.length)
  return Array.from({ length: count }, (_, index) => leaflets[(offset + index) % leaflets.length])
}

function uniqueCatalogueLeaflets(leaflets: StoreLeaflet[]) {
  const seen = new Set<string>()
  return leaflets.filter((leaflet) => {
    const key = `${leaflet.retailerId}:${leaflet.id}:${canonicalScope(leaflet.priceScope)}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    const entryUrl = catalogueEntryUrl(leaflet)
    return Boolean(
      flippingBookPagerUrl(leaflet) ||
      (entryUrl && isPublicDocumentUrl(entryUrl)),
    )
  })
}

async function scanResumableCatalogue(
  env: TrolleyScoutEnv & { DB: D1Database },
  leaflet: StoreLeaflet,
  sourceKey: string,
  dependencies: CatalogueScoutDependencies,
): Promise<CatalogueScanOutcome> {
  const scanStartedAt = dependencies.now()
  const pagerUrl = flippingBookPagerUrl(leaflet)
  if (!pagerUrl) {
    return scanCatalogueEntry(env, leaflet, sourceKey, dependencies)
  }

  const manifestResponse = await fetchWithCatalogueTimeout(
    dependencies.fetcher,
    pagerUrl,
    {
      headers: {
        accept: 'application/json,text/javascript',
        'user-agent': BROWSER_USER_AGENT,
      },
      redirect: 'manual',
    },
  )
  if (!manifestResponse.ok) {
    throw new Error(`Pager manifest returned HTTP ${manifestResponse.status}`)
  }
  const manifestText = new TextDecoder().decode(await readBoundedBytes(
    manifestResponse,
    MAX_PAGER_BYTES,
  ))
  const documentFingerprint = await fingerprintText(manifestText)
  const pages = buildFlippingBookPages(
    leaflet,
    parseFlippingBookPager(manifestText),
    250,
  )
  if (pages.length === 0) {
    throw new Error('Pager manifest has no ready high-resolution pages')
  }
  const storedCursor = await dependencies.readSourceCursor(env, sourceKey)
  const storedState = parseCatalogueCursor(storedCursor)
  const nextPage = storedState?.documentFingerprint === documentFingerprint &&
      storedState.pageCount === pages.length
    ? storedState.nextPage
    : 1
  if (nextPage > pages.length) {
    return { dealCount: 0, scanned: false }
  }

  const page = pages[nextPage - 1]
  let downloaded: DownloadedPage
  try {
    downloaded = await downloadHighResolutionPage(dependencies.fetcher, page, leaflet)
  } catch (error) {
    if (cataloguePdfUrl(leaflet)) {
      return scanPdfCatalogue(env, leaflet, sourceKey, dependencies, {
        documentFingerprint,
        pageCount: pages.length,
      })
    }
    throw error
  }
  const vision = await dependencies.runVision(env.AI, downloaded)
  if (!hasValidVisionEnvelope(vision)) {
    throw new TypeError('Catalogue vision returned malformed JSON')
  }
  const pageDeepLink = cataloguePageDeepLink(leaflet.url, nextPage)
  const deals = extractVisionCatalogueDeals({
    capturedAt: scanStartedAt,
    documentFingerprint,
    imageUrl: downloaded.imageUrl,
    markdown: vision,
    pageDeepLink,
    pageNumber: nextPage,
    retailerId: leaflet.retailerId,
    retailerName: leaflet.retailerName,
    sourceUrl: leaflet.documentUrl ?? leaflet.url,
  })
  const candidates = await catalogueDealsToCandidates(
    deals,
    leaflet,
    sourceKey,
    documentFingerprint,
  )
  const scanFinishedAt = dependencies.now()
  await dependencies.upsertDealItems(env, {
    candidates,
    retailerId: requireRetailerSlug(leaflet.retailerId),
    run: {
      finishedAt: scanFinishedAt,
      startedAt: scanStartedAt,
      status: 'success',
    },
    sourceKey,
  })
  await dependencies.writeSourceCursor(env, {
    cursor: catalogueCursor({
      documentFingerprint,
      nextPage: nextPage + 1,
      pageCount: pages.length,
      version: 1,
    }),
    sourceKey,
    updatedAt: dependencies.now(),
  })
  return { dealCount: candidates.length, scanned: true }
}

async function scanCatalogueEntry(
  env: TrolleyScoutEnv & { DB: D1Database },
  leaflet: StoreLeaflet,
  sourceKey: string,
  dependencies: CatalogueScoutDependencies,
): Promise<CatalogueScanOutcome> {
  const entryUrl = catalogueEntryUrl(leaflet)
  if (!entryUrl || !isPublicDocumentUrl(entryUrl)) {
    throw new Error('Catalogue has no public entry URL')
  }
  const response = await fetchWithCatalogueTimeout(dependencies.fetcher, entryUrl, {
    headers: {
      accept: 'application/pdf,text/html,application/xhtml+xml',
      'user-agent': BROWSER_USER_AGENT,
    },
    redirect: 'manual',
  })
  if (!response.ok) {
    throw new Error(`Catalogue entry returned HTTP ${response.status}`)
  }
  const responseUrl = response.url || entryUrl
  if (!sameOriginUrl(entryUrl, responseUrl)) {
    throw new Error('Catalogue entry redirected outside its official origin')
  }
  const contentType = normalizedContentType(response)
  const maximumBytes = isHtmlContentType(contentType)
    ? MAX_EXTERNAL_HTML_BYTES
    : MAX_DOCUMENT_BYTES
  const bytes = await readBoundedBytes(response, maximumBytes)
  if (bytes.length === 0) {
    throw new Error('Catalogue entry was empty')
  }

  if (isPdfDocument(bytes)) {
    return persistPdfCatalogue(
      env,
      { ...leaflet, documentUrl: entryUrl },
      sourceKey,
      dependencies,
      bytes,
      entryUrl,
    )
  }
  if (!isHtmlContentType(contentType) && !isHtmlDocument(bytes)) {
    throw new Error('Catalogue entry was neither HTML nor PDF')
  }

  const html = new TextDecoder().decode(bytes)
  const resolved = resolveHtmlCatalogue(html, responseUrl, leaflet.imageUrl)
  if (resolved.pdfUrl) {
    return scanPdfCatalogue(
      env,
      { ...leaflet, documentUrl: resolved.pdfUrl },
      sourceKey,
      dependencies,
    )
  }
  if (resolved.viewerUrl) {
    return scanResumableCatalogue(
      env,
      { ...leaflet, documentUrl: undefined, url: resolved.viewerUrl },
      sourceKey,
      dependencies,
    )
  }
  if (resolved.imageUrls.length === 0) {
    throw new Error('Catalogue HTML had no official PDF, viewer, or image fallback')
  }
  return scanSingleImageCatalogue(
    env,
    leaflet,
    sourceKey,
    dependencies,
    resolved.imageUrls,
  )
}

async function scanSingleImageCatalogue(
  env: TrolleyScoutEnv & { DB: D1Database },
  leaflet: StoreLeaflet,
  sourceKey: string,
  dependencies: CatalogueScoutDependencies,
  imageUrls: string[],
) {
  const scanStartedAt = dependencies.now()
  const [imageUrl, ...fallbacks] = imageUrls.slice(0, MAX_HTML_IMAGE_CANDIDATES)
  const downloaded = await downloadHighResolutionPage(dependencies.fetcher, {
    fallbacks,
    height: 1350,
    imageUrl,
    pageNumber: 1,
    width: 1350,
  }, leaflet)
  const documentFingerprint = await fingerprintBytes(downloaded.bytes)
  const storedCursor = await dependencies.readSourceCursor(env, sourceKey)
  const storedState = parseCatalogueCursor(storedCursor)
  if (
    storedState?.documentFingerprint === documentFingerprint &&
    storedState.pageCount === 1 &&
    storedState.nextPage > 1
  ) {
    return { dealCount: 0, scanned: false }
  }
  const vision = await dependencies.runVision(env.AI, downloaded)
  if (!hasValidVisionEnvelope(vision)) {
    throw new TypeError('Catalogue vision returned malformed JSON')
  }
  const deals = extractVisionCatalogueDeals({
    capturedAt: scanStartedAt,
    documentFingerprint,
    imageUrl: downloaded.imageUrl,
    markdown: vision,
    pageDeepLink: cataloguePageDeepLink(leaflet.url, 1),
    pageNumber: 1,
    retailerId: leaflet.retailerId,
    retailerName: leaflet.retailerName,
    sourceUrl: catalogueEntryUrl(leaflet) ?? leaflet.url,
  })
  const candidates = await catalogueDealsToCandidates(
    deals,
    leaflet,
    sourceKey,
    documentFingerprint,
  )
  const scanFinishedAt = dependencies.now()
  await dependencies.upsertDealItems(env, {
    candidates,
    retailerId: requireRetailerSlug(leaflet.retailerId),
    run: {
      finishedAt: scanFinishedAt,
      startedAt: scanStartedAt,
      status: 'success',
    },
    sourceKey,
  })
  await dependencies.writeSourceCursor(env, {
    cursor: catalogueCursor({
      documentFingerprint,
      nextPage: 2,
      pageCount: 1,
      version: 1,
    }),
    sourceKey,
    updatedAt: dependencies.now(),
  })
  return { dealCount: candidates.length, scanned: true }
}

async function scanPdfCatalogue(
  env: TrolleyScoutEnv & { DB: D1Database },
  leaflet: StoreLeaflet,
  sourceKey: string,
  dependencies: CatalogueScoutDependencies,
  manifestOverride?: { documentFingerprint: string; pageCount: number },
) {
  const documentUrl = cataloguePdfUrl(leaflet)
  if (!documentUrl) {
    throw new Error('Catalogue has no official PDF fallback')
  }
  const response = await fetchWithCatalogueTimeout(dependencies.fetcher, documentUrl, {
    headers: {
      accept: 'application/pdf',
      'user-agent': BROWSER_USER_AGENT,
    },
    redirect: 'manual',
  })
  if (!response.ok) {
    throw new Error(`Catalogue PDF returned HTTP ${response.status}`)
  }
  if (response.url && !sameOriginUrl(documentUrl, response.url)) {
    throw new Error('Catalogue PDF redirected outside its official origin')
  }
  const bytes = await readBoundedBytes(response, MAX_DOCUMENT_BYTES)
  if (!isPdfDocument(bytes)) {
    throw new Error('Catalogue PDF response was not a PDF document')
  }
  return persistPdfCatalogue(
    env,
    leaflet,
    sourceKey,
    dependencies,
    bytes,
    documentUrl,
    manifestOverride,
  )
}

async function persistPdfCatalogue(
  env: TrolleyScoutEnv & { DB: D1Database },
  leaflet: StoreLeaflet,
  sourceKey: string,
  dependencies: CatalogueScoutDependencies,
  bytes: Uint8Array,
  documentUrl: string,
  manifestOverride?: { documentFingerprint: string; pageCount: number },
) {
  const scanStartedAt = dependencies.now()
  const documentFingerprint = manifestOverride?.documentFingerprint ?? await fingerprintBytes(bytes)
  const pageCount = manifestOverride?.pageCount ?? 1
  const storedCursor = await dependencies.readSourceCursor(env, sourceKey)
  const storedState = parseCatalogueCursor(storedCursor)
  if (
    storedState?.documentFingerprint === documentFingerprint &&
    storedState.pageCount === pageCount &&
    storedState.nextPage > pageCount
  ) {
    return { dealCount: 0, scanned: false }
  }
  const markdown = await dependencies.toMarkdown(
    env.AI,
    copyArrayBuffer(bytes),
    catalogueFileName(documentUrl),
  )
  const deals = extractCatalogueDeals({
    capturedAt: scanStartedAt,
    documentFingerprint,
    imageUrl: leaflet.imageUrl,
    markdown,
    retailerId: leaflet.retailerId,
    retailerName: leaflet.retailerName,
    sourceUrl: documentUrl,
  })
  const candidates = await catalogueDealsToCandidates(
    deals,
    leaflet,
    sourceKey,
    documentFingerprint,
  )
  const scanFinishedAt = dependencies.now()
  await dependencies.upsertDealItems(env, {
    candidates,
    retailerId: requireRetailerSlug(leaflet.retailerId),
    run: {
      finishedAt: scanFinishedAt,
      startedAt: scanStartedAt,
      status: 'success',
    },
    sourceKey,
  })
  await dependencies.writeSourceCursor(env, {
    cursor: catalogueCursor({
      documentFingerprint,
      nextPage: pageCount + 1,
      pageCount,
      version: 1,
    }),
    sourceKey,
    updatedAt: dependencies.now(),
  })
  return { dealCount: candidates.length, scanned: true }
}

async function downloadHighResolutionPage(
  fetcher: typeof fetch,
  page: CataloguePage,
  leaflet: StoreLeaflet,
): Promise<DownloadedPage> {
  const documentUrl = leaflet.documentUrl
  const urls = [page.imageUrl, ...(page.fallbacks ?? [])]
    .filter((url) => url !== documentUrl && !/\.pdf(?:$|[?#])/i.test(url))
  for (const imageUrl of urls) {
    try {
      const response = await fetchWithCatalogueTimeout(fetcher, imageUrl, {
        headers: {
          accept: 'image/webp,image/jpeg,image/png',
          'user-agent': BROWSER_USER_AGENT,
        },
        redirect: 'manual',
      })
      if (!response.ok) {
        continue
      }
      const bytes = await readBoundedBytes(response, MAX_PAGE_IMAGE_BYTES)
      const contentType = response.headers.get('content-type') ?? imageContentType(imageUrl)
      readHighResolutionImageDimensions(bytes, contentType)
      return { bytes, contentType, imageUrl }
    } catch {
      // Try the next official high-resolution substrate.
    }
  }
  throw new Error('No valid high-resolution catalogue page image was available')
}

async function catalogueDealsToCandidates(
  deals: ReturnType<typeof extractCatalogueDeals>,
  leaflet: StoreLeaflet,
  sourceKey: string,
  documentFingerprint: string,
): Promise<RetailerDealCandidate[]> {
  const retailerId = requireRetailerSlug(leaflet.retailerId)
  const scope = leaflet.priceScope ?? { type: 'national' as const }
  return Promise.all(deals.map(async (deal) => {
    const priceCents = randPriceToCents(deal.priceText)
    if (priceCents === undefined) {
      throw new TypeError('Catalogue deal has an invalid current price')
    }
    const parsedPrevious = randPriceToCents(deal.previousPriceText)
    const previousPriceCents = parsedPrevious !== undefined && parsedPrevious > priceCents
      ? parsedPrevious
      : undefined
    const titleFingerprint = await fingerprintText(deal.title.trim().toLocaleLowerCase())
    const pageNumber = deal.pageNumber ?? 1
    const pageImageUrl = deal.imageUrl ?? leaflet.imageUrl
    const deepLink = deal.catalogueDeepLink ?? cataloguePageDeepLink(leaflet.url, pageNumber)
    const evidenceText = JSON.stringify({
      crop: deal.imageCrop,
      deepLink,
      documentFingerprint,
      pageImageUrl,
      pageNumber: deal.pageNumber,
      priceCents,
      previousPriceCents,
      promotionMarker: 'catalogue-page',
      sourceId: titleFingerprint.slice(0, 24),
    })
    return {
      capturedAt: deal.capturedAt,
      evidenceText,
      imageUrl: pageImageUrl,
      priceCents,
      previousPriceCents,
      productId: `catalogue-${titleFingerprint.slice(0, 24)}`,
      productUrl: deepLink,
      promotionId: `${sourceKey.slice(-24)}-page-${pageNumber}-${titleFingerprint.slice(0, 16)}`,
      retailerId,
      savingText: previousPriceCents === undefined
        ? undefined
        : `Save R${((previousPriceCents - priceCents) / 100).toFixed(2)}`,
      scope,
      sourceKind: 'catalogue' as const,
      sourceUrl: leaflet.documentUrl ?? leaflet.url,
      title: deal.title,
      validFrom: leaflet.validFrom,
      validTo: leaflet.validTo,
    }
  }))
}

function hasValidVisionEnvelope(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const parsed: unknown = JSON.parse(normalized)
    return isRecord(parsed) && Array.isArray(parsed.deals)
  } catch {
    return false
  }
}

function cataloguePageDeepLink(value: string, pageNumber: number) {
  try {
    const url = new URL(value)
    url.hash = `page=${pageNumber}`
    return url.toString()
  } catch {
    return value
  }
}

function randPriceToCents(value: string | undefined) {
  if (!value) {
    return undefined
  }
  const cleaned = value.replace(/[^\d,.-]/g, '')
  const normalized = /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : undefined
}

function requireRetailerSlug(value: string) {
  const retailerId = parseRetailerSlug(value)
  if (!retailerId) {
    throw new TypeError('Catalogue retailer id is invalid')
  }
  return retailerId
}

const CATALOGUE_CURSOR_PREFIX = 'trolley-scout:catalogue-page:v1:'

function catalogueCursor(state: CatalogueCursorState): FeedCursor {
  return {
    kind: 'token',
    token: `${CATALOGUE_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(state))}`,
  }
}

function parseCatalogueCursor(cursor: FeedCursor | undefined): CatalogueCursorState | undefined {
  if (cursor?.kind !== 'token' || !cursor.token.startsWith(CATALOGUE_CURSOR_PREFIX)) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(cursor.token.slice(CATALOGUE_CURSOR_PREFIX.length)))
    if (
      !isRecord(parsed) || parsed.version !== 1 ||
      typeof parsed.documentFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(parsed.documentFingerprint) ||
      !Number.isSafeInteger(parsed.nextPage) || (parsed.nextPage as number) < 1 ||
      !Number.isSafeInteger(parsed.pageCount) || (parsed.pageCount as number) < 1
    ) {
      return undefined
    }
    return parsed as unknown as CatalogueCursorState
  } catch {
    return undefined
  }
}

async function fetchWithCatalogueTimeout(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetcher(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedBytes(response: Response, maximum: number) {
  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > maximum) {
    throw new RangeError(`Response exceeded ${maximum} bytes`)
  }
  if (!response.body) {
    return new Uint8Array()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }
    length += chunk.value.byteLength
    if (length > maximum) {
      await reader.cancel()
      throw new RangeError(`Response exceeded ${maximum} bytes`)
    }
    chunks.push(chunk.value)
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function fingerprintBytes(value: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function copyArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

function imageContentType(value: string) {
  return /\.png(?:$|[?#])/i.test(value)
    ? 'image/png'
    : /\.jpe?g(?:$|[?#])/i.test(value)
      ? 'image/jpeg'
      : 'image/webp'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function defaultRunVision(ai: Ai | undefined, page: DownloadedPage) {
  if (!ai) {
    throw new Error('Catalogue vision requires an AI binding')
  }
  // Must stay bound to the binding: calling a detached ai.run leaves `this`
  // undefined and the Ai class throws "Cannot set properties of undefined
  // (setting '#options')" before it ever reaches the model.
  const runVision = (ai.run as unknown as (
    model: string,
    input: unknown,
  ) => Promise<VisionChatResponse>).bind(ai)
  const output = await runVision('@cf/mistralai/mistral-small-3.1-24b-instruct', {
    max_completion_tokens: 2400,
    messages: [{
      content: [
        { text: CATALOGUE_VISION_PROMPT, type: 'text' },
        {
          image_url: { detail: 'high', url: imageDataUrl(page.bytes, page.contentType) },
          type: 'image_url',
        },
      ],
      role: 'user',
    }],
    response_format: {
      json_schema: {
        name: 'catalogue_deals',
        schema: {
          additionalProperties: false,
          properties: {
            deals: {
              items: {
                additionalProperties: false,
                properties: {
                  box: {
                    additionalProperties: false,
                    properties: {
                      height: { type: 'number' },
                      width: { type: 'number' },
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                    required: ['x', 'y', 'width', 'height'],
                    type: 'object',
                  },
                  previousPrice: { type: 'string' },
                  price: { type: 'string' },
                  title: { type: 'string' },
                },
                required: ['title', 'price', 'box'],
                type: 'object',
              },
              maxItems: 30,
              type: 'array',
            },
          },
          required: ['deals'],
          type: 'object',
        },
        strict: true,
      },
      type: 'json_schema',
    },
    temperature: 0.1,
  })
  return output.choices?.[0]?.message?.content ?? ''
}

export async function defaultPdfMarkdown(
  ai: Ai | undefined,
  document: ArrayBuffer,
  name: string,
) {
  if (!ai) {
    throw new Error('Catalogue PDF conversion requires an AI binding')
  }
  // Image conversion rasterises every page and blows the Worker's 128MB limit
  // for any real leaflet — measured OOM even on a 1.1MB PDF with
  // maxConvertedImages: 1. An OOM kills the whole isolate, so it took the
  // entire scheduled scout down with it and almost no deals were ever stored.
  // Text extraction is cheap and safe; catalogues that are pure images yield
  // nothing here and are scanned page-by-page through the vision path instead.
  const conversion = await ai.toMarkdown(
    { blob: new Blob([document], { type: 'application/pdf' }), name },
    {
      conversionOptions: {
        pdf: {
          images: { convert: false },
          metadata: false,
        },
      },
    },
  )
  if (conversion.format !== 'markdown') {
    throw new Error(conversion.error ?? 'Catalogue PDF conversion failed')
  }
  return conversion.data
}

async function discoverExternalRetailerLeaflets(fetcher: typeof fetch) {
  const capturedAt = new Date().toISOString()
  const settled = await Promise.all(
    externalRetailerTargets.map(async (target) => {
      try {
        const response = await fetchWithCatalogueTimeout(fetcher, target.sourceUrl, {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': BROWSER_USER_AGENT,
          },
        })

        if (!response.ok) {
          return []
        }

        const html = new TextDecoder().decode(await readBoundedBytes(
          response,
          MAX_EXTERNAL_HTML_BYTES,
        ))
        return extractRetailerLeafletsFromHtml(target, html, capturedAt)
      } catch {
        return []
      }
    }),
  )

  return settled.flat()
}

function debugCatalogue(
  enabled: boolean,
  leaflet: StoreLeaflet,
  details: Record<string, unknown>,
) {
  if (enabled) {
    console.log(JSON.stringify({
      event: 'catalogue_debug',
      leaflet: leaflet.name,
      retailer: leaflet.retailerName,
      ...details,
    }))
  }
}

function imageDataUrl(bytes: Uint8Array, contentType: string) {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return `data:${contentType};base64,${btoa(binary)}`
}

interface HtmlCatalogueResolution {
  imageUrls: string[]
  pdfUrl?: string
  viewerUrl?: string
}

function resolveHtmlCatalogue(
  html: string,
  pageUrl: string,
  leafletImageUrl?: string,
): HtmlCatalogueResolution {
  let pdfUrl: string | undefined
  let viewerUrl: string | undefined
  const imageUrls: string[] = []
  const seenImages = new Set<string>()
  const addImage = (value: string | undefined, allowCrossOrigin = false) => {
    if (!value || imageUrls.length >= MAX_HTML_IMAGE_CANDIDATES) {
      return
    }
    const url = allowCrossOrigin
      ? publicAbsoluteUrl(value, pageUrl)
      : sameOriginAbsoluteUrl(value, pageUrl)
    if (!url || seenImages.has(url)) {
      return
    }
    seenImages.add(url)
    imageUrls.push(url)
  }

  addImage(leafletImageUrl, true)
  const resourceTags = html.match(/<(?:a|iframe|embed|object)\b[^>]*>/gi) ?? []
  for (const tag of resourceTags.slice(0, MAX_HTML_LINK_CANDIDATES)) {
    const value = htmlAttribute(tag, ['href', 'src', 'data'])
    const url = sameOriginAbsoluteUrl(value, pageUrl)
    if (!url) {
      continue
    }
    if (!pdfUrl && isPdfUrl(url)) {
      pdfUrl = url
    } else if (!viewerUrl && isFlippingBookViewerUrl(url)) {
      viewerUrl = url
    } else if (isImageUrl(url)) {
      addImage(url)
    }
  }

  const imageTags = html.match(/<(?:img|source|meta)\b[^>]*>/gi) ?? []
  for (const tag of imageTags.slice(0, MAX_HTML_LINK_CANDIDATES)) {
    if (/^<meta\b/i.test(tag) && !/(?:og:image|twitter:image)/i.test(tag)) {
      continue
    }
    for (const value of srcsetUrls(htmlAttribute(tag, ['srcset']))) {
      addImage(value)
    }
    addImage(htmlAttribute(tag, ['src', 'data-src', 'data-original', 'content']))
  }

  return { imageUrls, pdfUrl, viewerUrl }
}

function htmlAttribute(tag: string, names: string[]) {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const match = tag.match(new RegExp(`\\s(?:${escaped})\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))
  return match ? decodeHtmlUrl(match[2].trim()) : undefined
}

function srcsetUrls(value: string | undefined) {
  if (!value) {
    return []
  }
  return value
    .split(',')
    .map((part) => {
      const [url, descriptor = '0'] = part.trim().split(/\s+/, 2)
      const weight = Number(descriptor.replace(/[^\d.]/g, '')) || 0
      return { url, weight }
    })
    .filter((item) => item.url)
    .sort((left, right) => right.weight - left.weight)
    .map((item) => item.url)
}

function decodeHtmlUrl(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
}

function publicAbsoluteUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl).toString()
    return isPublicDocumentUrl(url) ? url : undefined
  } catch {
    return undefined
  }
}

function sameOriginAbsoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) {
    return undefined
  }
  const url = publicAbsoluteUrl(value, baseUrl)
  return url && sameOriginUrl(url, baseUrl) ? url : undefined
}

function sameOriginUrl(left: string, right: string) {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

function isPdfUrl(value: string) {
  try {
    const url = new URL(value)
    return /\.pdf(?:$|[/?#=&])/i.test(`${url.pathname}${url.search}`)
  } catch {
    return false
  }
}

function isFlippingBookViewerUrl(value: string) {
  try {
    return /\/index\.html$/i.test(new URL(value).pathname)
  } catch {
    return false
  }
}

function isImageUrl(value: string) {
  try {
    return /\.(?:avif|jpe?g|png|webp)$/i.test(new URL(value).pathname)
  } catch {
    return false
  }
}

function normalizedContentType(response: Response) {
  return response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
}

function isHtmlContentType(value: string) {
  return value === 'text/html' || value === 'application/xhtml+xml'
}

function isHtmlDocument(value: Uint8Array) {
  const prefix = new TextDecoder().decode(value.subarray(0, 512)).trimStart().toLowerCase()
  return prefix.startsWith('<!doctype html') || prefix.startsWith('<html')
}

function isPdfDocument(value: Uint8Array) {
  return value.length >= 5 &&
    value[0] === 0x25 &&
    value[1] === 0x50 &&
    value[2] === 0x44 &&
    value[3] === 0x46 &&
    value[4] === 0x2d
}

function catalogueEntryUrl(leaflet: StoreLeaflet) {
  return leaflet.documentUrl ?? leaflet.url
}

function cataloguePdfUrl(leaflet: StoreLeaflet) {
  const entryUrl = catalogueEntryUrl(leaflet)
  return entryUrl && isPdfUrl(entryUrl) ? entryUrl : undefined
}

function catalogueFileName(url: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? 'catalogue.pdf')
    return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
  } catch {
    return 'catalogue.pdf'
  }
}

function isPublicDocumentUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()

    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      hostname !== 'localhost' &&
      hostname !== '0.0.0.0' &&
      hostname !== '127.0.0.1' &&
      hostname !== '[::1]' &&
      !hostname.endsWith('.local')
    )
  } catch {
    return false
  }
}

function recordValue(value: unknown, key: string) {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined
}
