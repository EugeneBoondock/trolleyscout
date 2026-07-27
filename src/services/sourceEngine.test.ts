import { describe, expect, it } from 'vitest'
import { retailers } from '../data/retailers'
import { verifiedOffers } from '../data/verifiedOffers'
import { countSources, countVerifiedOffers, filterRetailers, getSourceKinds } from './sourceEngine'

describe('sourceEngine', () => {
  it('starts with no verified offers', () => {
    expect(verifiedOffers).toEqual([])
    expect(countVerifiedOffers(verifiedOffers)).toBe(0)
  })

  it('counts official source links', () => {
    expect(countSources(retailers)).toBeGreaterThanOrEqual(20)
  })

  it('filters retailers by query and source kind', () => {
    const matches = filterRetailers(retailers, {
      query: 'clubcard',
      sourceKind: 'loyalty',
    })

    expect(matches.map((retailer) => retailer.id)).toEqual(['clicks'])
  })

  it('reports only known source kinds', () => {
    expect(getSourceKinds(retailers)).toEqual(['app', 'loyalty', 'specials', 'store-finder'])
  })

  it('covers the named Kimbino and Catalogue Specials retailer directories with official sources', () => {
    const retailerIds = new Set(retailers.map((retailer) => retailer.id))
    const expectedIds = [
      'one-up-cash-and-carry',
      'africa-cash-and-carry',
      'big-save',
      'bluff-meat-supply',
      'check-save',
      'checkstar',
      'devland',
      'diamond-discount-liquors',
      'jumbo-cash-and-carry',
      'kit-kat-cash-and-carry',
      'oxford-freshmarket',
      'president-hyper',
      'save',
      'saverite',
      'super-save',
      'take-n-pay',
      'the-total-store',
      'ultra-liquors',
      'cash-crusaders',
      'cell-c',
      'cellucity',
      'hifi-corp',
      'hirschs',
      'mtn',
      'telkom',
      'vodacom',
      'adendorff',
      'agrimark',
      'beares',
      'bradlows',
      'brights-hardware',
      'buco',
      'build-it',
      'cashbuild',
      'chamberlains',
      'coricraft',
      'crazy-plastics',
      'ctm',
      'decofurn',
      'furnmart',
      'gelmar',
      'house-and-home',
      'k-carrim',
      'laduma-hardware',
      'leroy-merlin',
      'lewis-stores',
      'mica',
      'mrp-home',
      'ok-furniture',
      'russells',
      'schulmans-home',
      'sheet-street',
      'sleepmasters',
      'tafelberg-furnishers',
      'volpes',
      'ackermans',
      'foschini',
      'jet',
      'markham',
      'avon',
      'justine',
      'autozone',
      'babies-r-us',
      'baby-city',
      'crazy-store',
      'sterns',
      'temu',
      'toys-r-us',
      'tupperware',
      'bt-games',
      'computer-mania',
      'matrix-warehouse',
      'teljoy',
      'mrp-sport',
      'spitz',
      'aliexpress',
      'dial-a-bed',
      'discount-decor',
      'j-and-e-cash-and-carry',
      'three-star-cash-and-carry',
      'ok-urban',
      'home-corp',
      'homechoice',
      'incredible-connection',
    ]

    expect(expectedIds.filter((id) => !retailerIds.has(id))).toEqual([])

    for (const retailer of retailers) {
      for (const source of retailer.sources) {
        expect(source.url).not.toMatch(/kimbino|cataloguespecials/i)
      }
    }
  })
})
