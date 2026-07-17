import type { FeedCursor } from '../../src/services/retailerFeeds/types'
import {
  extractAmazonVoucherCandidates,
  extractPublicVoucherCandidates,
} from '../../src/services/vouchers/voucherDiscovery'
import type { VoucherCandidate } from '../../src/services/vouchers/types'
import type { TrolleyScoutEnv } from './env'
import {
  expireVouchers,
  readVoucherSourceCursor,
  upsertVouchers,
  writeVoucherSourceCursor,
} from './voucherStore'

const MAX_VOUCHERS_PER_SOURCE_RUN = 100
const DEFAULT_MAX_BODY_BYTES = 4_000_000
const CURSOR_VERSION = 1

export interface VoucherScoutSource {
  parser: 'amazon' | 'public-code'
  retailerId: string
  sourceKey: string
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

export const defaultVoucherSources: readonly VoucherScoutSource[] = [
  {
    parser: 'amazon',
    retailerId: 'amazon-za',
    sourceKey: 'amazon-za::vouchers',
    url: 'https://www.amazon.co.za/coupons',
  },
  {
    parser: 'public-code',
    retailerId: 'woolworths',
    sourceKey: 'woolworths::wrewards-vouchers',
    url: 'https://www.woolworths.co.za/content/article/wrewards/vouchers/_/A-cmp204081',
  },
  {
    parser: 'public-code',
    retailerId: 'boxer',
    sourceKey: 'boxer::ecoupons',
    url: 'https://www.boxer.co.za/money-kiosk/boxer-ecoupons',
  },
  {
    parser: 'public-code',
    retailerId: 'builders',
    sourceKey: 'builders::plus-vouchers',
    url: 'https://www.builders.co.za/builders-plus',
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
      const response = await fetchImpl(sourceUrl, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'TrolleyScout/1.0 (+https://trolleyscout.co.za)',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) {
        throw new Error(`Official source returned HTTP ${response.status}`)
      }
      const html = await readResponseTextWithLimit(response, maxBodyBytes)
      const candidates = source.parser === 'amazon'
        ? extractAmazonVoucherCandidates(html, checkedAt, 1_000)
        : extractPublicVoucherCandidates({
            capturedAt: checkedAt,
            html,
            limit: 1_000,
            retailerId: source.retailerId,
            sourceUrl,
          })
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
  return { expired, sources: results }
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

  const officialRoots: Record<string, readonly string[]> = {
    'amazon-za': ['amazon.co.za'],
    boxer: ['boxer.co.za'],
    builders: ['builders.co.za'],
    woolworths: ['woolworths.co.za'],
  }
  const roots = officialRoots[source.retailerId]
  if (roots && !roots.some((root) => host === root || host.endsWith(`.${root}`))) {
    throw new TypeError('Voucher source URL does not match the official retailer host')
  }

  return url.toString()
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
