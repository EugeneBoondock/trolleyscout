// WebMCP: expose Trolley Scout's key actions to in-browser AI agents via the
// experimental navigator.modelContext API. Tools are real and read-only — they
// query the site's own public APIs and (optionally) drive the UI. If the API is
// absent (most browsers today) this is a no-op.

import { useEffect } from 'react'

interface WebMcpToolResult {
  content: Array<{ type: 'text'; text: string }>
}

interface WebMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => Promise<WebMcpToolResult>
}

interface ModelContext {
  provideContext?: (context: { tools: WebMcpTool[] }) => void
}

interface WebMcpDeps {
  goToDeals: (query?: string) => void
  goToMoneyHelp: () => void
  goToNearMe: () => void
}

function getModelContext(): ModelContext | undefined {
  const nav = navigator as Navigator & { modelContext?: ModelContext }
  return nav.modelContext
}

async function fetchData(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(path, { headers: { accept: 'application/json' } })
  const envelope = (await response.json()) as { data?: Record<string, unknown> }
  return envelope.data ?? {}
}

function text(payload: unknown): WebMcpToolResult {
  return { content: [{ text: JSON.stringify(payload, null, 2), type: 'text' }] }
}

export function useWebMcpTools(deps: WebMcpDeps): void {
  useEffect(() => {
    const modelContext = getModelContext()
    if (!modelContext?.provideContext) return

    const tools: WebMcpTool[] = [
      {
        name: 'search_grocery_deals',
        description:
          "Search this week's verified South African grocery specials by keyword and show them on the Deals page.",
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Keyword, e.g. "rice".' } },
        },
        execute: async (input) => {
          const query = typeof input.query === 'string' ? input.query : ''
          deps.goToDeals(query)
          const data = await fetchData('/api/discovery')
          const deals = Array.isArray(data.deals) ? (data.deals as Record<string, unknown>[]) : []
          const q = query.toLowerCase().trim()
          const matched = deals
            .filter((deal) => !q || String(deal.title ?? '').toLowerCase().includes(q))
            .slice(0, 20)
            .map((deal) => ({
              price: deal.priceText,
              retailer: deal.retailerName,
              saving: deal.savingText,
              title: deal.title,
              url: deal.productUrl ?? deal.sourceUrl,
            }))
          return text({ count: matched.length, deals: matched })
        },
      },
      {
        name: 'find_nearby_supermarkets',
        description: 'Find supermarkets and their specials near a latitude/longitude.',
        inputSchema: {
          type: 'object',
          required: ['lat', 'lon'],
          properties: {
            lat: { type: 'number' },
            lon: { type: 'number' },
          },
        },
        execute: async (input) => {
          const lat = Number(input.lat)
          const lon = Number(input.lon)
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return text({ error: 'lat and lon are required numbers.' })
          }
          deps.goToNearMe()
          const data = await fetchData(`/api/nearby-stores?lat=${lat}&lon=${lon}`)
          const stores = Array.isArray(data.stores) ? (data.stores as Record<string, unknown>[]) : []
          return text({
            count: stores.length,
            stores: stores.slice(0, 15).map((store) => ({
              address: store.address,
              distanceM: store.distanceM,
              name: store.name,
            })),
          })
        },
      },
      {
        name: 'open_money_help',
        description:
          'Open the Money help page with current SASSA grant amounts and free money help for South Africans.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          deps.goToMoneyHelp()
          return text({ opened: 'money-help', url: 'https://trolleyscout.co.za/money-help' })
        },
      },
    ]

    try {
      modelContext.provideContext({ tools })
    } catch {
      // The API may be present but disabled; safe to ignore.
    }

    return () => {
      try {
        modelContext.provideContext?.({ tools: [] })
      } catch {
        // ignore teardown errors
      }
    }
  }, [deps])
}
