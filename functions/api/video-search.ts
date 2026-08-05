import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'

// YouTube's own web client talks to this open InnerTube endpoint; it needs no
// API key, only a plausible client context. One call returns enough results to
// rank the product's review videos by how many people actually watched them.
const INNERTUBE_SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'
const INNERTUBE_CLIENT = { clientName: 'WEB', clientVersion: '2.20250101.00.00' }
const REQUEST_TIMEOUT_MS = 6_000
const MAX_RESULTS = 3
const MAX_QUERY_LENGTH = 120

export interface VideoSearchResult {
  channel: string
  thumbnailUrl: string | null
  title: string
  videoId: string
  viewCount: number
}

export type VideoSearchFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Response>

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ request }) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method)

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (!query) {
    return json({ error: 'Provide a search query.', videos: [] }, { status: 400 })
  }

  const videos = await searchTopVideos(query.slice(0, MAX_QUERY_LENGTH))
  return json(
    { query, videos },
    {
      headers: {
        'access-control-allow-origin': '*',
        // A product's top reviews barely move day to day; keep YouTube out of
        // the hot path for repeat viewers of the same showcase.
        'cache-control': 'public, max-age=21600, s-maxage=86400',
      },
    },
  )
}

export async function searchTopVideos(
  query: string,
  fetcher: VideoSearchFetcher = fetch,
): Promise<VideoSearchResult[]> {
  try {
    const response = await fetcher(INNERTUBE_SEARCH_URL, {
      body: JSON.stringify({
        context: { client: INNERTUBE_CLIENT },
        query,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return []
    const payload: unknown = await response.json()
    return collectVideoRenderers(payload)
      .sort((left, right) => right.viewCount - left.viewCount)
      .slice(0, MAX_RESULTS)
  } catch {
    return []
  }
}

/** Walks the InnerTube response for videoRenderer nodes wherever they sit —
 * the exact nesting shifts between YouTube layout experiments. */
function collectVideoRenderers(node: unknown, depth = 0): VideoSearchResult[] {
  if (depth > 14 || node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectVideoRenderers(child, depth + 1))
  }
  const record = node as Record<string, unknown>
  const renderer = record.videoRenderer
  if (renderer && typeof renderer === 'object') {
    const video = parseVideoRenderer(renderer as Record<string, unknown>)
    if (video) return [video]
    return []
  }
  return Object.values(record).flatMap((child) =>
    collectVideoRenderers(child, depth + 1))
}

function parseVideoRenderer(
  renderer: Record<string, unknown>,
): VideoSearchResult | null {
  const videoId = typeof renderer.videoId === 'string' ? renderer.videoId : ''
  if (!videoId) return null
  const title = readText(renderer.title)
  if (!title) return null
  return {
    channel: readText(renderer.ownerText) || readText(renderer.longBylineText),
    thumbnailUrl: readThumbnail(renderer.thumbnail),
    title,
    videoId,
    viewCount: readViewCount(renderer),
  }
}

function readText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (typeof record.simpleText === 'string') return record.simpleText
  if (Array.isArray(record.runs)) {
    return record.runs
      .map((run) => {
        const text = (run as Record<string, unknown> | null)?.text
        return typeof text === 'string' ? text : ''
      })
      .join('')
  }
  return ''
}

function readThumbnail(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const thumbnails = (value as Record<string, unknown>).thumbnails
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null
  const last = thumbnails[thumbnails.length - 1] as Record<string, unknown> | null
  return typeof last?.url === 'string' ? last.url : null
}

/** "1,234,567 views" from viewCountText, falling back to short forms like
 * "1.2M views" so live streams and experiments still rank. */
function readViewCount(renderer: Record<string, unknown>): number {
  const exact = readText(renderer.viewCountText)
  const exactDigits = exact.replace(/[^\d]/g, '')
  if (exactDigits && /view/i.test(exact)) return Number(exactDigits)
  const short = readText(renderer.shortViewCountText)
  const match = short.match(/([\d.,]+)\s*([KMB])?/i)
  if (!match) return 0
  const base = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(base)) return 0
  const scale = { B: 1e9, K: 1e3, M: 1e6 }[match[2]?.toUpperCase() ?? ''] ?? 1
  return Math.round(base * scale)
}
