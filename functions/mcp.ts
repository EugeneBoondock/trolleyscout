// A real (minimal) Model Context Protocol server over Streamable HTTP, so the
// MCP Server Card at /.well-known/mcp/server-card.json points at an endpoint
// that actually works. It exposes read-only tools backed by the site's own
// public APIs — no auth, no side effects. JSON-RPC 2.0; POST a request, get a
// JSON response.

import { GRANTS_EFFECTIVE_FROM, socialGrants } from '../src/data/moneyHelp'
import type { TrolleyScoutEnv } from './_shared/env'

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_INFO = { name: 'trolley-scout', title: 'Trolley Scout', version: '1.2.0' }

const CORS_HEADERS = {
  'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-origin': '*',
}

const JSON_HEADERS = {
  ...CORS_HEADERS,
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const TOOLS = [
  {
    name: 'search_deals',
    title: 'Search grocery deals',
    description:
      "Search this week's South African grocery specials that Trolley Scout has verified from official retailer pages. Optionally filter by a keyword and/or retailer id.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match in the deal title, e.g. "peanut butter".' },
        retailer: { type: 'string', description: 'Optional retailer id, e.g. "pick-n-pay" or "checkers".' },
        limit: { type: 'number', description: 'Maximum deals to return (default 20, max 50).' },
      },
    },
  },
  {
    name: 'nearby_stores',
    title: 'Find nearby supermarkets',
    description:
      'Find supermarkets near a South African location and the current specials and catalogues for each. Provide latitude and longitude.',
    inputSchema: {
      type: 'object',
      required: ['lat', 'lon'],
      properties: {
        lat: { type: 'number', description: 'Latitude, e.g. -26.2041.' },
        lon: { type: 'number', description: 'Longitude, e.g. 28.0473.' },
      },
    },
  },
  {
    name: 'flash_deals',
    title: 'Browse flash deals',
    description:
      'Browse current flash/daily deals aggregated from OneDayOnly, Hyperli, Daddy\'s Deals and MyRunway.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum deals to return (default 20, max 50).' },
      },
    },
  },
  {
    name: 'money_help',
    title: 'South African money help',
    description:
      'Get current South African social grant amounts (SASSA) and money-saving help that Trolley Scout tracks — free to claim.',
    inputSchema: { type: 'object', properties: {} },
  },
]

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS, status: 204 })
  }

  if (request.method !== 'POST') {
    // No server-initiated SSE stream is offered; clients use request/response.
    return new Response(
      JSON.stringify(rpcError(null, -32000, 'Use HTTP POST with a JSON-RPC message.')),
      { headers: { ...JSON_HEADERS, allow: 'POST, OPTIONS' }, status: 405 },
    )
  }

  let message: JsonRpcRequest
  try {
    message = (await request.json()) as JsonRpcRequest
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error.')), {
      headers: JSON_HEADERS,
      status: 400,
    })
  }

  // Notifications (no id) get an acknowledgement with no body.
  if (message.id === undefined || message.id === null) {
    return new Response(null, { headers: CORS_HEADERS, status: 202 })
  }

  const origin = new URL(request.url).origin

  try {
    const result = await handleMethod(message, origin)
    return new Response(JSON.stringify({ id: message.id, jsonrpc: '2.0', result }), {
      headers: JSON_HEADERS,
    })
  } catch (error) {
    const messageText = error instanceof RpcError ? error.message : 'Internal error.'
    const code = error instanceof RpcError ? error.code : -32603
    return new Response(JSON.stringify(rpcError(message.id, code, messageText)), {
      headers: JSON_HEADERS,
    })
  }
}

async function handleMethod(message: JsonRpcRequest, origin: string): Promise<unknown> {
  switch (message.method) {
    case 'initialize':
      return {
        capabilities: { tools: { listChanged: false } },
        instructions:
          'Read-only tools for South African grocery deals, nearby supermarkets, flash deals, and money help.',
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      return callTool(message.params ?? {}, origin)
    default:
      throw new RpcError(-32601, `Method not found: ${message.method}`)
  }
}

async function callTool(params: Record<string, unknown>, origin: string): Promise<unknown> {
  const name = String(params.name ?? '')
  const args = (params.arguments ?? {}) as Record<string, unknown>

  switch (name) {
    case 'search_deals':
      return toolResult(await searchDeals(args, origin))
    case 'nearby_stores':
      return toolResult(await nearbyStores(args, origin))
    case 'flash_deals':
      return toolResult(await flashDeals(args, origin))
    case 'money_help':
      return toolResult({
        effectiveFrom: GRANTS_EFFECTIVE_FROM,
        grants: socialGrants,
        note: 'All grants are free to apply for at SASSA. See https://trolleyscout.co.za/money-help',
      })
    default:
      throw new RpcError(-32602, `Unknown tool: ${name}`)
  }
}

async function searchDeals(args: Record<string, unknown>, origin: string): Promise<unknown> {
  const data = await fetchJson(`${origin}/api/discovery`)
  const deals = Array.isArray(data?.deals) ? (data.deals as Record<string, unknown>[]) : []
  const query = typeof args.query === 'string' ? args.query.toLowerCase().trim() : ''
  const retailer = typeof args.retailer === 'string' ? args.retailer : ''
  const limit = clampLimit(args.limit)

  const filtered = deals.filter((deal) => {
    const title = String(deal.title ?? '').toLowerCase()
    const matchesQuery = !query || title.includes(query)
    const matchesRetailer = !retailer || deal.retailerId === retailer
    return matchesQuery && matchesRetailer
  })

  return {
    count: filtered.length,
    deals: filtered.slice(0, limit).map(compactDeal),
  }
}

async function nearbyStores(args: Record<string, unknown>, origin: string): Promise<unknown> {
  const lat = Number(args.lat)
  const lon = Number(args.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new RpcError(-32602, 'lat and lon are required numbers.')
  }
  const data = await fetchJson(`${origin}/api/nearby-stores?lat=${lat}&lon=${lon}`)
  const stores = Array.isArray(data?.stores) ? (data.stores as Record<string, unknown>[]) : []
  return {
    count: stores.length,
    stores: stores.slice(0, 15).map((store) => ({
      address: store.address,
      dealCount: Array.isArray(store.deals) ? store.deals.length : 0,
      distanceM: store.distanceM,
      name: store.name,
      retailerId: store.retailerId,
    })),
  }
}

async function flashDeals(args: Record<string, unknown>, origin: string): Promise<unknown> {
  const data = await fetchJson(`${origin}/api/deal-sites`)
  const deals = Array.isArray(data?.deals) ? (data.deals as Record<string, unknown>[]) : []
  const limit = clampLimit(args.limit)
  return { count: deals.length, deals: deals.slice(0, limit).map(compactDeal) }
}

function compactDeal(deal: Record<string, unknown>): Record<string, unknown> {
  return {
    previousPrice: deal.previousPriceText,
    price: deal.priceText,
    retailer: deal.retailerName,
    saving: deal.savingText,
    title: deal.title,
    url: deal.productUrl ?? deal.sourceUrl,
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return undefined
  const envelope = (await response.json()) as { data?: Record<string, unknown> }
  return envelope.data ?? (envelope as Record<string, unknown>)
}

function toolResult(payload: unknown): unknown {
  return { content: [{ text: JSON.stringify(payload, null, 2), type: 'text' }] }
}

function clampLimit(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 20
  return Math.min(50, Math.max(1, Math.floor(n)))
}

class RpcError extends Error {
  constructor(public code: number, message: string) {
    super(message)
  }
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { error: { code, message }, id: id ?? null, jsonrpc: '2.0' }
}
