import { describe, expect, it } from 'vitest'
import { PORTAL_ADAPTERS, type PortalLocationInput } from './propertyAdapters'

const CAPE_TOWN: PortalLocationInput = {
  name: 'Cape Town',
  province: 'Western Cape',
  p24: { id: 432, type: 2, name: 'Cape Town', parent: 'Western Cape' },
  pp: { id: 55, name: 'Cape Town', descriptor: 'Western Cape' },
  pamgolding: 3080,
  myroof: { id: 26, slug: 'Cape-Town-City' },
}

function adapter(id: string) {
  const a = PORTAL_ADAPTERS.find((x) => x.id === id)
  if (!a) throw new Error(`no adapter ${id}`)
  return a
}

describe('portal adapter registry', () => {
  it('has unique ids and labels and covers all portals', () => {
    const ids = PORTAL_ADAPTERS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      'property24', 'privateproperty', 'gumtree', 'seeff', 'harcourts', 'chaseveritt',
      'jawitz', 'rawson', 'remax', 'immoafrica', 'sahometraders', 'pamgolding', 'myroof',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('every adapter can address a fully-populated location', () => {
    for (const a of PORTAL_ADAPTERS) {
      expect(a.buildUrl(CAPE_TOWN, 'sale', 1), a.id).toBeTruthy()
    }
  })

  it('builds correct slug/id search URLs', () => {
    expect(adapter('gumtree').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.gumtree.co.za/s-houses-flats-for-sale/cape-town/v1c9074p1',
    )
    expect(adapter('gumtree').buildUrl(CAPE_TOWN, 'rent', 2)).toBe(
      'https://www.gumtree.co.za/s-houses-flats-for-rent/cape-town/v1c9078p2',
    )
    expect(adapter('seeff').buildUrl(CAPE_TOWN, 'rent', 1)).toBe(
      'https://www.seeff.com/results/residential/to-let/cape-town/',
    )
    expect(adapter('remax').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.remax.co.za/property-for-sale-south-africa/western-cape/cape-town',
    )
    expect(adapter('immoafrica').buildUrl(CAPE_TOWN, 'rent', 1)).toBe(
      'https://www.immoafrica.net/property-to-rent/cape-town/western-cape/south-africa',
    )
    expect(adapter('sahometraders').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.sahometraders.co.za/property-for-sale-in-cape-town-c432',
    )
    expect(adapter('pamgolding').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.pamgolding.co.za/property-search/property-for-sale-cape-town/3080',
    )
    expect(adapter('myroof').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.myroof.co.za/property-for-sale/south-africa/property-for-sale-in-Cape-Town-City-26/?search_view=List',
    )
  })

  it('returns undefined when a portal cannot address the location', () => {
    const bare: PortalLocationInput = { name: 'Nowhere', province: 'Karoo' }
    expect(adapter('sahometraders').buildUrl(bare, 'sale', 1)).toBeUndefined()
    expect(adapter('pamgolding').buildUrl(bare, 'sale', 1)).toBeUndefined()
    expect(adapter('myroof').buildUrl(bare, 'sale', 1)).toBeUndefined()
    // Slug portals can always address by name.
    expect(adapter('gumtree').buildUrl(bare, 'sale', 1)).toContain('nowhere')
  })
})

describe('Gumtree parser (inline JSON)', () => {
  it('reads price, beds and geo from galleryAdList', () => {
    const html = `<script>galleryAdList_searchGallery = [
      {"id":"1","adId":"111","viewSeoUrl":"/a-houses-flats-for-sale/cape-town/x/111","title":"3 Bed House","price":{"amount":2650000,"formattedAmount":"R 2,650,000"},"pictures":[{"size":"LARGE","url":"https://gms.gumtree.co.za/v2/images/abc?size=s"}],"geo":{"name":"Claremont, Cape Town"},"chiplets":{"bedrooms":{"bedroomsValue":3},"bathrooms":{"bathroomsValue":2}}},
      {"id":"2","adId":"222","viewSeoUrl":"/a/222","title":"Burglar bars","price":{"amount":0}}
    ];</script>`
    const out = adapter('gumtree').parse(html, 'sale')
    expect(out).toHaveLength(1) // the non-dwelling (no beds, no price) is dropped
    expect(out[0]).toMatchObject({ id: 'gumtree:111', priceValue: 2650000, bedrooms: 3, bathrooms: 2 })
    expect(out[0].imageUrl).toContain('?size=l')
    expect(out[0].listingUrl).toBe('https://www.gumtree.co.za/a-houses-flats-for-sale/cape-town/x/111')
  })
})

describe('PropData card-sm parser (Harcourts/Chas Everitt)', () => {
  it('reads price, beds, suburb and link', () => {
    const html = `<div class="listing-results-cards">
      <a class="property-card-sm" id="3361561" data-id="3361561" href="/results/residential/for-sale/cape-town/belhar/apartment/3361561/">
        <div class="card-img"><img src="https://d21tw07c6rnmp0.cloudfront.net/media/uploads/2/residential/2026/7/2_abc_t_w_320_h_240.avif"></div>
        <p class="card-price">R850,000</p>
        <p class="card-description">3 Bedroom Apartment For Sale in Belhar</p>
        <div class="card-stats"><div><svg class="icon icon-icon-solid-bed"></svg><p>3 Bed</p></div><div><svg class="icon icon-icon-solid-bath"></svg><p>2 Bath</p></div></div>
      </a></div>`
    const out = adapter('harcourts').parse(html, 'sale')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'harcourts:3361561',
      priceValue: 850000,
      bedrooms: 3,
      bathrooms: 2,
      location: 'Belhar',
      listingUrl: 'https://www.harcourts.co.za/results/residential/for-sale/cape-town/belhar/apartment/3361561/',
    })
    expect(out[0].imageUrl).toContain('cloudfront.net')
  })
})

describe('RE/MAX parser (JSON-LD graph)', () => {
  it('joins property and offer nodes by @id base', () => {
    const html = `<script id="listing-page-graph" type="application/ld+json">{"@graph":[
      {"@type":"ItemList","itemListElement":[
        {"@type":"ListItem","item":{"@type":"Apartment","@id":"https://www.remax.co.za/property-for-sale-south-africa/western-cape/cape-town/x-70501309#property","name":"2 Bedroom Apartment For Sale in Cape Town City Centre","address":{"@type":"PostalAddress","addressLocality":"Cape Town City Centre","addressRegion":"Western Cape"}}}
      ]},
      {"@type":"Offer","@id":"https://www.remax.co.za/property-for-sale-south-africa/western-cape/cape-town/x-70501309#offer","price":4500000,"priceCurrency":"ZAR"},
      {"@type":"ImageObject","@id":"https://www.remax.co.za/property-for-sale-south-africa/western-cape/cape-town/x-70501309#property","contentUrl":"https://cdn.remax.co.za/listings/70501309/original/a.jpg"}
    ]}</script>`
    const out = adapter('remax').parse(html, 'sale')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'remax:70501309',
      priceValue: 4500000,
      location: 'Cape Town City Centre',
      province: 'Western Cape',
      bedrooms: 2,
    })
    expect(out[0].imageUrl).toContain('cdn.remax.co.za')
  })
})
