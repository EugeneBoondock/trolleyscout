import { describe, expect, it } from 'vitest'
import {
  decodeEntities,
  extractNextData,
  parseAnewHotels,
  parseBushBreaks,
  parseCityLodge,
  parseDaddysDeals,
  parseFlightCentre,
  parseHyperli,
  parseMyRunway,
  parseOneDayOnly,
  parseSouthernSun,
  parseTravelstart,
  parseSunInternational,
} from './dealSites'

describe('parseOneDayOnly', () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        homePage: {
          items: [
            { type: 'hero', props: {} },
            {
              type: 'shop',
              props: {
                products: [
                  {
                    id: 'flatweave-rug-20260709',
                    realId: 1292923,
                    name: 'Hand Woven Flatweave Rug',
                    brand: 'Maeve Living',
                    isSoldOut: false,
                    retailPrice: { value: 5000, formattedValue: 'R5,000' },
                    price: { value: 1499, formattedValue: 'R1,499' },
                    saving: { format: 'PERCENT', percent: 70, fixed: { value: 3500, formattedValue: 'R3,500' } },
                    activeToDate: '2026-07-18 23:59:59',
                    image: { url: 'https://odo-cdn.imgix.net/x.jpeg' },
                    gallery: [
                      { type: 'IMAGE', position: 4, file: { url: 'https://odo-cdn.imgix.net/x.jpeg' } },
                      { type: 'VIDEO', file: { url: 'https://odo-cdn.imgix.net/demo.mp4' } },
                      { type: 'IMAGE', position: 2, file: { url: 'https://odo-cdn.imgix.net/side.jpeg' } },
                      { type: 'IMAGE', position: 1, file: { url: 'https://odo-cdn.imgix.net/censored.jpeg', isCensored: true } },
                    ],
                  },
                  { id: 'sold', realId: 2, name: 'Gone', isSoldOut: true, price: { formattedValue: 'R1' } },
                ],
              },
            },
          ],
        },
      },
    },
  })}</script></body></html>`

  it('extracts products with price, was-price, percentage saving and expiry', () => {
    const items = parseOneDayOnly(html)
    expect(items).toHaveLength(2)
    const item = items[0]
    expect(item.id).toBe('onedayonly-1292923')
    expect(item.title).toBe('Hand Woven Flatweave Rug')
    expect(item.retailerName).toBe('OneDayOnly')
    expect(item.priceText).toBe('R1,499')
    expect(item.previousPriceText).toBe('R5,000')
    expect(item.savingText).toBe('Save R3,500 (70% off)')
    expect(item.expiresAt).toBe('2026-07-18 23:59:59')
    expect(item.productUrl).toBe('https://www.onedayonly.co.za/products/flatweave-rug-20260709')
    expect(item.source).toBe('onedayonly')
    expect(item.images).toEqual([
      'https://odo-cdn.imgix.net/x.jpeg',
      'https://odo-cdn.imgix.net/side.jpeg',
    ])
  })

  it('keeps a sold-out deal and says it is gone', () => {
    // Dropping these meant the reel could never badge one: the card simply was
    // not there, so a shopper never learned the thing had sold out.
    const gone = parseOneDayOnly(html).find((item) => item.id === 'onedayonly-2')
    expect(gone).toMatchObject({ soldOut: true, title: 'Gone' })
  })

  it('leaves soldOut unset on a deal still in stock', () => {
    // Absent, not false: the sites that say nothing about stock must not read
    // as having confirmed the thing is available.
    const stocked = parseOneDayOnly(html).find((item) => item.id === 'onedayonly-1292923')
    expect(stocked?.soldOut).toBeUndefined()
  })

  it('returns empty for html without __NEXT_DATA__', () => {
    expect(parseOneDayOnly('<html></html>')).toEqual([])
  })

  it('prefers a supplied external listing link', () => {
    const externalHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          homePage: {
            items: [{
              props: {
                products: [{
                  externalListingLink: 'https://merchant.example/deal',
                  id: 'external-deal',
                  isSoldOut: false,
                  name: 'External deal',
                  price: { formattedValue: 'R99' },
                  realId: 9001,
                }],
              },
            }],
          },
        },
      },
    })}</script>`

    expect(parseOneDayOnly(externalHtml)[0].productUrl).toBe('https://merchant.example/deal')
  })

  it('rejects non-web external listing links', () => {
    const unsafeHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          homePage: {
            items: [{
              props: {
                products: [{
                  externalListingLink: 'javascript:alert(1)',
                  id: 'safe-fallback',
                  isSoldOut: false,
                  name: 'Safe fallback',
                  price: { formattedValue: 'R99' },
                  realId: 9002,
                }],
              },
            }],
          },
        },
      },
    })}</script>`

    expect(parseOneDayOnly(unsafeHtml)[0].productUrl)
      .toBe('https://www.onedayonly.co.za/products/safe-fallback')
  })
})

describe('parseHyperli', () => {
  const payload = {
    products: [
      {
        id: 555,
        title: 'UTV Adventure',
        handle: 'utv-adventure',
        vendor: 'WildX',
        product_type: 'Activities',
        variants: [{ price: '999.00', compare_at_price: '1199.00', available: true }],
        images: [
          { src: 'https://cdn.shopify.com/side.png', position: 2 },
          { src: 'https://cdn.shopify.com/x.png', position: 1 },
        ],
      },
      {
        id: 556,
        title: 'Sold out thing',
        handle: 'sold',
        variants: [{ price: '10.00', available: false }],
        images: [],
      },
    ],
  }

  it('maps Shopify products with compare-at savings', () => {
    const items = parseHyperli(payload)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.id).toBe('hyperli-555')
    expect(item.priceText).toBe('R999')
    expect(item.previousPriceText).toBe('R1199')
    expect(item.savingText).toBe('Save R200')
    expect(item.productUrl).toBe('https://hyperli.com/products/utv-adventure')
    expect(item.sourceLabel).toBe('Hyperli · WildX')
    expect(item.images).toEqual([
      'https://cdn.shopify.com/x.png',
      'https://cdn.shopify.com/side.png',
    ])
  })
})

describe('parseDaddysDeals', () => {
  const payload = [
    {
      modified_gmt: '2026-07-20T08:15:00',
      id: 88,
      link: 'https://daddysdeals.co.za/deals/durban/vouchers/massage/',
      title: { rendered: 'Head &amp; Back Massage for 1' },
      excerpt: { rendered: '<p>Only R199 for a relaxing hour&hellip;</p>' },
      _embedded: {
        'wp:featuredmedia': [{ source_url: 'https://daddysdeals.co.za/img.png' }],
        'wp:term': [[{ name: 'Uncategorized' }], [{ name: 'Durban' }]],
      },
    },
  ]

  it('maps WP product posts, decoding entities and pulling a rand price', () => {
    const items = parseDaddysDeals(payload)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.title).toBe('Head & Back Massage for 1')
    expect(item.priceText).toBe('R199')
    expect(item.imageUrl).toBe('https://daddysdeals.co.za/img.png')
    expect(item.category).toBe('Durban')
    expect(item.capturedAt).toBe('2026-07-20T08:15:00.000Z')
    expect(item.productUrl).toContain('/vouchers/massage/')
  })
})

describe('parseTravelstart', () => {
  it('maps public fare cards and gives each flight a departure-day expiry', () => {
    const html = `
      <a href="https://www.travelstart.co.za/search?depart_date=2026-08-21&from=JNB&to=HRE&airline=FA&search=true" class='fare-card d-flex'>
        <img class="airline-image" alt="FlySafair" data-lazy-src="https://travel.test/fa.png" />
        <h3 class="departure">JNB</h3>
        <h3 class="destination">HRE</h3>
        <div class="fare-card-price"><h3>R1 159</h3></div>
      </a>`

    expect(parseTravelstart(html)).toEqual([
      expect.objectContaining({
        category: 'Flights',
        expiresAt: '2026-08-21 23:59:59',
        imageUrl: 'https://travel.test/fa.png',
        priceText: 'R1 159',
        retailerName: 'FlySafair',
        source: 'travelstart',
        sourceLabel: 'Travelstart flight deals',
        title: 'FlySafair flight: JNB to HRE',
      }),
    ])
  })

  it('ignores unrelated links on the landing page', () => {
    expect(parseTravelstart('<a class="fare-card" href="https://example.com">Fake</a>'))
      .toEqual([])
  })
})

describe('parseSouthernSun', () => {
  it('maps public hotel offers and resolves official relative links and images', () => {
    const html = `
      <article class="special-entry fade-on-scroll">
        <img data-src="//cdn.test/travelsmart.jpg" />
        <h3 class="special-title">TravelSmart, Stay For Less</h3>
        <p class="special-descr">Two children stay free when sharing a family room.</p>
        <a class="learn-more-link" href="/offers/travelsmart">Find out more</a>
      </article>`

    expect(parseSouthernSun(html)).toEqual([
      expect.objectContaining({
        category: 'Hotel stays',
        imageUrl: 'https://cdn.test/travelsmart.jpg',
        productUrl: 'https://www.southernsun.com/offers/travelsmart',
        retailerName: 'Southern Sun',
        source: 'southernsun',
        sourceLabel: 'Southern Sun hotel specials',
        title: 'TravelSmart, Stay For Less',
      }),
    ])
  })

  it('leaves dining-only promotions out of the travel feed', () => {
    const html = `
      <article class="special-entry">
        <h3 class="special-title">Breakfast for two</h3>
        <p class="special-descr">Enjoy eggs, coffee and toast.</p>
        <a class="learn-more-link" href="/offers/breakfast">Learn more</a>
      </article>`

    expect(parseSouthernSun(html)).toEqual([])
  })

  it('keeps a stated hotel-rate saving even when the copy does not say stay', () => {
    const html = `
      <article class="special-entry">
        <h3 class="special-title">Seniors Offer</h3>
        <p class="special-descr">Up to 50% off our rate of the day for seniors.</p>
        <a class="learn-more-link" href="/offers/seniors">Learn more</a>
      </article>`

    expect(parseSouthernSun(html)).toEqual([
      expect.objectContaining({
        savingText: 'Up to 50% off',
        source: 'southernsun',
        title: 'Seniors Offer',
      }),
    ])
  })
})

describe('parseFlightCentre', () => {
  it('maps official public travel tiles and excludes unrelated promotions', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          deals: [
            {
              alt: 'Rydges Auckland',
              id: 23028,
              image: 'https://flightcentre.test/rydges.jpg',
              link: 'https://www.flightcentre.co.za/holidays/nz-auk-auckland/rydges-ZA52510',
              productType: {
                holidayType: ['Attractions', 'Family & Kids'],
                travellerType: ['Couples'],
              },
              title: 'New Zealand - Rydges Auckland Deals Tile',
            },
            {
              alt: 'Turn Your Crypto Into a Holiday',
              id: 22922,
              image: 'https://flightcentre.test/crypto.jpg',
              link: 'https://www.flightcentre.co.za/p/crypto-currency-payment',
              title: 'Moneybadger - Crypto Currency',
            },
          ],
        },
      },
    })}</script>`

    expect(parseFlightCentre(html)).toEqual([
      expect.objectContaining({
        category: 'Attractions',
        id: 'flightcentre-23028',
        imageUrl: 'https://flightcentre.test/rydges.jpg',
        productUrl: 'https://www.flightcentre.co.za/holidays/nz-auk-auckland/rydges-ZA52510',
        retailerName: 'Flight Centre',
        source: 'flightcentre',
        sourceLabel: 'Flight Centre travel deals',
        title: 'Rydges Auckland',
      }),
    ])
  })

  it('keeps official flight promotions and rejects another host', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          deals: [
            {
              alt: 'Local and International Flight Deals',
              id: 11666,
              link: 'https://www.flightcentre.co.za/promotions/flight-deals',
              title: 'Local & International Flights',
            },
            {
              alt: 'Fake',
              id: 1,
              link: 'https://example.com/deals/fake',
              title: 'Fake',
            },
          ],
        },
      },
    })}</script>`

    expect(parseFlightCentre(html)).toEqual([
      expect.objectContaining({
        category: 'Flights',
        id: 'flightcentre-11666',
        source: 'flightcentre',
      }),
    ])
  })

  it('uses Travel for non-flight tiles and replaces image-description alt text', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          deals: [
            {
              alt: 'A couple on a river cruise package.',
              id: 22534,
              link: 'https://www.flightcentre.co.za/deals/tour-and-river-cruise-holidays',
              title: 'Tours & River Cruise Deals | TTL 30 Sep',
            },
          ],
        },
      },
    })}</script>`

    expect(parseFlightCentre(html)).toEqual([
      expect.objectContaining({
        category: 'Travel',
        title: 'Tours & River Cruise Deals',
      }),
    ])
  })

  it('keeps one tile when the public page repeats the same named offer', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          deals: [
            { alt: 'Celebrity Cruises', id: 1, link: 'https://www.flightcentre.co.za/deals/celebrity' },
            { alt: 'Celebrity Cruises', id: 2, link: 'https://www.flightcentre.co.za/product/123' },
          ],
        },
      },
    })}</script>`

    expect(parseFlightCentre(html)).toHaveLength(1)
  })
})

describe('parseCityLodge', () => {
  it('maps public, visible hotel specials with the stated saving and expiry', () => {
    const payload = {
      special_offers: [
        {
          description: 'Save 30%, kids stay and eat breakfast free.',
          end_at: '2027-02-01T07:24:00.000+02:00',
          id: 60,
          image: { url: 'https://citylodge.test/family.jpg' },
          is_active: true,
          name: 'Family Bundle',
          slug: 'familybundle',
          special_type: 'accommodation_plus_food',
        },
      ],
    }

    expect(parseCityLodge(payload)).toEqual([
      expect.objectContaining({
        category: 'Hotel stays',
        expiresAt: '2027-02-01T07:24:00.000+02:00',
        id: 'citylodge-60',
        imageUrl: 'https://citylodge.test/family.jpg',
        productUrl: 'https://citylodgehotels.com/special-offers/familybundle',
        retailerName: 'City Lodge Hotels',
        savingText: '30% off',
        source: 'citylodge',
        sourceLabel: 'City Lodge hotel specials',
        title: 'Family Bundle',
      }),
    ])
  })

  it('excludes inactive and publisher-hidden offers', () => {
    expect(parseCityLodge({
      special_offers: [
        { id: 1, is_active: false, name: 'Old offer', slug: 'old' },
        {
          id: 2,
          is_active: true,
          name: 'Internal rate',
          slug: 'internal',
          special_type: 'not_visible',
        },
      ],
    })).toEqual([])
  })
})

describe('parseAnewHotels', () => {
  it('maps public accommodation offer cards with a price, saving and end date', () => {
    const html = `<div data-elementor-type="loop-item" class="elementor post-168316 deals type-deals status-publish">
      <img data-lazy-src="https://anewhotels.com/wp-content/hazyview.jpg" src="data:image/gif;base64,x" />
      <div class="elementor-widget-theme-post-title"><h3><a href="https://bookings.anewhotels.com/">Winter Your Way at ANEW Resort Hazyview</a></h3></div>
      <p>From <strong>R1,940*</strong> per night. Save up to <strong>R600*</strong>.</p>
      <div>Valid from 1 June – 31 August 2026</div>
    </div>`

    expect(parseAnewHotels(html)).toEqual([
      expect.objectContaining({
        category: 'Hotel stays',
        expiresAt: '2026-08-31 23:59:59',
        id: 'anewhotels-168316',
        imageUrl: 'https://anewhotels.com/wp-content/hazyview.jpg',
        priceText: 'R1,940',
        productUrl: 'https://anewhotels.com/all-specials/#deal-168316',
        savingText: 'Save up to R600',
        source: 'anewhotels',
        title: 'Winter Your Way at ANEW Resort Hazyview',
      }),
    ])
  })
})

describe('parseBushBreaks', () => {
  it('maps official lodge specials and their public gallery', () => {
    const html = `<div class="col-12 card-column card_column_bush_break">
      <span class="savings-percent">61%</span>
      <div data-flickity-bg-lazyload="https://bush.test/cover.jpg"></div>
      <div data-flickity-bg-lazyload="https://bush.test/room.jpg"></div>
      <h5 class="card-title text-center">Buffalo Rock Safari Camp<br /><small>Kruger</small></h5>
      <strong class="from-price">R2,000</strong>
      <small class="special-name">Winter Promo 2 Nights Stay</small>
      <small class="valid-until">From 01 Jun to 31 Aug 2026</small>
      <a href="/listing/buffalo-rock-safari-camp" class="btn">View</a>
    </div>`

    expect(parseBushBreaks(html)).toEqual([
      expect.objectContaining({
        category: 'Safari and lodge stays',
        expiresAt: '2026-08-31 23:59:59',
        imageUrl: 'https://bush.test/cover.jpg',
        images: ['https://bush.test/cover.jpg', 'https://bush.test/room.jpg'],
        priceText: 'R2,000',
        productUrl: 'https://www.bushbreaks.co.za/listing/buffalo-rock-safari-camp',
        retailerName: 'Buffalo Rock Safari Camp',
        savingText: '61% off',
        source: 'bushbreaks',
        title: 'Buffalo Rock Safari Camp: Winter Promo 2 Nights Stay',
      }),
    ])
  })
})

describe('parseSunInternational', () => {
  it('keeps public stay offers and leaves dining promotions out', () => {
    const html = `<main>
      <a class="OfferCard_offer-card__link" href="/sunvacationclub/specials/lefika-villas-mvg">
        <img src="https://sun.test/lefika.jpg" />
        <span class="OfferCard_offer-card__property">Sun Vacation Club</span>
        <p class="OfferCard_offer-card__title">LEFIKA VILLAS MEMBERSHIP</p>
        <p class="OfferCard_offer-card__date">Valid until 15 August 2026</p>
      </a>
      <a class="OfferCard_offer-card__link" href="/sibaya/specials/sunday-buffet">
        <span class="OfferCard_offer-card__property">Sibaya</span>
        <p class="OfferCard_offer-card__title">Sunday Buffet</p>
        <p class="OfferCard_offer-card__date">Every Sunday</p>
      </a>
    </main>`

    expect(parseSunInternational(html)).toEqual([
      expect.objectContaining({
        category: 'Resort and hotel stays',
        expiresAt: '2026-08-15 23:59:59',
        imageUrl: 'https://sun.test/lefika.jpg',
        productUrl: 'https://www.suninternational.com/sunvacationclub/specials/lefika-villas-mvg',
        retailerName: 'Sun Vacation Club',
        source: 'suninternational',
        title: 'LEFIKA VILLAS MEMBERSHIP',
      }),
    ])
  })
})

describe('parseMyRunway', () => {
  const payload = {
    products: [
      {
        id: 27138,
        sku: 'ROX_X',
        name: 'White & Pink Sandals',
        brand: { name: 'Roxy' },
        is_sold_out: false,
        retail_price: '330.00',
        selling_price: '89',
        discount: '73',
        image_url: 'https://s3/x.jpg',
        product_images: [
          { image_url: 'https://s3/x.jpg', position: 0, is_include: 1 },
          { image_url: 'https://s3/side.jpg', position: 1, is_include: 1 },
          { image_url: 'https://s3/hidden.jpg', position: 2, is_include: 0 },
        ],
        url_params: 'roxy-sandals-27138',
        product_category_name: 'Shoes',
      },
    ],
  }

  it('maps products with selling/retail prices and a discount', () => {
    const items = parseMyRunway(payload)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.title).toBe('White & Pink Sandals')
    expect(item.retailerName).toBe('Roxy')
    expect(item.priceText).toBe('R89')
    expect(item.previousPriceText).toBe('R330')
    expect(item.savingText).toBe('73% off')
    expect(item.productUrl).toBe('https://myrunway.co.za/product/ROX_X')
    expect(item.category).toBe('Shoes')
    expect(item.images).toEqual(['https://s3/x.jpg', 'https://s3/side.jpg'])
  })

  it('uses the single-product route when only url params are available', () => {
    const items = parseMyRunway({
      products: [{
        id: 99,
        is_sold_out: false,
        name: 'Fallback product',
        selling_price: '100',
        url_params: '/products/fallback-product',
      }],
    })

    expect(items[0].productUrl).toBe('https://myrunway.co.za/product/fallback-product')
  })

  it('encodes a SKU as one route segment', () => {
    const items = parseMyRunway({
      products: [{
        id: 100,
        is_sold_out: false,
        name: 'Encoded product',
        selling_price: '100',
        sku: 'SKU BLUE/ONE',
      }],
    })

    expect(items[0].productUrl).toBe('https://myrunway.co.za/product/SKU%20BLUE%2FONE')
  })

  it('falls back to MyRunway instead of making a numeric product route', () => {
    const items = parseMyRunway({
      products: [{
        id: 99,
        is_sold_out: false,
        name: 'Product without a route key',
        selling_price: '100',
      }],
    })

    expect(items[0].productUrl).toBe('https://myrunway.co.za/')
  })
})

describe('helpers', () => {
  it('decodes common WordPress entities', () => {
    expect(decodeEntities('Fish &amp; Chips &#8211; R50')).toBe('Fish & Chips – R50')
  })

  it('extractNextData returns undefined on malformed json', () => {
    expect(extractNextData('<script id="__NEXT_DATA__" type="application/json">{bad</script>')).toBeUndefined()
  })
})
