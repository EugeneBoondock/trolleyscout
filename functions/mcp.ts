import type { TrolleyScoutEnv } from './_shared/env'
import {
  authorizeOAuthToken,
  consumeDeveloperCall,
  DeveloperAccessError,
  type DeveloperPrincipal,
  type DeveloperScope,
} from './_shared/developerAccess'
import { handleDeveloperApi } from './_shared/developerApi'

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_INFO = { name: 'trolley-scout', title: 'Trolley Scout Developers', version: '2.0.0' }

const CORS_HEADERS = {
  'access-control-allow-headers':
    'authorization, content-type, mcp-session-id, mcp-protocol-version',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-origin': '*',
}

const JSON_HEADERS = {
  ...CORS_HEADERS,
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
}

interface JsonRpcRequest {
  id?: string | number | null
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

const READ_TOOLS = [
  tool('search_deals', 'Search grocery deals', 'Search current shopping deals by keyword or retailer.', {
    limit: numberProperty('Maximum results, up to 100.'),
    query: stringProperty('Keyword to match.'),
    retailer: stringProperty('Retailer ID to match.'),
  }),
  tool('list_catalogues', 'List catalogues', 'List current retailer catalogues.', {
    limit: numberProperty('Maximum results, up to 100.'),
    retailer: stringProperty('Retailer ID to match.'),
  }),
  tool('nearby_stores', 'Find nearby stores', 'Find supermarkets near a latitude and longitude.', {
    lat: numberProperty('Latitude.'),
    lon: numberProperty('Longitude.'),
  }, ['lat', 'lon']),
  tool('list_stories', 'List shopping stories', 'List the current shopper Stories feed.', {}),
  tool('get_trends', 'Get shopping trends', 'Rank content for today, this week, or this month.', {
    period: {
      description: 'Trend period.',
      enum: ['day', 'week', 'month'],
      type: 'string',
    },
  }),
]

const CAMPAIGN_TOOLS = [
  tool('list_campaigns', 'List campaigns', 'List campaigns owned by the connected business.', {}),
  tool('get_campaign', 'Get campaign', 'Read one campaign owned by the connected business.', {
    campaignId: stringProperty('Campaign ID.'),
  }, ['campaignId']),
  tool('create_campaign_draft', 'Create campaign draft', 'Create a campaign draft for review.', {
    campaign: { description: 'Campaign fields.', type: 'object' },
  }, ['campaign']),
  tool('update_campaign_draft', 'Update campaign draft', 'Update a campaign owned by the connected business.', {
    campaign: { description: 'Complete campaign fields.', type: 'object' },
    campaignId: stringProperty('Campaign ID.'),
  }, ['campaignId', 'campaign']),
  tool('submit_campaign', 'Submit campaign', 'Submit a draft campaign for Trolley Scout review.', {
    campaignId: stringProperty('Campaign ID.'),
  }, ['campaignId']),
  tool('pause_campaign', 'Pause campaign', 'Pause a live campaign.', {
    campaignId: stringProperty('Campaign ID.'),
  }, ['campaignId']),
  tool('resume_campaign', 'Resume campaign', 'Resume a paused campaign.', {
    campaignId: stringProperty('Campaign ID.'),
  }, ['campaignId']),
  tool('get_campaign_results', 'Get campaign results', 'Read results for an owned campaign.', {
    campaignId: stringProperty('Campaign ID.'),
    days: {
      description: 'Reporting range.',
      enum: [1, 7, 30],
      type: 'number',
    },
  }, ['campaignId']),
]

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS, status: 204 })
  }
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify(rpcError(null, -32000, 'Use HTTP POST with a JSON-RPC message.')),
      { headers: { ...JSON_HEADERS, allow: 'POST, OPTIONS' }, status: 405 },
    )
  }

  let principal: DeveloperPrincipal
  try {
    principal = await authorizeOAuthToken(env, bearerToken(request))
  } catch (error) {
    const message = error instanceof DeveloperAccessError
      ? error.message
      : 'OAuth authentication is required.'
    return new Response(JSON.stringify(rpcError(null, -32001, message)), {
      headers: {
        ...JSON_HEADERS,
        link: '</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"',
        'www-authenticate':
          'Bearer resource_metadata="/.well-known/oauth-protected-resource", error="invalid_token"',
      },
      status: 401,
    })
  }

  let message: JsonRpcRequest
  try {
    message = await request.json() as JsonRpcRequest
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error.')), {
      headers: JSON_HEADERS,
      status: 400,
    })
  }
  if (message.id === undefined || message.id === null) {
    return new Response(null, { headers: CORS_HEADERS, status: 202 })
  }

  try {
    const result = await handleMethod(env, request, message, principal)
    return new Response(JSON.stringify({ id: message.id, jsonrpc: '2.0', result }), {
      headers: JSON_HEADERS,
    })
  } catch (error) {
    const known = error instanceof RpcError
      ? error
      : new RpcError(-32603, 'Internal error.')
    return new Response(JSON.stringify(rpcError(message.id, known.code, known.message)), {
      headers: JSON_HEADERS,
    })
  }
}

async function handleMethod(
  env: TrolleyScoutEnv,
  request: Request,
  message: JsonRpcRequest,
  principal: DeveloperPrincipal,
) {
  if (message.method === 'initialize') {
    return {
      capabilities: { tools: { listChanged: false } },
      instructions:
        'Search Trolley Scout shopping data and manage campaigns for your approved business.',
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: SERVER_INFO,
    }
  }
  if (message.method === 'ping') return {}
  if (message.method === 'tools/list') {
    return { tools: visibleTools(principal) }
  }
  if (message.method === 'tools/call') {
    return callTool(env, request, message.params ?? {}, principal)
  }
  throw new RpcError(-32601, `Method not found: ${message.method}`)
}

async function callTool(
  env: TrolleyScoutEnv,
  request: Request,
  params: Record<string, unknown>,
  principal: DeveloperPrincipal,
) {
  const name = String(params.name ?? '')
  const args = objectValue(params.arguments)
  const spec = toolRequest(name, args, request.url)
  requireScope(principal, spec.scope)
  const requestId = `mcp_${crypto.randomUUID()}`
  await consumeDeveloperCall(env, principal, name, requestId)
  const response = await handleDeveloperApi({
    env,
    path: spec.path,
    principal,
    request: spec.request,
    requestId,
  })
  const payload = await response.json()
  return {
    content: [{ text: JSON.stringify(payload, null, 2), type: 'text' }],
    isError: !response.ok,
    structuredContent: payload,
  }
}

function toolRequest(
  name: string,
  args: Record<string, unknown>,
  requestUrl: string,
): { path: string[]; request: Request; scope: DeveloperScope } {
  const origin = new URL(requestUrl).origin
  const get = (path: string[], query?: Record<string, unknown>) => {
    const url = new URL(`/api/developer/v1/${path.join('/')}`, origin)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
    return new Request(url)
  }
  const write = (path: string[], method: 'PATCH' | 'POST', body: unknown) =>
    new Request(new URL(`/api/developer/v1/${path.join('/')}`, origin), {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method,
    })

  if (name === 'search_deals') {
    return {
      path: ['deals'],
      request: get(['deals'], { limit: args.limit, q: args.query, retailer: args.retailer }),
      scope: 'shopping:read',
    }
  }
  if (name === 'list_catalogues') {
    return {
      path: ['catalogues'],
      request: get(['catalogues'], { limit: args.limit, retailer: args.retailer }),
      scope: 'shopping:read',
    }
  }
  if (name === 'nearby_stores') {
    return {
      path: ['stores', 'nearby'],
      request: get(['stores', 'nearby'], { lat: args.lat, lon: args.lon }),
      scope: 'shopping:read',
    }
  }
  if (name === 'list_stories') {
    return { path: ['stories'], request: get(['stories']), scope: 'shopping:read' }
  }
  if (name === 'get_trends') {
    return {
      path: ['trends'],
      request: get(['trends'], { period: args.period }),
      scope: 'trends:read',
    }
  }
  const campaignId = String(args.campaignId ?? '')
  if (name === 'list_campaigns') {
    return { path: ['campaigns'], request: get(['campaigns']), scope: 'campaigns:read' }
  }
  if (name === 'get_campaign') {
    return {
      path: ['campaigns', campaignId],
      request: get(['campaigns', campaignId]),
      scope: 'campaigns:read',
    }
  }
  if (name === 'get_campaign_results') {
    return {
      path: ['campaigns', campaignId, 'results'],
      request: get(['campaigns', campaignId, 'results'], { days: args.days }),
      scope: 'campaigns:read',
    }
  }
  if (name === 'create_campaign_draft') {
    return {
      path: ['campaigns'],
      request: write(['campaigns'], 'POST', objectValue(args.campaign)),
      scope: 'campaigns:write',
    }
  }
  if (name === 'update_campaign_draft') {
    return {
      path: ['campaigns', campaignId],
      request: write(['campaigns', campaignId], 'PATCH', objectValue(args.campaign)),
      scope: 'campaigns:write',
    }
  }
  if (['submit_campaign', 'pause_campaign', 'resume_campaign'].includes(name)) {
    const operation = name.replace('_campaign', '')
    return {
      path: ['campaigns', campaignId, operation],
      request: write(['campaigns', campaignId, operation], 'POST', {}),
      scope: 'campaigns:write',
    }
  }
  throw new RpcError(-32602, `Unknown tool: ${name}`)
}

function visibleTools(principal: DeveloperPrincipal) {
  return [
    ...(principal.scopes.includes('shopping:read') || principal.scopes.includes('trends:read')
      ? READ_TOOLS.filter((entry) =>
          entry.name === 'get_trends'
            ? principal.scopes.includes('trends:read')
            : principal.scopes.includes('shopping:read'))
      : []),
    ...(principal.scopes.includes('campaigns:read') || principal.scopes.includes('campaigns:write')
      ? CAMPAIGN_TOOLS.filter((entry) =>
          entry.name.startsWith('get_') || entry.name === 'list_campaigns'
            ? principal.scopes.includes('campaigns:read')
            : principal.scopes.includes('campaigns:write'))
      : []),
  ]
}

function requireScope(principal: DeveloperPrincipal, scope: DeveloperScope) {
  if (!principal.scopes.includes(scope)) {
    throw new RpcError(-32003, `OAuth token does not include ${scope}.`)
  }
}

function bearerToken(request: Request): string {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')
  if (!match) throw new DeveloperAccessError('invalid_token', 401, 'OAuth bearer token required.')
  return match[1]
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function tool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown>,
  required?: string[],
) {
  return {
    description,
    inputSchema: { properties, required, type: 'object' },
    name,
    title,
  }
}

function stringProperty(description: string) {
  return { description, type: 'string' }
}

function numberProperty(description: string) {
  return { description, type: 'number' }
}

class RpcError extends Error {
  constructor(public code: number, message: string) {
    super(message)
  }
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { error: { code, message }, id: id ?? null, jsonrpc: '2.0' }
}
