import type { SourceKind } from '../types'

export interface SadcRetailSource {
  kind: SourceKind
  label: string
  retailerName: string
  url: string
}

export interface SadcPropertySource {
  label: string
  rentUrl: string
  saleUrl: string
}

export interface SadcMarketSources {
  countryCode: string
  propertySources: SadcPropertySource[]
  retailSources: SadcRetailSource[]
  retailStatus: 'public-web' | 'social-only'
}

const specials = (
  retailerName: string,
  url: string,
  label = 'Offers and catalogues',
): SadcRetailSource => ({
  kind: 'specials',
  label,
  retailerName,
  url,
})

const store = (
  retailerName: string,
  url: string,
  label = 'Official website',
): SadcRetailSource => ({
  kind: 'store-finder',
  label,
  retailerName,
  url,
})

const property = (
  label: string,
  saleUrl: string,
  rentUrl = saleUrl,
): SadcPropertySource => ({ label, rentUrl, saleUrl })

// Public pages verified in the Codex browser on 23 July 2026. This registry is
// a starting set for discovery. Page parsing stays platform-based so another
// retailer or property site on the same stack works without a chain parser.
export const SADC_MARKET_SOURCES: Readonly<Record<string, SadcMarketSources>> = {
  AO: {
    countryCode: 'AO',
    propertySources: [
      property('Angocasa', 'https://www.angocasa.com/anuncios/'),
      property('CASA SAPO Angola', 'https://casa.sapo.ao/en-gb/district.luanda/'),
    ],
    retailSources: [
      specials('Maxi', 'https://www.maxi.co.ao/promocoes/'),
      store('AngoMart', 'https://noble-group.net/angomart/'),
    ],
    retailStatus: 'public-web',
  },
  BW: {
    countryCode: 'BW',
    propertySources: [
      property('Property24 Botswana', 'https://www.property24.co.bw/houses-for-sale', 'https://www.property24.co.bw/'),
      property('Botswana Property', 'https://botswanaproperty.org/for-sale/', 'https://botswanaproperty.org/all-listings/'),
    ],
    retailSources: [
      specials('Choppies', 'https://choppies.co.bw/specials-promotions/'),
      store('Choppies', 'https://echoppies.com/', 'Online catalogue'),
      store('Sefalana Shopper', 'https://shopsefalana.com/', 'Online catalogue'),
      specials('Shoprite Botswana', 'https://www.shoprite.co.bw/specials.html'),
      store('Pick n Pay Botswana', 'https://pnpbotswana.co.bw/'),
    ],
    retailStatus: 'public-web',
  },
  CD: {
    countryCode: 'CD',
    propertySources: [
      property('ImmoRDC', 'https://immordc.cd/'),
      property('Jiji DR Congo', 'https://jiji.cd/kinshasa/houses-apartments-for-sale', 'https://jiji.cd/kinshasa/'),
    ],
    retailSources: [
      store('Kin Marché', 'https://kinmarche.com/', 'Online catalogue'),
      store('Kin Marché', 'https://kinmarche.com/stores', 'Store directory'),
    ],
    retailStatus: 'public-web',
  },
  KM: {
    countryCode: 'KM',
    propertySources: [
      property(
        'Agentiz Comoros',
        'https://km.agentiz.com/fr/residential-property/listing?deal=1',
        'https://km.agentiz.com/fr/residential-property/listing?deal=2',
      ),
      property('Giimot', 'https://giimot.com/'),
    ],
    // Comores Market publishes current offers on social pages. Those pages are
    // intentionally not scraped or presented as an official commerce feed.
    retailSources: [],
    retailStatus: 'social-only',
  },
  LS: {
    countryCode: 'LS',
    propertySources: [
      property('Property Market Lesotho', 'https://www.propmarket.co.ls/'),
      property('Lesotho Housing', 'https://lesothohousing.org.ls/status/for-sale/'),
    ],
    retailSources: [
      specials('Shoprite Lesotho', 'https://www.shoprite.co.ls/specials.html'),
    ],
    retailStatus: 'public-web',
  },
  MG: {
    countryCode: 'MG',
    propertySources: [
      property('Immo Madagascar', 'https://immo.mg/vente', 'https://immo.mg/'),
      property('IasyImmo', 'https://iasyimmo.com/annonces'),
    ],
    retailSources: [
      store('Leader Price Madagascar', 'https://www.leaderprice.mg/'),
      store('Magasins U Madagascar', 'https://www.super-u.mg/'),
    ],
    retailStatus: 'public-web',
  },
  MU: {
    countryCode: 'MU',
    propertySources: [
      property('PropertyCloud Mauritius', 'https://www.propertycloud.mu/property-for-sale', 'https://www.propertycloud.mu/'),
      property('Property24 Mauritius', 'https://www.property24.co.mu/property-for-sale', 'https://www.property24.co.mu/'),
    ],
    retailSources: [
      specials('Winners', 'https://www.winners.mu/ebrochure', 'Digital brochure'),
      store('Super U Mauritius', 'https://superu.mu/en'),
      specials('Intermart', 'https://intermartmauritius.com/blog/catalogue/'),
    ],
    retailStatus: 'public-web',
  },
  MW: {
    countryCode: 'MW',
    propertySources: [
      property('Pa Den', 'https://padeni.net/listings'),
      property('MyProperty Malawi', 'https://www.myproperty.mw/'),
    ],
    retailSources: [
      store('Sana Cash n Carry', 'https://sanamalawi.com/'),
      specials('Shoprite Malawi', 'https://specials.shoprite.mw/'),
    ],
    retailStatus: 'public-web',
  },
  MZ: {
    countryCode: 'MZ',
    propertySources: [
      property('Casa Mozambique', 'https://casamozambique.co.mz/'),
      property('Hibis Mozambique', 'https://www.hibis.co.mz/'),
    ],
    retailSources: [
      store('VIP SPAR', 'https://vipspar.com/'),
      specials('Shoprite Mozambique', 'https://www.shoprite.co.mz/ofertas.html.html'),
    ],
    retailStatus: 'public-web',
  },
  NA: {
    countryCode: 'NA',
    propertySources: [
      property('Property24 Namibia', 'https://www.property24.co.na/'),
      property('MyProperty Namibia', 'https://www.myproperty.com.na/en-na'),
    ],
    retailSources: [
      specials('Woermann Brock', 'https://www.woermannbrock.com/special-offers'),
      specials('Shoprite Namibia', 'https://www.shoprite.com.na/specials.html'),
    ],
    retailStatus: 'public-web',
  },
  SC: {
    countryCode: 'SC',
    propertySources: [
      property('Premium Realty Seychelles', 'https://www.seychelles-properties.com/properties/for_sale/', 'https://www.seychelles-properties.com/'),
      property('Seychelles Estates', 'https://seychellesestates.com/'),
    ],
    retailSources: [
      specials('Seychelles Trading Company', 'https://www.stcl.sc/product-catalogue/', 'Product catalogue'),
      store('ISPC Seychelles', 'https://ispc.sc/collections/all', 'Online catalogue'),
    ],
    retailStatus: 'public-web',
  },
  SZ: {
    countryCode: 'SZ',
    propertySources: [
      property('Seeff Eswatini', 'https://www.seeff.com/results/branch/28/'),
      property('eProperty Online', 'https://www.epropertyonline.com/sales/'),
    ],
    retailSources: [
      specials('Pick n Pay Eswatini', 'https://picknpayeswatini.com/specials-eswatini/'),
      specials('Shoprite Eswatini', 'https://www.shoprite.co.sz/specials.html'),
    ],
    retailStatus: 'public-web',
  },
  TZ: {
    countryCode: 'TZ',
    propertySources: [
      property('Property Tanzania', 'https://property.tz/'),
      property('Jiji Tanzania', 'https://jiji.co.tz/houses-apartments-for-sale', 'https://jiji.co.tz/'),
    ],
    retailSources: [
      specials('Shoppers Supermarket', 'https://shoppers.co.tz/offers-products'),
      store('Shoppers Supermarket', 'https://www.shoppers.co.tz/'),
    ],
    retailStatus: 'public-web',
  },
  ZM: {
    countryCode: 'ZM',
    propertySources: [
      property('Zambian Estate', 'https://zambian.estate/category/houses-apartments-for-sale', 'https://zambian.estate/'),
      property('Real Estate Zambia', 'https://www.realestatezm.com/'),
    ],
    retailSources: [
      specials('Shoprite Zambia', 'https://www.shoprite.co.zm/specials.html'),
      specials('Pick n Pay Zambia', 'https://www.picknpayzambia.com/specials/'),
    ],
    retailStatus: 'public-web',
  },
  ZW: {
    countryCode: 'ZW',
    propertySources: [
      property('Property Zimbabwe', 'https://www.property.co.zw/houses-for-sale', 'https://www.property.co.zw/'),
      property('Propertybook', 'https://www.propertybook.co.zw/'),
    ],
    retailSources: [
      specials('TM Pick n Pay', 'https://tmpnponline.co.zw/catalog', 'In-store catalogues'),
      store('TM Pick n Pay', 'https://tmpnponline.co.zw/', 'Online catalogue'),
      specials('SPAR Zimbabwe', 'https://www.spar.co.zw/promos'),
    ],
    retailStatus: 'public-web',
  },
}

export function getSadcRetailSources(countryCode: string): SadcRetailSource[] {
  return [...(SADC_MARKET_SOURCES[countryCode.toUpperCase()]?.retailSources ?? [])]
}

export function getSadcPropertySources(
  countryCode: string,
  listingType: 'rent' | 'sale',
): Array<{ label: string; url: string }> {
  return (SADC_MARKET_SOURCES[countryCode.toUpperCase()]?.propertySources ?? []).map((source) => ({
    label: source.label,
    url: listingType === 'rent' ? source.rentUrl : source.saleUrl,
  }))
}
