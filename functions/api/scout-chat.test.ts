import { describe, expect, it, vi } from 'vitest'
import type { StoredDealItem } from '../_shared/dealItemStore'
import type { StoreLeaflet } from '../../src/types'
import {
  handleScoutChat,
  searchMarketplaceDeals,
  type ScoutChatDependencies,
} from './scout-chat'

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
        planId: 'free' as const,
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
    expect(deps.listDeals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        countryCode: 'ZA',
        searchTerms: ['coffee'],
        visibilityLimit: 2_000,
      }),
    )
  })

  it.each([
    ['free', 2_000],
    ['scout', 7_000],
    ['household', Number.MAX_SAFE_INTEGER],
    ['organization', Number.MAX_SAFE_INTEGER],
    ['developers', Number.MAX_SAFE_INTEGER],
  ] as const)('uses the %s Marketplace visibility policy', async (planId, visibilityLimit) => {
    const deps = dependencies({
      getSession: vi.fn(async () => ({
        account: {
          countryCode: 'ZA',
          currencyCode: 'ZAR',
          id: `${planId}-member`,
          planId,
        },
        isAuthenticated: true,
      })),
    })

    await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'Find rice deals' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)

    expect(deps.listDeals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ visibilityLimit }),
    )
  })

  it('returns trusted rice cards when the model incorrectly claims Marketplace has none', async () => {
    const riceDeal = {
      ...storedDeal,
      id: 'rice-deal',
      productId: 'rice-1',
      productUrl: 'https://retailer.test/rice',
      title: 'Long grain rice 2kg',
    }
    const deps = dependencies({
      fetchOpenAI: vi.fn(async () => new Response(JSON.stringify({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              reply: 'I could not find any rice deals.',
              dealIds: [],
              catalogueIds: [],
              followUps: [],
            }),
          }],
        }],
      }), { status: 200 })),
      listDeals: vi.fn(async () => [riceDeal]),
    })

    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'Do you have any rice deals?' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)

    const body = await response.json() as {
      data: { answer: { deals: Array<{ id: string }>; reply: string } }
    }
    expect(body.data.answer.deals).toEqual([
      expect.objectContaining({ id: 'rice-deal' }),
    ])
    expect(body.data.answer.reply.toLowerCase()).not.toContain('could not find')
  })

  it('finds Marketplace chicken for a conversational natural-language request', async () => {
    const chickenDeals = [
      {
        ...storedDeal,
        id: 'chicken-expensive',
        priceCents: 8999,
        productId: 'chicken-expensive',
        productUrl: 'https://retailer.test/chicken-expensive',
        title: 'Fresh chicken drumsticks 1kg',
      },
      {
        ...storedDeal,
        id: 'chicken-cheap',
        priceCents: 5999,
        productId: 'chicken-cheap',
        productUrl: 'https://retailer.test/chicken-cheap',
        title: 'Frozen whole chicken 1.2kg',
      },
    ]
    const deps = dependencies({
      fetchOpenAI: vi.fn(async () => new Response(JSON.stringify({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              reply: 'No chicken was found.',
              dealIds: [],
              catalogueIds: [],
              followUps: [],
            }),
          }],
        }],
      }), { status: 200 })),
      listDeals: vi.fn(async () => chickenDeals),
    })

    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'Ok find some chicken for me' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)

    const body = await response.json() as {
      data: { answer: { deals: Array<{ id: string }>; reply: string } }
    }
    expect(deps.listDeals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        productQuery: {
          productTerms: ['chicken'],
          sort: 'relevance',
        },
        searchTerms: ['chicken'],
      }),
    )
    expect(body.data.answer.deals.map((deal) => deal.id)).toEqual([
      'chicken-expensive',
      'chicken-cheap',
    ])
    expect(body.data.answer.reply.toLowerCase()).not.toContain('could not find')
  })

  it('ranks current ten-kilo Marketplace rice by price and excludes unrelated cards', async () => {
    const deals = [
      {
        ...storedDeal,
        id: 'saved-shoes',
        priceCents: 1999,
        productId: 'shoes',
        productUrl: 'https://retailer.test/shoes',
        title: 'Ladies fashion shoes',
      },
      {
        ...storedDeal,
        id: 'rice-cooker',
        priceCents: 9999,
        productId: 'rice-cooker',
        productUrl: 'https://retailer.test/rice-cooker',
        title: 'Digital rice cooker 10kg',
      },
      {
        ...storedDeal,
        id: 'rice-ten-expensive',
        priceCents: 22999,
        productId: 'rice-ten-expensive',
        productUrl: 'https://retailer.test/rice-ten-expensive',
        title: 'Premium rice 10 kg',
      },
      {
        ...storedDeal,
        id: 'rice-five',
        priceCents: 8999,
        productId: 'rice-five',
        productUrl: 'https://retailer.test/rice-five',
        title: 'Long grain rice 5kg',
      },
      {
        ...storedDeal,
        id: 'rice-ten-cheap',
        priceCents: 17999,
        productId: 'rice-ten-cheap',
        productUrl: 'https://retailer.test/rice-ten-cheap',
        title: 'Parboiled rice 10kg',
      },
    ]
    const deps = dependencies({
      fetchOpenAI: vi.fn(async () => new Response(JSON.stringify({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              reply: 'No rice was found.',
              dealIds: ['saved-shoes'],
              catalogueIds: [],
              followUps: [],
            }),
          }],
        }],
      }), { status: 200 })),
      listDeals: vi.fn(async () => deals),
      loadPersonalContext: vi.fn(async () => ({
        savedDeals: [{
          priceText: 'R19.99',
          productUrl: 'https://retailer.test/saved-shoes',
          retailerName: 'Fashion Market',
          title: 'Saved shoes',
        }],
      })),
    })

    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'show me the cheapest ten-kilo rice' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)

    const body = await response.json() as {
      data: { answer: { deals: Array<{ id: string }>; reply: string } }
    }
    expect(deps.listDeals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        countryCode: 'ZA',
        productQuery: expect.objectContaining({
          productTerms: ['rice'],
          requestedPackGrams: 10_000,
        }),
        searchTerms: ['rice'],
        visibilityLimit: 2_000,
      }),
    )
    expect(body.data.answer.deals.map((deal) => deal.id)).toEqual([
      'rice-ten-cheap',
      'rice-ten-expensive',
      'rice-five',
    ])
    expect(body.data.answer.reply).toContain('10 kg')

    const openAIRequest = vi.mocked(deps.fetchOpenAI).mock.calls[0][0]
    const openAiBody = await openAIRequest.clone().json() as {
      input: Array<{ content: string }>
    }
    expect(openAiBody.input[1].content).not.toContain('Saved shoes')
  })

  it('states when the requested rice pack is unavailable and returns closest pack sizes', async () => {
    const deps = dependencies({
      listDeals: vi.fn(async () => [
        {
          ...storedDeal,
          id: 'rice-two',
          priceCents: 4499,
          productId: 'rice-two',
          productUrl: 'https://retailer.test/rice-two',
          title: 'Long grain rice 2kg',
        },
        {
          ...storedDeal,
          id: 'rice-five',
          priceCents: 9499,
          productId: 'rice-five',
          productUrl: 'https://retailer.test/rice-five',
          title: 'White rice 5kg',
        },
      ]),
    })

    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({ message: 'show me the cheapest ten-kilo rice' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)

    const body = await response.json() as {
      data: { answer: { deals: Array<{ id: string }>; reply: string } }
    }
    expect(body.data.answer.deals.map((deal) => deal.id)).toEqual([
      'rice-five',
      'rice-two',
    ])
    expect(body.data.answer.reply).toContain('No current 10 kg')
    expect(body.data.answer.reply).toContain('closest')
  })

  it('builds a temporary vegan grocery plan from the visible Marketplace corpus', async () => {
    const groceryDeals = [
      {
        ...storedDeal,
        id: 'rice',
        priceCents: 4500,
        productId: 'rice',
        productUrl: 'https://retailer.test/rice',
        title: 'Long grain rice 2kg',
      },
      {
        ...storedDeal,
        id: 'beans',
        priceCents: 1800,
        productId: 'beans',
        productUrl: 'https://retailer.test/beans',
        title: 'Red kidney beans 400g',
      },
      {
        ...storedDeal,
        id: 'spinach',
        priceCents: 1600,
        productId: 'spinach',
        productUrl: 'https://retailer.test/spinach',
        title: 'Fresh spinach bunch',
      },
      {
        ...storedDeal,
        id: 'tofu',
        priceCents: 3800,
        productId: 'tofu',
        productUrl: 'https://retailer.test/tofu',
        title: 'Firm tofu 300g',
      },
      {
        ...storedDeal,
        id: 'chicken',
        priceCents: 8000,
        productId: 'chicken',
        productUrl: 'https://retailer.test/chicken',
        title: 'Chicken breast 1kg',
      },
    ]
    const deps = dependencies({
      listDeals: vi.fn(async () => groceryDeals),
    })

    const response = await handleScoutChat({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.test/api/scout-chat', {
        body: JSON.stringify({
          message: 'Create a grocery list for the cheapest vegan food for a family of 4',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    }, deps)
    const body = await response.json() as {
      data: {
        answer: {
          groceryPlan?: {
            items: Array<{ id: string; quantity: number }>
            maxStores: number
            storeCount: number
          }
          reply: string
        }
      }
    }

    expect(deps.listDeals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 200,
        searchTerms: [],
        visibilityLimit: 2_000,
      }),
    )
    expect(body.data.answer.groceryPlan).toMatchObject({
      maxStores: 3,
      storeCount: 1,
    })
    expect(body.data.answer.groceryPlan?.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['rice', 'beans', 'spinach', 'tofu']),
    )
    expect(body.data.answer.groceryPlan?.items.map((item) => item.id))
      .not.toContain('chicken')
    expect(body.data.answer.groceryPlan?.items.every((item) => item.quantity === 2))
      .toBe(true)
    expect(body.data.answer.reply).toContain('temporary grocery list')
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

describe('searchMarketplaceDeals', () => {
  it('searches snapshot and business Marketplace rows in visible rank order', () => {
    const marketplaceDeals = [
      {
        capturedAt: '2026-07-26T10:00:00.000Z',
        evidenceText: 'Public promotion',
        id: 'legacy-rice',
        priceText: 'R39.99',
        productUrl: 'https://retailer.test/rice',
        retailerId: 'other',
        retailerName: 'Local Market',
        sourceLabel: 'Marketplace snapshot',
        sourceUrl: 'https://retailer.test/specials',
        title: 'Long grain rice 2kg',
      },
      {
        capturedAt: '2026-07-26T10:00:00.000Z',
        evidenceText: 'Public promotion',
        id: 'business-rice',
        priceText: 'R49.99',
        productUrl: 'https://business.test/rice',
        retailerId: 'other',
        retailerName: 'Business Market',
        sourceLabel: 'Business listing',
        sourceUrl: 'https://business.test',
        title: 'Rice combo',
      },
      {
        capturedAt: '2026-07-26T10:00:00.000Z',
        evidenceText: 'Public promotion',
        id: 'coffee',
        priceText: 'R79.99',
        productUrl: 'https://retailer.test/coffee',
        retailerId: 'other',
        retailerName: 'Local Market',
        sourceLabel: 'Marketplace snapshot',
        sourceUrl: 'https://retailer.test/specials',
        title: 'Coffee',
      },
    ] as const

    expect(searchMarketplaceDeals(marketplaceDeals, ['rice']).map((deal) => deal.id)).toEqual([
      'business-rice',
      'legacy-rice',
    ])
  })
})
