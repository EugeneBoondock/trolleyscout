import type { FeedCursor } from '../../src/services/retailerFeeds/types'
import {
  extractAmazonVoucherCandidates,
  extractPublicVoucherCandidates,
} from '../../src/services/vouchers/voucherDiscovery'
import type { VoucherCandidate } from '../../src/services/vouchers/types'
import type { TrolleyScoutEnv } from './env'
import {
  STAPLE_SWEEP_TERMS,
  sweepRetailerPromotions,
} from './retailerPromotionVouchers'
import { fetchAffiliateVoucherFeeds } from './affiliateVoucherFeeds'
import { submitVoucherCode } from './voucherCodeStore'
import { recordVoucherSourceYield } from './voucherSourceScout'
import {
  expireVouchers,
  readVoucherSourceCursor,
  upsertVouchers,
  writeVoucherSourceCursor,
} from './voucherStore'

const MAX_VOUCHERS_PER_SOURCE_RUN = 100
const DEFAULT_MAX_BODY_BYTES = 4_000_000
const CURSOR_VERSION = 1
// A single run never floods the store from one feed; the rest arrive next run.
const MAX_AFFILIATE_CODES_PER_RUN = 60

export interface VoucherScoutSource {
  parser: 'amazon' | 'promotion-sweep' | 'public-code'
  retailerId: string
  sourceKey: string
  /** Staple terms to sweep. Only read by the promotion-sweep parser. */
  terms?: readonly string[]
  url: string
}

export interface VoucherScoutRepository {
  expire(): Promise<number>
  readCursor(sourceKey: string): Promise<FeedCursor | undefined>
  upsert(input: {
    candidates: readonly VoucherCandidate[]
    errorText?: string
    retailerId: string
    sourceKey: string
    status?: 'failed' | 'partial' | 'success'
  }): Promise<{ processed: number; rowIds: string[]; runId: string }>
  writeCursor(sourceKey: string, cursor: FeedCursor): Promise<void>
}

export interface VoucherScoutSourceResult {
  checkedAt: string
  discovered: number
  remaining: number
  retailerId: string
  sourceKey: string
  status: 'failed' | 'partial' | 'success'
  written: number
}

/**
 * In-store and on-site offers: loyalty prices and clip coupons.
 *
 * These are not checkout codes, and they are no longer presented as if they
 * were — a voucher, to a shopper, is something they paste into a promo-code
 * box. Codes live in voucherCodeStore, and come from shoppers and from
 * licensed affiliate feeds, because they cannot be scraped: retailers do not
 * publish them, and the coupon aggregators hide the value behind a reveal
 * click that only resolves on their own outbound redirect.
 */
export const defaultVoucherSources: readonly VoucherScoutSource[] = [
  {
    parser: 'promotion-sweep',
    retailerId: 'pick-n-pay',
    sourceKey: 'pick-n-pay::smart-shopper',
    terms: STAPLE_SWEEP_TERMS,
    url: 'https://www.pnp.co.za',
  },
  {
    parser: 'promotion-sweep',
    retailerId: 'checkers',
    sourceKey: 'checkers::xtra-savings',
    terms: STAPLE_SWEEP_TERMS,
    url: 'https://www.checkers.co.za',
  },
  {
    parser: 'promotion-sweep',
    retailerId: 'shoprite',
    sourceKey: 'shoprite::xtra-savings',
    terms: STAPLE_SWEEP_TERMS,
    url: 'https://www.shoprite.co.za',
  },
  {
    // /coupons now 301s to the deals collection; fetch the destination
    // directly — it embeds the same clip-coupon product objects.
    parser: 'amazon',
    retailerId: 'amazon-za',
    sourceKey: 'amazon-za::vouchers',
    url: 'https://www.amazon.co.za/deals?bubble-id=deals-collection-coupons',
  },
  // Boxer's "eCoupons" are purchasable gift money, not discounts — never a
  // voucher source.
  {
    // Kept because Yuppiechef does occasionally announce a code in prose;
    // /specials.htm now 301s here, and following it lost the page body.
    parser: 'public-code',
    retailerId: 'yuppiechef',
    sourceKey: 'yuppiechef::promotion-codes',
    url: 'https://www.yuppiechef.com/promotions.htm',
  },
]

export async function runVoucherScout(
  env: TrolleyScoutEnv,
  options: {
    fetchImpl?: typeof fetch
    maxBodyBytes?: number
    repository?: VoucherScoutRepository
    sources?: readonly VoucherScoutSource[]
  } = {},
) {
  const repository = options.repository ?? databaseRepository(env)
  const fetchImpl = options.fetchImpl ?? fetch
  const maxBodyBytes = boundedBodyLimit(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)
  const sources = (options.sources ?? defaultVoucherSources).slice(0, 8)
  const results: VoucherScoutSourceResult[] = []

  for (const source of sources) {
    const checkedAt = new Date().toISOString()
    try {
      const sourceUrl = validatedSourceUrl(source)
      const candidates = source.parser === 'promotion-sweep'
        ? await sweepRetailerPromotions({
            capturedAt: checkedAt,
            fetchImpl,
            retailerId: source.retailerId,
            terms: source.terms ?? STAPLE_SWEEP_TERMS,
          })
        : await scrapeVoucherCandidates(
            source,
            sourceUrl,
            checkedAt,
            fetchImpl,
            maxBodyBytes,
            env.JINA_API_KEY,
          )
      const fingerprint = await candidateFingerprint(candidates)
      const storedCursor = await repository.readCursor(source.sourceKey)
      const offset = sourceOffset(storedCursor, fingerprint, candidates.length)
      const batch = candidates.slice(offset, offset + MAX_VOUCHERS_PER_SOURCE_RUN)
      const nextOffset = offset + batch.length < candidates.length ? offset + batch.length : 0
      const remaining = Math.max(0, candidates.length - offset - batch.length)
      const status = remaining > 0 ? 'partial' : 'success'
      const write = await repository.upsert({
        candidates: batch,
        retailerId: source.retailerId,
        sourceKey: source.sourceKey,
        status,
      })
      await repository.writeCursor(source.sourceKey, {
        kind: 'token',
        token: JSON.stringify({ fingerprint, offset: nextOffset, version: CURSOR_VERSION }),
      })
      // A discovered source that stops yielding is retired rather than
      // retried forever, which is how the old hand-written list stayed broken.
      await recordVoucherSourceYield(env, source.sourceKey, candidates.length)
        .catch(() => undefined)
      results.push({
        checkedAt,
        discovered: candidates.length,
        remaining,
        retailerId: source.retailerId,
        sourceKey: source.sourceKey,
        status,
        written: write.processed,
      })
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Voucher source failed').slice(0, 2_000)
      try {
        await repository.upsert({
          candidates: [],
          errorText: message,
          retailerId: source.retailerId,
          sourceKey: source.sourceKey,
          status: 'failed',
        })
      } catch {
        // The source result still records the failure when its audit write is unavailable.
      }
      results.push({
        checkedAt,
        discovered: 0,
        remaining: 0,
        retailerId: source.retailerId,
        sourceKey: source.sourceKey,
        status: 'failed',
        written: 0,
      })
    }
  }

  const expired = await repository.expire()
  const codes = await collectAffiliateCodes(env, fetchImpl)
  return { codes, expired, sources: results }
}

/**
 * Pulls checkout codes from any affiliate network that has credentials, into
 * the same store the shopper-submitted ones live in. A network without
 * credentials reports why rather than failing.
 */
async function collectAffiliateCodes(
  env: TrolleyScoutEnv,
  fetchImpl: typeof fetch,
): Promise<{ collected: number; networks: string[] }> {
  const networks: string[] = []
  let collected = 0

  try {
    for (const feed of await fetchAffiliateVoucherFeeds(env, fetchImpl)) {
      if (feed.vouchers.length === 0) {
        if (feed.message) networks.push(`${feed.network}: ${feed.message}`)
        continue
      }
      for (const draft of feed.vouchers.slice(0, MAX_AFFILIATE_CODES_PER_RUN)) {
        const saved = await submitVoucherCode(env, draft).catch(() => undefined)
        if (saved?.voucherCode) collected += 1
      }
      networks.push(`${feed.network}: ${feed.vouchers.length} codes`)
    }
  } catch {
    // Codes are additive; a feed failure never costs the voucher sweep.
  }

  return { collected, networks }
}

async function scrapeVoucherCandidates(
  source: VoucherScoutSource,
  sourceUrl: string,
  capturedAt: string,
  fetchImpl: typeof fetch,
  maxBodyBytes: number,
  jinaApiKey?: string,
): Promise<VoucherCandidate[]> {
  const html = await fetchVoucherSourceHtml(
    source,
    sourceUrl,
    fetchImpl,
    maxBodyBytes,
    jinaApiKey,
  )
  return source.parser === 'amazon'
    ? extractAmazonVoucherCandidates(html, capturedAt, 1_000)
    : extractPublicVoucherCandidates({
        capturedAt,
        html,
        limit: 1_000,
        retailerId: source.retailerId,
        sourceUrl,
      })
}

// Fetches a voucher source page, falling back to the jina reader (asked for
// raw HTML) when the retailer bot-walls direct fetches — Yuppiechef 403s the
// honest crawler UA while serving the same public page to browsers.
async function fetchVoucherSourceHtml(
  source: VoucherScoutSource,
  sourceUrl: string,
  fetchImpl: typeof fetch,
  maxBodyBytes: number,
  jinaApiKey?: string,
): Promise<string> {
  let directStatus: number | undefined
  try {
    const response = await fetchImpl(sourceUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'TrolleyScout/1.0 (+https://trolleyscout.co.za)',
      },
      // Sources move behind redirects (Amazon's /coupons now 301s);
      // follow them, but only within the retailer's official hosts.
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    })
    if (response.ok) {
      if (response.url && !isOfficialRetailerHost(source.retailerId, response.url)) {
        throw new Error('Voucher source redirected off the official retailer host')
      }
      return await readResponseTextWithLimit(response, maxBodyBytes)
    }
    directStatus = response.status
  } catch (error) {
    if (error instanceof Error && /official retailer host/.test(error.message)) {
      throw error
    }
    // Fall through to the reader on network-level failures too.
  }

  const reader = await fetchImpl(`https://r.jina.ai/${sourceUrl}`, {
    headers: {
      accept: 'text/html,text/plain',
      'x-return-format': 'html',
      ...(jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!reader.ok) {
    throw new Error(`Official source returned HTTP ${directStatus ?? reader.status}`)
  }
  return await readResponseTextWithLimit(reader, maxBodyBytes)
}

function databaseRepository(env: TrolleyScoutEnv): VoucherScoutRepository {
  return {
    expire: () => expireVouchers(env),
    readCursor: (sourceKey) => readVoucherSourceCursor(env, sourceKey),
    upsert: (input) => upsertVouchers(env, input),
    writeCursor: (sourceKey, cursor) => writeVoucherSourceCursor(env, sourceKey, cursor),
  }
}

function sourceOffset(cursor: FeedCursor | undefined, fingerprint: string, candidateCount: number) {
  if (cursor?.kind !== 'token') {
    return 0
  }
  try {
    const value = JSON.parse(cursor.token) as {
      fingerprint?: unknown
      offset?: unknown
      version?: unknown
    }
    if (
      value.version !== CURSOR_VERSION ||
      value.fingerprint !== fingerprint ||
      !Number.isSafeInteger(value.offset) ||
      (value.offset as number) < 0 ||
      (value.offset as number) >= candidateCount
    ) {
      return 0
    }
    return value.offset as number
  } catch {
    return 0
  }
}

async function candidateFingerprint(candidates: readonly VoucherCandidate[]) {
  const identity = candidates.map(({ capturedAt: _capturedAt, ...candidate }) => candidate)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(identity)),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validatedSourceUrl(source: VoucherScoutSource) {
  let url: URL
  try {
    url = new URL(source.url)
  } catch {
    throw new TypeError('Voucher source URL must be an absolute HTTPS URL')
  }

  const host = url.hostname.toLocaleLowerCase()
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    isPrivateHost(host)
  ) {
    throw new TypeError('Voucher source URL must be a public HTTPS URL')
  }

  if (!matchesOfficialRoot(source.retailerId, host)) {
    throw new TypeError('Voucher source URL does not match the official retailer host')
  }

  return url.toString()
}

const OFFICIAL_VOUCHER_ROOTS: Record<string, readonly string[]> = {
  'amazon-za': ['amazon.co.za'],
  builders: ['builders.co.za'],
  checkers: ['checkers.co.za'],
  'pick-n-pay': ['pnp.co.za'],
  shoprite: ['shoprite.co.za'],
  woolworths: ['woolworths.co.za'],
  yuppiechef: ['yuppiechef.com'],
}

function matchesOfficialRoot(retailerId: string, host: string) {
  const roots = OFFICIAL_VOUCHER_ROOTS[retailerId]
  return !roots || roots.some((root) => host === root || host.endsWith(`.${root}`))
}

function isOfficialRetailerHost(retailerId: string, value: string) {
  try {
    return matchesOfficialRoot(retailerId, new URL(value).hostname.toLocaleLowerCase())
  } catch {
    return false
  }
}

function isPrivateHost(host: string) {
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    !host.includes('.') ||
    host.includes(':')
  ) {
    return true
  }

  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  return parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
}

async function readResponseTextWithLimit(response: Response, maximumBytes: number) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RangeError('Voucher source response exceeds the body limit')
  }
  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maximumBytes) {
      throw new RangeError('Voucher source response exceeds the body limit')
    }
    return text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw new RangeError('Voucher source response exceeds the body limit')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function boundedBodyLimit(value: number) {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 10_000_000) {
    throw new RangeError('maxBodyBytes must be between 1000 and 10000000')
  }
  return value
}


