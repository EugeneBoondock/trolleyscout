import { describe, expect, it } from 'vitest'
import { extractDealsFromHtml, getDiscoveryTargets } from './dealDiscovery'

describe('dealDiscovery', () => {
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
})
