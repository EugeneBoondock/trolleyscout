import { describe, expect, it } from 'vitest'
import {
  MAKRO_CLIENT_HEADER,
  MAKRO_DEPARTMENTS,
  buildMakroPageRequest,
  parseMakroProductFeed,
} from './makroProducts'

const context = {
  capturedAt: '2026-07-25T22:00:00.000Z',
  sourceUrl: 'https://www.makro.co.za/laptops-printers-store',
}

// Makro's own payload shape, trimmed to the parts that matter.
function payload(overrides: Record<string, unknown> = {}) {
  return {
    RESPONSE: {
      slots: [{
        widget: {
          data: {
            renderableComponents: [{
              value: {
                availability: { displayState: 'IN_STOCK' },
                id: 'LTPHGNPJVWZYNKGH',
                media: {
                  images: [{
                    url: 'https://www.makro.co.za/asset/rukmini/fccp/{@width}/{@height}/laptop.jpeg?q={@quality}',
                  }],
                },
                pricing: {
                  finalPrice: { currency: 'INR', decimalValue: '7289.00' },
                  mrp: { currency: 'INR', decimalValue: '9999.00' },
                },
                smartUrl: 'http://www.makro.co.za/asus-vivobook/p/itm130325011acad?pid=LTPHGNPJVWZYNKGH',
                titles: { title: 'ASUS Vivobook Go 15' },
                ...overrides,
              },
            }],
          },
        },
      }],
    },
  }
}

describe('buildMakroPageRequest', () => {
  // Without this header the endpoint answers 403 and the shop looks empty.
  it('names the client the way the platform demands', () => {
    const request = buildMakroPageRequest('/liquor-store')

    expect(request.headers['x-user-agent']).toBe(MAKRO_CLIENT_HEADER)
    expect(JSON.parse(request.body)).toEqual({ pageUri: '/liquor-store' })
  })

  it('sweeps departments taken from Makro’s own navigation', () => {
    expect(MAKRO_DEPARTMENTS).toContain('/weekly-deals-store')
    expect(MAKRO_DEPARTMENTS.every((path) => path.startsWith('/'))).toBe(true)
  })
})

describe('parseMakroProductFeed', () => {
  it('reads the price paid and the price struck through', () => {
    const page = parseMakroProductFeed(payload(), context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      // Labelled INR by the platform, but Makro is a South African shop and
      // these are rands. Believing the currency field would price a R7,289
      // laptop in rupees.
      priceCents: 728_900,
      previousPriceCents: 999_900,
      productId: 'LTPHGNPJVWZYNKGH',
      title: 'ASUS Vivobook Go 15',
    })
  })

  it('serves the product link over https and the image without placeholders', () => {
    const [deal] = parseMakroProductFeed(payload(), context).candidates

    expect(deal.productUrl.startsWith('https://www.makro.co.za/')).toBe(true)
    expect(deal.imageUrl).not.toContain('{@')
    expect(deal.imageUrl).toContain('makro.co.za')
  })

  it('marks a product the shop says is gone', () => {
    const [deal] = parseMakroProductFeed(
      payload({ availability: { displayState: 'OUT_OF_STOCK' } }),
      context,
    ).candidates

    expect(deal.soldOut).toBe(true)
  })

  it('leaves stock unsaid when the shop does not say', () => {
    const [deal] = parseMakroProductFeed(payload({ availability: {} }), context).candidates

    expect(deal.soldOut).toBeUndefined()
  })

  // A full-price product is not a deal, and a struck-through price that is not
  // above the price paid is not a saving.
  it('claims no saving when the struck price is not higher', () => {
    const [deal] = parseMakroProductFeed(
      payload({
        pricing: {
          finalPrice: { decimalValue: '7289.00' },
          mrp: { decimalValue: '7289.00' },
        },
      }),
      context,
    ).candidates

    expect(deal.previousPriceCents).toBeUndefined()
  })

  it('rejects a payload that is not a Makro page', () => {
    expect(() => parseMakroProductFeed({}, context)).toThrow(TypeError)
    expect(() => parseMakroProductFeed(null, context)).toThrow(TypeError)
  })
})
