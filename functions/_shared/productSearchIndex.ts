import { spendAiBudget } from './aiBudget'
import type { TrolleyScoutEnv } from './env'
import { runMeteredAi } from './workersAi'

/**
 * Semantic search over what the shops are actually selling.
 *
 * Today Mr Scout finds products by pulling search terms out of a message, and
 * pays for an extra model call when it cannot recognise one ("teh cheapest
 * airforce sneaker"). An embedding match handles the typo and the brand-as-
 * category problem without that second call.
 *
 * It deliberately does NOT hold prices. A vector index is a stale copy the
 * moment a special ends, and this app's promise is dated, source-linked
 * prices. So the index answers "which products" and D1 answers "how much",
 * which keeps the live number the only number a shopper ever sees.
 */

/**
 * 384 dimensions, not 768.
 *
 * Vectorize includes 10 million STORED dimensions, and stored dimensions are
 * vectors x dimensions. bge-base at 768 would cap us at about 11,000 products;
 * bge-small at 384 doubles that to roughly 22,000, which fits the catalogue
 * with room to grow. For short product titles the quality difference is small
 * and the headroom is not.
 */
export const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5'
export const EMBEDDING_DIMENSIONS = 384

/** How many products fit inside the included storage, with the safety margin. */
export const MAX_INDEXED_PRODUCTS = Math.floor(
  (10_000_000 * 0.85) / EMBEDDING_DIMENSIONS,
)

export interface IndexableProduct {
  id: string
  title: string
  retailerName: string
  categoryText?: string
}

export interface ProductMatch {
  id: string
  score: number
}

/** Text the embedding is built from. Prices are deliberately absent. */
export function embeddingTextFor(product: IndexableProduct): string {
  return [product.title, product.retailerName, product.categoryText]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 512)
}

/**
 * Embeds and stores a batch of products.
 *
 * Returns how many were indexed; zero means the budget or the binding said no,
 * which leaves keyword search as it was.
 */
export async function indexProducts(
  env: TrolleyScoutEnv,
  products: readonly IndexableProduct[],
  options: { now?: Date } = {},
): Promise<number> {
  const index = env.PRODUCT_INDEX
  if (!index || products.length === 0) return 0

  const now = options.now ?? new Date()
  const batch = products.slice(0, MAX_EMBED_BATCH)

  // Storage is a standing cost, not a monthly one: these dimensions keep
  // counting until the vectors are deleted.
  const storedDims = batch.length * EMBEDDING_DIMENSIONS
  if (!(await spendAiBudget(env, 'vectorStoredDims', storedDims, now))) {
    return 0
  }

  const embeddings = await runMeteredAi<{ data: number[][] }>(
    env,
    EMBEDDING_MODEL,
    { text: batch.map(embeddingTextFor) },
    { now },
  )
  const vectors = embeddings?.data
  if (!Array.isArray(vectors) || vectors.length !== batch.length) return 0

  await index.upsert(
    batch.map((product, position) => ({
      id: product.id,
      metadata: {
        retailerName: product.retailerName,
        title: product.title,
      },
      values: vectors[position],
    })),
  )
  return batch.length
}

/** Vectorize refuses more than this per call. */
export const MAX_EMBED_BATCH = 100

/**
 * Finds the products a phrase is about, best match first.
 *
 * An empty result means the caller should fall back to keyword search, which
 * is what it did before this existed.
 */
export async function searchProducts(
  env: TrolleyScoutEnv,
  query: string,
  options: { limit?: number; now?: Date } = {},
): Promise<ProductMatch[]> {
  const index = env.PRODUCT_INDEX
  const text = query.trim()
  if (!index || text.length === 0) return []

  const now = options.now ?? new Date()
  if (
    !(await spendAiBudget(env, 'vectorQueryDims', EMBEDDING_DIMENSIONS, now))
  ) {
    return []
  }

  const embedding = await runMeteredAi<{ data: number[][] }>(
    env,
    EMBEDDING_MODEL,
    { text: [text] },
    { now },
  )
  const vector = embedding?.data?.[0]
  if (!Array.isArray(vector)) return []

  const result = await index.query(vector, {
    topK: Math.min(Math.max(1, options.limit ?? 20), 50),
  })
  const matches = Array.isArray(result?.matches) ? result.matches : []
  return matches
    .filter((match) => typeof match?.id === 'string')
    .map((match) => ({
      id: String(match.id),
      score: typeof match.score === 'number' ? match.score : 0,
    }))
}

/** Drops products that have left the catalogue, freeing stored dimensions. */
export async function forgetProducts(
  env: TrolleyScoutEnv,
  ids: readonly string[],
  options: { now?: Date } = {},
): Promise<number> {
  const index = env.PRODUCT_INDEX
  if (!index || ids.length === 0) return 0
  const removable = ids.slice(0, MAX_EMBED_BATCH)
  await index.deleteByIds([...removable])
  // Hand the storage back so a long-running catalogue does not creep past the
  // included allowance one expired special at a time.
  const { refundAiBudget } = await import('./aiBudget')
  await refundAiBudget(
    env,
    'vectorStoredDims',
    removable.length * EMBEDDING_DIMENSIONS,
    options.now ?? new Date(),
  )
  return removable.length
}
