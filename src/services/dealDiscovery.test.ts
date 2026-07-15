import { describe, expect, it } from 'vitest'
import {
  buildClicksPromotionsApiUrl,
  buildTakealotDealsApiUrl,
  extractClicksPromotionDeals,
  extractDealsFromHtml,
  extractTakealotProductDeals,
  getDiscoveryTargets,
} from './dealDiscovery'

describe('dealDiscovery', () => {
  it('builds the Clicks promotions results URL', () => {
    const apiUrl = new URL(buildClicksPromotionsApiUrl())

    expect(apiUrl.origin).toBe('https://clicks.co.za')
    expect(apiUrl.pathname).toBe('/products/c/OH1/results')
    expect(apiUrl.searchParams.get('q')).toBe(':relevance:promoStickerplp:1')
  })

  it('extracts Clicks promotion rows from the results JSON', () => {
    const target = getDiscoveryTargets().find((candidate) => candidate.parserId === 'clicks-promotions')

    expect(target).toBeDefined()

    // Shape mirrors the live clicks.co.za /products/c/OH1/results payload.
    const payload = {
      pagination: { totalNumberOfResults: 429 },
      results: [
        {
          code: '180234',
          brand: 'Yardley',
          name: 'Stayfast Pressed Powder Deep Beige 04 15g',
          url: '/yardley_stayfast-pressed-powder-deep-beige-04-15g/p/180234',
          stock: { stockLevelStatus: { code: 'inStock' } },
          price: {
            currencyIso: 'ZAR',
            value: 249.95,
            formattedValue: 'R 249.95',
            grossPriceWithPromotionApplied: 174.96499999999997,
          },
          potentialPromotions: [
            {
              code: '202606092032131394',
              description: 'Save 30% Stayfast liquid foundation. Valid until 22 July 2026',
            },
          ],
        },
        {
          code: '333222',
          brand: 'Sold Out',
          name: 'Out of stock item',
          url: '/sold-out/p/333222',
          stock: { stockLevelStatus: { code: 'outOfStock' } },
          price: { formattedValue: 'R 99.00' },
        },
      ],
    }

    const deals = extractClicksPromotionDeals(target!, payload, '2026-07-15T10:00:00.000Z')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      previousPriceText: 'R 249.95',
      priceText: 'R 174.96',
      retailerId: 'clicks',
      savingText: 'Save 30% Stayfast liquid foundation. Valid until 22 July 2026',
      title: 'Yardley Stayfast Pressed Powder Deep Beige 04 15g',
    })
    expect(deals[0].productUrl).toBe(
      'https://clicks.co.za/yardley_stayfast-pressed-powder-deep-beige-04-15g/p/180234',
    )
  })

  it('extracts Dis-Chem static promotion cards', () => {
    const target = getDiscoveryTargets().find((candidate) => candidate.parserId === 'dischem-promotion')

    expect(target).toBeDefined()

    const html = `
      <li data-content-type="slide" class="keen-slider__slide product-item">
        <div class="product-item-info">
          <div class="price-box-wrapper-listing simple-from">
            <span class="old-price"><span class="price">R 2,065.00</span></span>
            <span class="special-price special-red"><span class="price">R 1,032.50</span></span>
          </div>
          <strong class="product-item-name">
            <a title="Paco Rabanne Fame Eau De Parfum 50ml" href="https://www.dischem.co.za/paco-rabanne-fame-eau-de-parfum-50ml-381" class="product-item-link">
              Paco Rabanne Fame Eau De Parfum 50ml
            </a>
          </strong>
        </div>
      </li>
    `

    const deals = extractDealsFromHtml(target!, html, '2026-07-01T10:00:00.000Z')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      priceText: 'R 1,032.50',
      previousPriceText: 'R 2,065.00',
      retailerId: 'dis-chem',
      title: 'Paco Rabanne Fame Eau De Parfum 50ml',
    })
  })

  it('extracts Yuppiechef static special cards', () => {
    const target = getDiscoveryTargets().find((candidate) => candidate.parserId === 'yuppiechef-specials')

    expect(target).toBeDefined()

    const html = `
      <article class="card flex-grid-content product-card product-card--small">
        <a href="philips-coffee-makers.htm?id=65331&amp;name=Philips-5500-Series-Fully-Automatic-Bean-to-Cup-and-Cold-Brew-Espresso-Machine" class="u-block-link">
          <div class="card__content-wrapper">
            <h1 class="product-card__title">
              <span class="product-card__brand">Philips</span>
              <span class="product-card__name">5500 Series Fully Automatic Bean-to-Cup &amp; Cold Brew Espresso Machine</span>
            </h1>
            <ul class="card-price-list group">
              <li class="card-price-list__item card-price-list__item--now"><span class="u-hidden-from-view">Now </span>R13,999</li>
              <li class="card-price-list__item card-price-list__item--was"><span>Was </span>R16,499</li>
            </ul>
            <div class="card-sticker card-sticker--price">Save <!-- -->R2,500</div>
          </div>
        </a>
      </article>
    `

    const deals = extractDealsFromHtml(target!, html, '2026-07-01T10:00:00.000Z')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      priceText: 'Now R13,999',
      previousPriceText: 'Was R16,499',
      retailerId: 'yuppiechef',
      savingText: 'Save R2,500',
      title: 'Philips 5500 Series Fully Automatic Bean-to-Cup & Cold Brew Espresso Machine',
    })
    expect(deals[0].productUrl).toBe('https://www.yuppiechef.com/philips-coffee-makers.htm?id=65331&name=Philips-5500-Series-Fully-Automatic-Bean-to-Cup-and-Cold-Brew-Espresso-Machine')
  })

  it('extracts Amazon static deal JSON', () => {
    const target = getDiscoveryTargets().find((candidate) => candidate.parserId === 'amazon-deals')

    expect(target).toBeDefined()

    const html = `
      <script>
        {"asin":"B0FQFW7P4S","title":"Apple iPhone 17 Pro Max 512GB","link":"/Apple-iPhone-17-Pro-Max/dp/B0FQFW7P4S","price":{"priceToPay":{"label":"Deal Price:","price":"31999.0","strikethrough":false},"basisPrice":{"label":"List:","price":"35399.0","strikethrough":true}},"dealBadge":{"label":{"content":{"fragments":[{"text":"10% off"}]}}}}
      </script>
    `

    const deals = extractDealsFromHtml(target!, html, '2026-07-01T10:00:00.000Z')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      previousPriceText: expect.stringContaining('List'),
      priceText: expect.stringContaining('Deal Price'),
      retailerId: 'amazon-za',
      savingText: '10% off',
      title: 'Apple iPhone 17 Pro Max 512GB',
    })
    expect(deals[0].productUrl).toBe('https://www.amazon.co.za/Apple-iPhone-17-Pro-Max/dp/B0FQFW7P4S')
  })

  it('extracts Amazon static voucher JSON', () => {
    const target = getDiscoveryTargets().find((candidate) => candidate.parserId === 'amazon-vouchers')

    expect(target).toBeDefined()

    const html = `
      <script>
        {"asin":"B0H3LWJJBR","title":"USB C Hub 8 in 1 Adapter","link":"/USB-Hub-Adapter/dp/B0H3LWJJBR","price":{"priceToPay":{"label":"Price:","price":"125.0","strikethrough":false}},"coupon":{"label":{"fragments":[{"text":"You pay "},{"money":{"amount":"112.50","currencyCode":"ZAR"}}]},"messaging":{"text":" with voucher"},"id":"/promo/A13E9H0R6NENRV"}}
      </script>
    `

    const deals = extractDealsFromHtml(target!, html, '2026-07-01T10:00:00.000Z')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      previousPriceText: expect.stringContaining('Price'),
      priceText: expect.stringContaining('Voucher price'),
      retailerId: 'amazon-za',
      savingText: 'With voucher',
      title: 'USB C Hub 8 in 1 Adapter',
    })
    expect(deals[0].productUrl).toBe('https://www.amazon.co.za/USB-Hub-Adapter/dp/B0H3LWJJBR')
  })

  it('builds Takealot deal API URLs from official page URLs', () => {
    const apiUrl = new URL(buildTakealotDealsApiUrl('https://www.takealot.com/deals?filter=Type:34'))

    expect(apiUrl.origin).toBe('https://api.takealot.com')
    expect(apiUrl.pathname).toBe('/rest/v-1-17-0/searches/products')
    expect(apiUrl.searchParams.get('context')).toBe('deals')
    expect(apiUrl.searchParams.getAll('filter')).toEqual(['Type:34'])
  })

  it('extracts Takealot API deal rows', () => {
    const target = getDiscoveryTargets().find(
      (candidate) => candidate.parserId === 'takealot-deals' && candidate.sourceLabel === 'Household deals',
    )

    expect(target).toBeDefined()

    const payload = {
      sections: {
        products: {
          results: [
            {
              type: 'product_views',
              product_views: {
                badges: {
                  entries: [
                    {
                      id: 'badge-0',
                      type: 'saving',
                      value: '22% off',
                    },
                  ],
                },
                buybox_summary: {
                  pretty_price: 'From R 248',
                },
                core: {
                  id: 70902784,
                  slug: 'indomie-mi-goreng-hot-and-spicy-noodle-80gr-x-40-units',
                  title: 'Indomie Mi Goreng Hot and Spicy Noodle 80gr x 40 Units',
                },
              },
            },
          ],
        },
      },
    }

    const deals = extractTakealotProductDeals(target!, payload, '2026-07-01T10:00:00.000Z')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      priceText: 'From R 248',
      retailerId: 'takealot',
      savingText: '22% off',
      title: 'Indomie Mi Goreng Hot and Spicy Noodle 80gr x 40 Units',
    })
    expect(deals[0].productUrl).toBe(
      'https://www.takealot.com/indomie-mi-goreng-hot-and-spicy-noodle-80gr-x-40-units/PLID70902784',
    )
  })
})
