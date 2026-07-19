import { describe, expect, it } from 'vitest'
import {
  buildPrivatePropertyUrl,
  buildProperty24Url,
  filterAndSortListings,
  interleaveByPortal,
  matchPlaceByName,
  parseMyroofPlaces,
  parsePamGoldingAutocomplete,
  parsePrivatePropertyListings,
  parsePrivatePropertyLocations,
  parsePrivatePropertyShapes,
  parseProperty24Listings,
  parseProperty24LocationCatalog,
  parseRandValue,
  resolvePrivatePropertyLocation,
  resolveProperty24Location,
} from './propertyPortals'
import type { PropertyListing } from '../types'

// A trimmed slice of the real /autocomplete/propertiesgrouped payload.
const P24_CATALOG = {
  c: [
    {
      id: 432,
      name: 'Cape Town',
      parentName: 'Western Cape',
      type: 2,
      normalizedName: 'capetown',
      normalizedParentName: 'western cape',
    },
  ],
  s: [
    {
      id: 11021,
      name: 'Sea Point',
      parentName: 'Cape Town',
      type: 1,
      normalizedName: 'seapoint',
      normalizedParentName: 'cape town',
    },
  ],
  w: [{ id: 9, name: 'Western Cape', type: 5, normalizedName: 'westerncape' }],
}

// A real Property24 result tile, trimmed to the parsed fields.
const P24_TILE = `
<div class="p24_tileContainer js_resultTile" data-listing-number="P117420318">
  <div class="p24_proTile js_rollover_container" title="6 Bedroom House for sale in Stonehurst Mountain Estate" data-listing-number="P117420318">
    <a href="/for-sale/stonehurst-mountain-estate/cape-town/western-cape/12840/117420318?plId=2524339">
      <div class="p24_promoImage"><img alt="6 Bedroom House" itemprop="image" src="https://images.prop24.com/383162418/Crop525x350" /></div>
    </a>
    <div class="p24_content"><div class="p24_information"><div class="p24_price"> R 25 999 000
      <div class="p24_description">6 Bedroom House in <span class="p24_location">Stonehurst Mountain Estate</span></div></div>
      <div class="p24_icons">
        <span class="p24_featureDetails" title="Bedrooms"><svg></svg><span>6</span></span>
        <span class="p24_featureDetails" title="Bathrooms"><svg></svg><span>5.5</span></span>
      </div></div></div>
  </div>
</div>
<div class="p24_tileContainer js_resultTile" data-listing-number="117399738">
  <div class="p24_proTile" title="2 Bedroom Apartment for rent in Sea Point" data-listing-number="117399738">
    <a href="/to-rent/sea-point/cape-town/western-cape/11021/117399738"><img itemprop="image" src="/blank.gif" lazy-src="https://images.prop24.com/382783380/Crop526x328" /></a>
    <div class="p24_price"> R 18 500 <div class="p24_description">2 Bedroom Apartment in <span class="p24_location">Sea Point</span></div></div>
    <span class="p24_featureDetails" title="Bedrooms"><span>2</span></span>
  </div>
</div>
<div class="p24_tileContainer js_resultTile" data-listing-number="99999999">
  <div class="p24_proTile" title="Sponsored"><div class="p24_bannerAd">advert</div></div>
</div>`

// Real Private Property autocomplete rows.
const PP_LOCATIONS = [
  { text: 'Cape Town', descriptorText: 'Western Cape', itemId: 55 },
  { text: 'Cape Town City Bowl', descriptorText: 'Cape Town', itemId: 59 },
]

// A real featured-listing card, trimmed.
const PP_CARD = `
<a title="2 Bedroom House" class="featured-listing" href="/for-sale/western-cape/cape-town/durbanville/graanendal/T5523106">
  <script type="application/ld+json">
  {"@context":"http://schema.org","@type":"Residence","photo":[{"@type":"ImageObject","contentUrl":"https://images.pp.co.za/listing/11899913/abc/600/450/contain/jpegorpng"}],"address":{"@type":"PostalAddress","addressLocality":"Graanendal, Durbanville","addressRegion":"Western Cape"},"additionalProperty":[{"@type":"PropertyValue","name":"Bedrooms","value":"2"},{"@type":"PropertyValue","name":"Bathrooms","value":"2"},{"@type":"PropertyValue","name":"Garages","value":"2"}],"url":"https://www.privateproperty.co.za/for-sale/western-cape/cape-town/durbanville/graanendal/T5523106"}
  </script>
  <div class="featured-listing__price">
            R 5&#160;400&#160;000
  </div>
</a>
<a title="3 Bedroom Apartment" class="featured-listing" href="/for-sale/western-cape/cape-town/T24950000">
  <script type="application/ld+json">
  {"@context":"http://schema.org","@type":"Residence","photo":[{"@type":"ImageObject","contentUrl":"https://images.pp.co.za/listing/222/xyz/600/450/contain/jpegorpng"}],"address":{"@type":"PostalAddress","addressLocality":"Sea Point","addressRegion":"Western Cape"},"additionalProperty":[{"@type":"PropertyValue","name":"Bedrooms","value":"3"}],"url":"https://www.privateproperty.co.za/for-sale/western-cape/cape-town/sea-point/T24950001"}
  </script>
  <div class="featured-listing__price"> R 24&#160;950&#160;000 </div>
</a>`

describe('parseRandValue', () => {
  it('reads spaced and comma amounts', () => {
    expect(parseRandValue('R 25 999 000')).toBe(25999000)
    expect(parseRandValue('R12,500 pm')).toBe(12500)
  })
  it('returns undefined for POA', () => {
    expect(parseRandValue('POA')).toBeUndefined()
    expect(parseRandValue(undefined)).toBeUndefined()
  })
})

describe('Property24 location resolution', () => {
  const catalog = parseProperty24LocationCatalog(P24_CATALOG)

  it('flattens grouped catalogue entries', () => {
    expect(catalog).toHaveLength(3)
  })
  it('prefers the city over a like-named suburb', () => {
    const loc = resolveProperty24Location(catalog, 'Cape Town')
    expect(loc?.id).toBe(432)
    expect(loc?.type).toBe(2)
  })
  it('resolves a suburb by exact name', () => {
    expect(resolveProperty24Location(catalog, 'sea point')?.id).toBe(11021)
  })
  it('returns undefined when nothing matches', () => {
    expect(resolveProperty24Location(catalog, 'zzzznowhere')).toBeUndefined()
  })

  it('builds authoritative id-based urls per location type', () => {
    const city = catalog.find((l) => l.id === 432)!
    const suburb = catalog.find((l) => l.id === 11021)!
    const province = catalog.find((l) => l.id === 9)!
    expect(buildProperty24Url(city, 'sale')).toBe(
      'https://www.property24.com/for-sale/cape-town/western-cape/432',
    )
    expect(buildProperty24Url(suburb, 'rent', 2)).toBe(
      'https://www.property24.com/to-rent/sea-point/cape-town/za/11021/p2',
    )
    expect(buildProperty24Url(province, 'sale')).toBe(
      'https://www.property24.com/for-sale/western-cape/9',
    )
  })
})

describe('parseProperty24Listings', () => {
  const listings = parseProperty24Listings(P24_TILE, 'sale')

  it('parses real tiles and drops the sponsored one', () => {
    expect(listings).toHaveLength(2)
  })
  it('extracts price, beds, baths, location and image', () => {
    const first = listings[0]
    expect(first.id).toBe('property24:117420318')
    expect(first.priceValue).toBe(25999000)
    expect(first.bedrooms).toBe(6)
    expect(first.bathrooms).toBe(5.5)
    expect(first.location).toBe('Stonehurst Mountain Estate')
    expect(first.propertyType).toBe('House')
    expect(first.imageUrl).toBe('https://images.prop24.com/383162418/Crop525x350')
    expect(first.listingUrl).toBe(
      'https://www.property24.com/for-sale/stonehurst-mountain-estate/cape-town/western-cape/12840/117420318',
    )
  })
  it('prefers lazy-src for lazily-loaded images', () => {
    expect(listings[1].imageUrl).toBe('https://images.prop24.com/382783380/Crop526x328')
    expect(listings[1].priceValue).toBe(18500)
  })
})

describe('Private Property', () => {
  it('parses autocomplete locations and resolves exact match', () => {
    const locs = parsePrivatePropertyLocations(PP_LOCATIONS)
    expect(locs).toHaveLength(2)
    expect(resolvePrivatePropertyLocation(locs, 'cape town')?.id).toBe(55)
  })
  it('builds an id-authoritative url', () => {
    const locs = parsePrivatePropertyLocations(PP_LOCATIONS)
    expect(buildPrivatePropertyUrl(locs[0], 'sale')).toBe(
      'https://www.privateproperty.co.za/for-sale/western-cape/cape-town/55',
    )
    expect(buildPrivatePropertyUrl(locs[0], 'rent', 3)).toBe(
      'https://www.privateproperty.co.za/to-rent/western-cape/cape-town/55?page=3',
    )
  })

  it('parses featured-listing cards from JSON-LD and price', () => {
    const listings = parsePrivatePropertyListings(PP_CARD, 'sale')
    expect(listings).toHaveLength(2)
    const first = listings[0]
    expect(first.id).toBe('privateproperty:T5523106')
    expect(first.priceValue).toBe(5400000)
    expect(first.bedrooms).toBe(2)
    expect(first.bathrooms).toBe(2)
    expect(first.garages).toBe(2)
    expect(first.location).toBe('Graanendal, Durbanville')
    expect(first.province).toBe('Western Cape')
    expect(first.propertyType).toBe('House')
    // image upgraded to a larger render
    expect(first.imageUrl).toBe(
      'https://images.pp.co.za/listing/11899913/abc/1200/900/contain/jpegorpng',
    )
  })
})

describe('filterAndSortListings', () => {
  const listings: PropertyListing[] = [
    { id: 'a', portal: 'property24', portalName: 'Property24', title: 'A', priceValue: 3_000_000, bedrooms: 2, listingUrl: 'x', listingType: 'sale' },
    { id: 'b', portal: 'property24', portalName: 'Property24', title: 'B', priceValue: 1_000_000, bedrooms: 4, listingUrl: 'x', listingType: 'sale' },
    { id: 'c', portal: 'privateproperty', portalName: 'Private Property', title: 'C', priceValue: undefined, bedrooms: 3, listingUrl: 'x', listingType: 'sale' },
  ]

  it('applies min beds and price band', () => {
    expect(filterAndSortListings(listings, { minBeds: 3 }).map((l) => l.id)).toEqual(['b', 'c'])
    expect(filterAndSortListings(listings, { maxPrice: 2_000_000 }).map((l) => l.id)).toEqual(['b'])
  })
  it('sorts by price ascending with unpriced last', () => {
    expect(filterAndSortListings(listings, { sort: 'price_low' }).map((l) => l.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })
})

describe('interleaveByPortal', () => {
  it('alternates between source groups', () => {
    const p24 = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as PropertyListing[]
    const pp = [{ id: 'q1' }] as PropertyListing[]
    expect(interleaveByPortal([p24, pp]).map((l) => l.id)).toEqual(['p1', 'q1', 'p2', 'p3'])
  })
})

describe('live location-id resolvers', () => {
  it('parses Pam Golding autocomplete, preferring an exact description match', () => {
    const payload = [
      { id: 999, path: 'cape-town-suburb', description: 'Some Suburb' },
      { id: 3080, path: 'cape-town', description: 'Cape Town' },
    ]
    expect(parsePamGoldingAutocomplete(payload, 'Cape Town')).toEqual({ id: 3080, path: 'cape-town' })
    // no exact match -> first (best-ranked) item
    expect(parsePamGoldingAutocomplete(payload, 'Nowhere')).toEqual({ id: 999, path: 'cape-town-suburb' })
    expect(parsePamGoldingAutocomplete('not-an-array', 'x')).toBeUndefined()
    expect(parsePamGoldingAutocomplete([], 'x')).toBeUndefined()
  })

  it('parses MyRoof homepage place links (name before -in-, id last)', () => {
    const html = `<a href="/property-for-sale/south-africa/property-for-sale-in-Cape-Town-City-26/">Cape Town City</a>
      <a href="/property-for-sale-in-Northern-Suburbs-in-Cape-Town-82/">Northern Suburbs</a>
      <a href="/property-for-sale-in-Cape-Town-City-26/">dup id ignored</a>`
    const places = parseMyroofPlaces(html)
    expect(places).toContainEqual({ name: 'Cape Town City', slug: 'Cape-Town-City', id: 26 })
    expect(places.find((p) => p.id === 82)?.name).toBe('Northern Suburbs')
    expect(places.filter((p) => p.id === 26)).toHaveLength(1) // de-duped
  })

  it('parses Private Property shapes sitemap to city-level {id,name,province}', () => {
    const xml = `<url><loc>https://www.privateproperty.co.za/for-sale/western-cape/cape-town/55</loc></url>
      <url><loc>https://www.privateproperty.co.za/for-sale/gauteng/sandton/34</loc></url>
      <url><loc>https://www.privateproperty.co.za/for-sale/western-cape/cape-town/sea-point/900</loc></url>
      <url><loc>https://www.privateproperty.co.za/to-rent/gauteng/sandton/34</loc></url>`
    const cities = parsePrivatePropertyShapes(xml)
    // Only province/city/id (depth-4) sale entries; suburb (depth-5) & to-rent excluded.
    expect(cities).toEqual([
      { id: 55, name: 'cape town', descriptor: 'western cape' },
      { id: 34, name: 'sandton', descriptor: 'gauteng' },
    ])
  })

  it('matchPlaceByName prefers exact then shortest partial', () => {
    const places = [
      { name: 'Cape Town City Bowl', id: 1 },
      { name: 'Cape Town', id: 2 },
      { name: 'Durban', id: 3 },
    ]
    expect(matchPlaceByName(places, 'cape town')?.id).toBe(2)
    expect(matchPlaceByName(places, 'Durban')?.id).toBe(3)
    expect(matchPlaceByName(places, 'zzz nowhere')).toBeUndefined()
  })
})
