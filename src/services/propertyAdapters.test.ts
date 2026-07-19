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
      // Wave 1 additions
      'wakefields', 'tysonprop', 'century21', 'huizemark', 'justproperty', 'lewgeffen',
      'dormehlphalane', 'fineandcountry', 'engelvoelkers', 'roomies',
      // Wave 2 additions
      'realnet', 'leapfrog',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('every adapter can address a fully-populated location (sale or rent)', () => {
    for (const a of PORTAL_ADAPTERS) {
      const addressable = a.buildUrl(CAPE_TOWN, 'sale', 1) || a.buildUrl(CAPE_TOWN, 'rent', 1)
      expect(addressable, a.id).toBeTruthy()
    }
  })

  it('rooms portals are rent-only', () => {
    const roomies = adapter('roomies')
    expect(roomies.buildUrl(CAPE_TOWN, 'sale', 1)).toBeUndefined()
    expect(roomies.buildUrl(CAPE_TOWN, 'rent', 1)).toBe('https://www.roomies.co.za/rooms/cape-town')
  })

  it('builds Wave 1 slug/agency URLs', () => {
    expect(adapter('wakefields').buildUrl(CAPE_TOWN, 'rent', 1)).toBe(
      'https://www.wakefields.co.za/results/residential/to-let/cape-town/',
    )
    expect(adapter('dormehlphalane').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.dpgprop.co.za/results/residential/for-sale/cape-town/all/',
    )
    expect(adapter('justproperty').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.just.property/results/residential/for-sale/cape-town/',
    )
    expect(adapter('fineandcountry').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://www.fineandcountry.co.za/sales/property-for-sale/cape-town',
    )
    expect(adapter('engelvoelkers').buildUrl(CAPE_TOWN, 'rent', 1)).toBe(
      'https://www.engelvoelkers.com/za/en/properties/res/rent/real-estate/western-cape/cape-town',
    )
    expect(adapter('realnet').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://realnet.co.za/listings/?search-category=residential&listings-type=sale&search-location=za_western-cape_cape-town',
    )
    // Leapfrog reuses the Property24 id; undefined without it.
    expect(adapter('leapfrog').buildUrl(CAPE_TOWN, 'sale', 1)).toBe(
      'https://leapfrog.co.za/buy/?ff_city_id%5B%5D=432',
    )
    expect(adapter('leapfrog').buildUrl({ name: 'Nowhere', province: 'Karoo' }, 'sale', 1)).toBeUndefined()
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

describe('Roomies parser (JSON-LD, rent-only)', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"CollectionPage","name":"Rooms","mainEntity":{"@type":"ItemList","itemListElement":[
    {"@type":"ListItem","item":{"@type":"Room","name":"Furnished room in a house | Cape Town, Western Cape 7925 | A furnished room in Woodstock.","numberOfBedrooms":3,"numberOfBathroomsTotal":2,"url":"https://www.roomies.co.za/rooms/936625","photo":{"@type":"Photograph","url":"https://cloudinary.roomies.pics/image/upload/x/uj9"},"offers":{"@type":"Offer","price":9000,"priceCurrency":"ZAR"},"address":{"@type":"PostalAddress","addressRegion":"Western Cape"}}}
  ]}}</script>`
  it('reads rooms with inline offers and pipe-delimited names', () => {
    const out = adapter('roomies').parse(html, 'rent')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'roomies:936625',
      priceValue: 9000,
      bedrooms: 3,
      bathrooms: 2,
      location: 'Cape Town',
      listingType: 'rent',
    })
    expect(out[0].title).toBe('Furnished room in a house')
    expect(out[0].priceText).toContain('/mo')
  })
  it('returns nothing for sale', () => {
    expect(adapter('roomies').parse(html, 'sale')).toHaveLength(0)
  })
})

describe('Fine & Country parser', () => {
  it('reads price (ZAR span), beds from slug, and image by id', () => {
    const html = `<div class="card__content-body"><h4><a href="https://www.fineandcountry.co.za/x/property-sale/3-bedroom-apartment-for-sale-in-cape-town-bantry-bay/4929365" class="property-title-link" data-propertyid="4929365"><span>Bantry Bay, Cape Town</span></a></h4>
      <div class="card__text"><div class="property-price"><span class="text-gold"><span class="notranslate">ZAR</span>45,000,000</span></div></div>
      <div class="slide__image" style="background-image: url(https://cdn.members.nurtur.tech/properties/8/972/2941/4929365/IMG_abc_larger.jpg);"></div>`
    const out = adapter('fineandcountry').parse(html, 'sale')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'fineandcountry:4929365',
      priceValue: 45000000,
      bedrooms: 3,
      location: 'Bantry Bay, Cape Town',
    })
    expect(out[0].imageUrl).toContain('nurtur.tech')
  })
})

describe('Engel & Völkers parser (data-testid cards)', () => {
  it('reads fields preceding the trailing exposes link', () => {
    const uuid = '444e6fbd-25a8-510a-9b0e-df8df689b250'
    const html = `<img data-src="https://uploadcare.engelvoelkers.com/aaaaaaaa-1111-2222-3333-444444444444/">
      <p data-testid="search-components_result-card_location">Kalk Bay, Cape Town, Western Cape, South Africa</p>
      <h2 data-testid="search-components_result-card_headline">Charming Home in Kalk Bay</h2>
      <p data-testid="search-components_result-card_price">ZAR 10,950,000</p>
      <span data-testid="search-components_result-card_attribute_${uuid}-bedrooms">3 Bedrooms</span>
      <span data-testid="search-components_result-card_attribute_${uuid}-bathrooms">2 Bathrooms</span>
      <a href="/za/en/exposes/${uuid}">View</a>`
    const out = adapter('engelvoelkers').parse(html, 'sale')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: `engelvoelkers:${uuid}`,
      priceValue: 10950000,
      bedrooms: 3,
      bathrooms: 2,
      location: 'Kalk Bay, Cape Town',
      title: 'Charming Home in Kalk Bay',
      listingUrl: `https://www.engelvoelkers.com/za/en/exposes/${uuid}`,
    })
    expect(out[0].imageUrl).toContain('uploadcare.engelvoelkers.com')
  })
})

describe('RealNet parser (JSON-LD RealEstateListing, bare price string)', () => {
  it('reads inline offer price and beds from name', () => {
    const html = `<script type="application/ld+json">{"@type":"CollectionPage","mainEntity":{"@type":"ItemList","itemListElement":[
      {"@type":"ListItem","item":{"@type":"RealEstateListing","url":"https://realnet.co.za/listing/residential/for-sale/cape-town/belhar/apartment/RLS760977/","name":"2 Bedroom Apartment for Sale in Belhar","image":"https://cdn.filestackcontent.com/abc","offers":{"@type":"Offer","price":"950000","priceCurrency":"ZAR"}}}
    ]}}</script>`
    const out = adapter('realnet').parse(html, 'sale')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'realnet:RLS760977',
      priceValue: 950000,
      bedrooms: 2,
      location: 'Belhar',
    })
    expect(out[0].imageUrl).toContain('filestackcontent.com')
  })
})

describe('Leapfrog parser (blok-card data-* attributes)', () => {
  it('reads price, stats and address from data attributes', () => {
    const html = `<div class="blok-card" data-listing-id="4349017" data-fusion-ref="LFPE-17390"
      data-url="https://leapfrog.co.za/listing/4349017/philadelphia-cape-town-lfpe-17390"
      data-property-type="House" data-thumbnail="https://d32lv0mvq9geaj.cloudfront.net/listings/4349017/photos/x.webp"
      data-price="R 5,700,000" data-stats="6 Beds | 3 Baths | 7 ha Land" data-address="Philadelphia, Cape Town"></div>`
    const out = adapter('leapfrog').parse(html, 'sale')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'leapfrog:4349017',
      priceValue: 5700000,
      bedrooms: 6,
      bathrooms: 3,
      location: 'Philadelphia, Cape Town',
    })
    expect(out[0].title).toBe('House in Philadelphia, Cape Town')
    expect(out[0].imageUrl).toContain('cloudfront.net')
  })
})
