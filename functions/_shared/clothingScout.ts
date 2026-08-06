import { CLOTHING_RETAILERS, type ClothingRetailer } from '../../src/data/clothingRetailers'
import {
  buildClothingCatalogueUrl,
  parseClothingCatalogue,
  type ClothingProduct,
} from '../../src/services/clothingCatalogue'
import type { TrolleyScoutEnv } from './env'
import {
  pruneStaleClothing,
  recordClothingRun,
  saveClothingItems,
} from './clothingStore'

// Reads fashion storefronts into the fitting room. Deliberately bounded: a
// Worker has a subrequest budget, so one run sweeps a slice of the registry
// and the cursor moves on, the same way the deal lanes work.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const REQUEST_TIMEOUT_MS = 12_000
const MAX_BODY_BYTES = 6 * 1024 * 1024
const DEFAULT_PAGES = 2
const STORES_PER_RUN = 6

export interface ClothingSweepSummary {
  failed: number
  productsSaved: number
  storesSwept: number
  nextCursor: number
}

export type ClothingFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Response>

export async function sweepClothingRetailers(
  env: TrolleyScoutEnv,
  options: {
    cursor?: number
    fetcher?: ClothingFetcher
    now?: Date
    retailers?: ClothingRetailer[]
    storesPerRun?: number
  } = {},
): Promise<ClothingSweepSummary> {
  const retailers = options.retailers ?? CLOTHING_RETAILERS
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? new Date()
  const perRun = Math.max(1, options.storesPerRun ?? STORES_PER_RUN)
  const start = retailers.length === 0
    ? 0
    : ((options.cursor ?? 0) % retailers.length + retailers.length) % retailers.length

  let productsSaved = 0
  let failed = 0
  let storesSwept = 0

  for (let step = 0; step < Math.min(perRun, retailers.length); step += 1) {
    const retailer = retailers[(start + step) % retailers.length]
    storesSwept += 1
    try {
      const products = await readRetailerCatalogue(retailer, fetcher)
      if (products.length === 0) {
        await recordClothingRun(env, retailer.id, 'empty', 0, undefined, now)
        continue
      }
      const saved = await saveClothingItems(
        env,
        retailer.id,
        retailer.name,
        products,
        now,
        retailer.assumeType,
      )
      productsSaved += saved
      await recordClothingRun(env, retailer.id, 'success', saved, undefined, now)
    } catch (error) {
      failed += 1
      await recordClothingRun(
        env,
        retailer.id,
        'failed',
        0,
        error instanceof Error ? error.message : String(error),
        now,
      )
    }
  }

  await pruneStaleClothing(env, now)

  return {
    failed,
    nextCursor: retailers.length === 0
      ? 0
      : (start + Math.min(perRun, retailers.length)) % retailers.length,
    productsSaved,
    storesSwept,
  }
}

export async function readRetailerCatalogue(
  retailer: ClothingRetailer,
  fetcher: ClothingFetcher = fetch,
): Promise<ClothingProduct[]> {
  const products: ClothingProduct[] = []
  const seen = new Set<string>()
  const pages = Math.max(1, retailer.pages ?? DEFAULT_PAGES)

  for (let page = 1; page <= pages; page += 1) {
    const url = buildClothingCatalogueUrl(retailer.platform, retailer.origin, page)
    if (!url) break

    const response = await fetcher(url, {
      headers: { accept: 'application/json', 'user-agent': BROWSER_UA },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    // VTEX answers a windowed catalogue with 206, which is a success — an
    // adapter testing for exactly 200 would throw its whole rail away.
    if (!response.ok) break

    const text = await readBoundedText(response, MAX_BODY_BYTES)
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      break
    }

    const parsed = parseClothingCatalogue(
      retailer.platform,
      payload,
      retailer.origin,
      { imageIndex: retailer.imageIndex },
    )
    if (parsed.length === 0) break

    for (const product of parsed) {
      if (seen.add(product.externalId)) products.push(product)
    }
  }

  return products
}

async function readBoundedText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteCount = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      byteCount += result.value.byteLength
      // A truncated page is unreadable, but stopping the read keeps a huge
      // catalogue from exhausting the Worker's memory.
      if (byteCount > maximumBytes) break
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(byteCount)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
