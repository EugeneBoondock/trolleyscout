import { describe, expect, it, vi } from 'vitest'
import type { StoredDealItem } from '../_shared/dealItemStore'
import type { StoreLeaflet } from '../../src/types'
import { handleScoutChat, type ScoutChatDependencies } from './scout-chat'

const storedDeal: StoredDealItem = {
  capturedAt: '2026-07-26T10:00:00.000Z',
  contentFingerprint: 'fingerprint',
  countryCode: 'ZA',
  createdAt: '2026-07-26T10:00:00.000Z',
  currencyCode: 'ZAR',
  evidenceText: 'Official product feed.',
  expiresAt: '2026-07-27T10:00:00.000Z',
  id: 'coffee-deal',
  imageUrl: 'https://retailer.test/coffee.webp',
  lastSeenAt: '2026-07-26T10:00:00.000Z',
  previousPriceCents: 10999,
  priceCents: 7999,
  productId: 'coffee-1',
  productUrl: 'https://retailer.test/coffee',
  promotionId: 'promo-1',
  retailerId: 'checkers',
  savingText: 'Save R30',
  scope: { type: 'online' },
  sourceKey: 'checkers::specials',
  sourceKind: 'structured',
  sourceUrl: 'https://retailer.test/specials',
  status: 'active',
  title: 'Ground coffee 250g',
  updatedAt: '2026-07-26T10:00:00.000Z',
}

const leaflet: StoreLeaflet = {
  capturedAt: '2026-07-26T10:00:00.000Z',
  id: 'weekly',
  imageUrl: 'https://retailer.test/weekly.webp',
  name: 'Weekly catalogue',
  retailerId: 'checkers',
  retailerName: 'Checkers',
  url: 'https://retailer.test/weekly',
}

function dependencies(overrides: Partial<ScoutChatDependencies> = {}): ScoutChatDependencies {
  return {
    fetchOpenAI: vi.fn(async () => new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{
          type: 'output_text',
          text: JSON.stringify({
            reply: 'The coffee deal saves R30.',
            dealIds: ['coffee-deal'],
            catalogueIds: ['weekly'],
            followUps: ['Show more coffee'],
          }),
        }],
      }],
    }), { status: 200 })),
    getSession: vi.fn(async () => ({
      account: {
        countryCode: 'ZA',
        currencyCode: 'ZAR',
        id: 'member-1',
      },
      isAuthenticated: true,
    })),
    incrementUsage: vi.fn(async () => 1),
    listDeals: vi.fn(async () => [storedDeal]),
    listLeaflets: vi.fn(async () => [leaflet]),
    loadPersonalContext: vi.fn(async () => ({})),
    ...overrides,
  }
}

describe('handleScoutChat', () => {
  it('uses GPT-5.4 mini and returns only trusted deal and catalogue cards', async () => {
    const deps = dependencies()
    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'Find coffee deals' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)

    expect(response.status).toBe(200)
    const body = await response.json() as {
      data: {
        answer: {
          catalogues: Array<{ id: string }>
          deals: Array<{ id: string }>
          reply: string
        }
      }
    }
    expect(body.data.answer).toMatchObject({
      reply: 'The coffee deal saves R30.',
      deals: [{ id: 'coffee-deal' }],
      catalogues: [{ id: 'weekly' }],
    })

    const request = vi.mocked(deps.fetchOpenAI).mock.calls[0][0]
    const openAiBody = await request.clone().json() as {
      model: string
      text: { format: { type: string; strict: boolean } }
    }
    expect(openAiBody.model).toBe('gpt-5.4-mini')
    expect(openAiBody.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
    })
  })

  it('passes the signed-in shopper’s selected private context to Mr Scout', async () => {
    const deps = dependencies({
      loadPersonalContext: vi.fn(async () => ({
        basket: {
          items: [{
            deal: {
              priceText: 'R40.00',
              productUrl: 'https://retailer.test/basket',
              retailerName: 'Basket Market',
              title: 'Basket oats',
            },
            quantity: 3,
          }],
        },
        favouriteStores: [{ displayName: 'Favourite Market', id: 'favourite-market' }],
        recentPropertySearches: ['Sandton'],
        savedDeals: [{
          priceText: 'R80.00',
          productUrl: 'https://retailer.test/saved',
          retailerName: 'Saved Market',
          title: 'Saved coffee',
        }],
        savedProperties: [{
          listingUrl: 'https://property.test/home',
          location: 'Sandton',
          title: 'Saved townhouse',
        }],
        windowShoppingSaves: [{
          productUrl: 'https://retailer.test/window',
          retailerName: 'Window Market',
          title: 'Window sneakers',
        }],
      })),
    })

    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'What have I saved?' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)

    expect(response.status).toBe(200)
    expect(deps.loadPersonalContext).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
    )
    const request = vi.mocked(deps.fetchOpenAI).mock.calls[0][0]
    const openAiBody = await request.clone().json() as {
      input: Array<{ content: string; role: string }>
    }
    const privateContext = openAiBody.input[1].content
    expect(privateContext).toContain('Favourite Market')
    expect(privateContext).toContain('Basket oats')
    expect(privateContext).toContain('Saved coffee')
    expect(privateContext).toContain('Window sneakers')
    expect(privateContext).toContain('Saved townhouse')
    expect(privateContext).toContain('Sandton')
  })

  it('requires a signed-in consumer account', async () => {
    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'Hello' }),
        method: 'POST',
      }),
    }, dependencies({
      getSession: vi.fn(async () => ({ isAuthenticated: false })),
    }))

    expect(response.status).toBe(401)
  })

  it('stops before calling OpenAI when the account reaches its minute limit', async () => {
    const deps = dependencies({ incrementUsage: vi.fn(async () => 21) })
    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'Hello' }),
        method: 'POST',
      }),
    }, deps)

    expect(response.status).toBe(429)
    expect(deps.fetchOpenAI).not.toHaveBeenCalled()
  })
})
