import type { SourceKind } from '../types'
import { getZimbabweAutomatedRetailSources } from './zimbabweSourceRegistry'

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
    // Verified reachable and platform-probed in July 2026 (WooCommerce /
    // Shopify / Magento storefronts the deal detector can read, plus notable
    // catalogue storefronts). TM Pick n Pay serves live specials from its
    // custom commerce API (read by the store scout on host match); the rest
    // are read by the platform detector when scouted. Choppies exited Zimbabwe
    // (rebranded Sai Mart), so it is not listed here.
    retailSources: [
      // National chains and grocers (TM serves live specials via its custom API).
      specials('TM Pick n Pay', 'https://tmpnponline.co.zw/', 'Online specials'),
      specials('TM Pick n Pay', 'https://tmpnponline.co.zw/catalog', 'Current multi-page catalogues'),
      store('TM Pick n Pay', 'https://tmpnponline.co.zw/', 'Online store'),
      specials('SPAR Zimbabwe', 'https://www.spar.co.zw/promos'),
      store('SPAR Zimbabwe', 'https://online-spar.co.zw/', 'Online store'),
      store('Sai Mart', 'https://saimartzim.co.zw/', 'Online store'),
      specials('TV Sales & Home', 'https://www.tvsales.co.zw/promotions/', 'Current promotions'),
      specials('TV Sales & Home', 'https://www.tvsales.co.zw/', 'On-sale products'),
      specials('Union Hardware', 'https://unionhardware.co.zw/msasa/catalogues/', 'Product catalogues and current sale'),
      specials('N. Richards Group', 'https://nrichards.co.zw/', 'On-sale products'),
      store('Halsteds', 'https://www.halsteds.co.zw/', 'Online store'),
      store('Food Basket', 'https://www.foodbasket.co.zw/', 'Online store'),
      store('Freshco Market', 'https://freshcomarket.co.zw/', 'Online store'),
      // Additional Gemini-list storefronts verified reachable.
      specials('Voltman Hardware', 'https://www.voltmanhardware.co.zw/', 'On-sale products'),
      store('Electrosales Hardware', 'https://www.electrosales.co.zw/', 'Online store'),
      store('Mega Save Wholesalers', 'https://www.megasave.co.zw/', 'Online store'),
      store('TillPoint', 'https://tillpoint.co.zw/', 'Online grocery delivery'),
      store('ShopAtZim', 'https://shopatzim.co.zw/', 'Online store'),
      store('Zimall', 'https://www.zimall.co.zw/', 'Online marketplace'),
      store('Edgars Zimbabwe', 'https://www.edgarsstores.co.zw/', 'Fashion store'),
      specials('Edgars Zimbabwe', 'https://edgarsstores.co.zw/', 'Current multi-page catalogue'),
      store('Hitech Electronics', 'https://www.hitechelectronics.co.zw/', 'Online store'),
      store('National Seeds FarmShop', 'https://natseeds.co.zw/farmshop/', 'Farm supplies catalogue'),
      store('Malaicha', 'https://malaicha.com/', 'Diaspora groceries'),
      store('Carson Stores', 'https://carsonstores.co.zw/', 'Wholesale store'),
      store('Platinum Pharmacy', 'https://platinumpharmacy.co.zw/', 'Online pharmacy'),
      specials('Jet Stores', 'https://jetstores.shop/', 'Current campaigns and on-sale products'),
      specials('OK Zimbabwe', 'https://promo.co.zw/', 'Current rewards promotions'),
      store('OK Mart', 'https://promo.co.zw/', 'Current rewards promotions'),
      store('Bon Marché Zimbabwe', 'https://promo.co.zw/', 'Current rewards promotions'),
      // Groceries, food & butchers
      specials('4 Harvests', 'https://4harvests.co.zw/', 'On-sale products'),
      specials('Budget Meat Shop', 'https://budgetmeatshop.co.zw/', 'On-sale products'),
      specials('Food World', 'https://www.foodworld.co.zw/', 'On-sale products'),
      specials('Gateway Stream Shop', 'https://shop.gatewaystream.com/', 'On-sale products'),
      specials('GetMore', 'https://getmore.co.zw/', 'On-sale products'),
      specials('Greens Supermarket', 'https://greensonline.co.zw/', 'On-sale products'),
      specials('Shop2Door', 'https://shop2door.co.zw/', 'On-sale products'),
      specials('Solide Online', 'https://solide.store/', 'On-sale products'),
      specials('Tengai Online', 'https://tengaionline.com/', 'On-sale products'),
      specials('Vegetable Basket', 'https://www.vegetablebasket.co.zw/', 'On-sale products'),
      specials('Z-Store', 'https://zstore.co.zw/', 'On-sale products'),
      specials('ZimBasket', 'https://www.zimbasket.co.zw/', 'On-sale products'),
      specials('Fresh Select Market', 'https://freshselect.co.zw/', 'Online groceries'),
      specials('ZIM Essentials', 'https://zim-essentials.com/', 'Online groceries'),
      specials('Pantry Master Zimbabwe', 'https://pantrymasterzim.shop/', 'Online groceries'),
      specials('First Source Distributors', 'https://www.firstsourcedistributors.co.zw/', 'Products and promotions'),
      // General retail & marketplaces
      specials('Ownai Marketplace', 'https://ownai.co.zw/marketplace/', 'On-sale products'),
      specials('Zambezi Cart', 'https://zambezicart.com/', 'On-sale products'),
      specials('ZikiMall', 'https://shop.zikimall.com/', 'On-sale products'),
      specials('ZimbabweMall/Post', 'https://zimbabwemall.post/', 'On-sale products'),
      specials('Avenues Virtual Mall', 'https://avenuesmall.co.zw/', 'Store promotions and vouchers'),
      specials('Raely', 'https://www.raely.co.zw/', 'On-sale products'),
      specials('Zimexapp', 'https://zimexapp.co.zw/', 'Latest marketplace deals'),
      specials('Zim Shops', 'https://www.zim-shops.com/', 'Online marketplace'),
      specials('Snap Sale', 'https://www.snapsale.co.zw/', 'Online marketplace'),
      specials('MADEALS', 'https://www.madealsapp.com/', 'Live marketplace listings'),
      specials('OneStop', 'https://onestopstore.co.zw/', 'Online store'),
      // Furniture, home & appliances
      specials('Beta Home Appliance', 'https://betahomeappliance.co.zw/', 'On-sale products'),
      specials('Checkers Office & Home', 'https://checkers.co.zw/shop/', 'On-sale products'),
      specials('Fazak Home & Hyper', 'https://fazak.co.zw/product-category/furniture_and_appliances/', 'On-sale products'),
      specials('Happy Home Zimbabwe', 'https://happyhomezimbabwe.com/', 'On-sale products'),
      specials('Nash Furnishers', 'https://nashfurnishers.co.zw/', 'On-sale products'),
      // Electronics, computers & phones
      specials('Econet Devices', 'https://www.econet.co.zw/devices/', 'On-sale products'),
      specials('FI Laptops', 'https://www.filaptops.co.zw/', 'On-sale products'),
      specials('Fozzby Investments', 'https://fozzby.co.zw/', 'On-sale products'),
      specials('Gadgetszone Zimbabwe', 'https://gadgetszone.co.zw/', 'On-sale products'),
      specials('Goldtech Electronics', 'https://goldtechelectronics.co.zw/', 'On-sale products'),
      specials('Innovative Technologies', 'https://innovative.co.zw/', 'On-sale products'),
      specials('Magnet E-Store', 'https://magnet.co.zw/', 'On-sale products'),
      specials('Micro Man', 'https://microman.co.zw/', 'On-sale products'),
      specials('Zelpac', 'https://zelpac.co.zw/', 'On-sale products'),
      specials('Econet Online Store', 'https://onlineshop.econet.co.zw/', 'Devices and promotions'),
      specials('Tatima Tech Store', 'https://tatimatechstore.co.zw/', 'Flash sales and devices'),
      specials('Metric Electronics', 'https://craftmetric.co.zw/', 'On-sale products'),
      specials('TruTech', 'https://www.trutech.co.zw/', 'On-sale products'),
      // Hardware, building, pools & solar
      specials('Ace Hardware Zimbabwe', 'https://acehardware.co.zw/', 'On-sale products'),
      specials('CTM Zimbabwe', 'https://www.ctm.co.zw/', 'On-sale products'),
      specials('Eezi Pool', 'https://eezipool.com/shop/', 'On-sale products'),
      specials('Infinity Solar', 'https://www.infinitysolar.co.zw/', 'On-sale products'),
      specials('Palmer Construction Shop', 'https://palmer.co.zw/shop/', 'On-sale products'),
      specials('Shinko Afrika', 'https://shinkoafrika.co.zw/', 'On-sale products'),
      specials('Solar Flair', 'https://solarflair.co.zw/', 'On-sale products'),
      specials('Solar Power Shop', 'https://solarpowershop.co.zw/', 'On-sale products'),
      specials('Solar Shack', 'https://solarshack.co.zw/shop/', 'On-sale products'),
      specials('Solar Zone', 'https://solar-zone.co.zw/', 'On-sale products'),
      specials('Sungrow Zimbabwe', 'https://sungrow.co.zw/shop-2/', 'On-sale products'),
      specials('The Poolman', 'https://thepoolman.co.zw/shop/', 'On-sale products'),
      specials('World of Sun & Wind Power', 'https://worldofsunandwindpower.co.zw/', 'On-sale products'),
      specials('Zimbabwe Building Materials Suppliers (ZBMS)', 'https://www.zbms.co.zw/shop/', 'On-sale products'),
      specials('Tech Africa', 'https://techafrica.co.zw/', 'Products and multi-page catalogues'),
      specials('Sona Solar Zimbabwe', 'https://www.sonasolar.co.zw/p/promotions.html', 'Current promotions'),
      // Pharmacy, health & medical supplies
      specials('Bestzone Pharmacies', 'https://bestzonepharmacies.co.zw/', 'On-sale products'),
      specials('Bumblebee Pharmacy', 'https://bumblebeepharmacy.co.zw/shop-2/', 'On-sale products'),
      specials('CAPS Pharmaceuticals', 'https://caps.co.zw/products/', 'On-sale products'),
      specials('Chemayde Pharmacy', 'https://chemaydepharmacy.com/', 'On-sale products'),
      specials('CJV Medical Supplies', 'https://cjvmedics.co.zw/', 'On-sale products'),
      specials('Emergency Pharmacy', 'https://emergencypharmacy.co.zw/', 'On-sale products'),
      specials('Lady Becky Medical', 'https://ladybecky.co.zw/', 'On-sale products'),
      specials('Pentafam', 'https://pentafam.co.zw/', 'On-sale products'),
      specials('HealthLink Pharmacy', 'https://www.healthlink.co.zw/', 'Online pharmacy'),
      specials('MedOrange Pharmacies', 'https://www.medorange.com/', 'Online pharmacy'),
      store('Dial a Med', 'https://dialamed.co.zw/', 'Pharmacy marketplace'),
      // Books, stationery, office & school
      specials('Denmut Bookstore', 'https://denmutbookstore.co.zw/', 'On-sale products'),
      specials('Macedonia Projects', 'https://macedoniaprojects.co.zw/shop/', 'On-sale products'),
      specials('Mutare Computers / Liteflush', 'https://liteflush.co.zw/', 'On-sale products'),
      specials('Peupum Stationers', 'https://peupum.co.zw/', 'On-sale products'),
      // Fashion, beauty, jewellery & sport
      specials('Claytess Jewellers', 'https://claytessjewellers.co.zw/', 'On-sale products'),
      specials('Eileen M Jewellery', 'https://eileenmjewellery.com/', 'On-sale products'),
      specials('Pfeka', 'https://pfeka.com/collections/sports-apparel/', 'On-sale products'),
      specials('The Zuri Collection', 'https://thezuricollection.com/', 'On-sale products'),
      specials('ZIFA Shop', 'https://shop.zifa.co.zw/shop/', 'On-sale products'),
      // Agriculture, feed & farm equipment
      specials('AFB', 'https://afb.co.zw/shop/', 'On-sale products'),
      specials('Seed Co Zimbabwe Online Shop', 'https://www.seedcoonlineshop.com/zw/', 'On-sale products'),
      // Automotive parts & spares
      specials('3way Auto Parts', 'https://www.3way.co.zw/', 'On-sale products'),
      specials('Kopje Spares', 'https://kopjespares.co.zw/', 'On-sale products'),
      specials('Zim Midas', 'https://www.zimmidas.co.zw/', 'On-sale products'),
      specials('Rossi Tyres', 'https://rossityres.co.zw/shop/', 'Weekly promotions'),
      specials('Autoworld Zimbabwe', 'https://www.autoworld.co.zw/promotions/', 'Vehicle promotions'),
      // Pet supplies
      specials('Dog Lovers Zimbabwe', 'https://doglovers.co.zw/', 'On-sale products'),
      // Broad Zimbabwe directory import. Direct public retailer and marketplace
      // sources join the automated queue here. Social-only, directory-only and
      // verify-first records remain available in zimbabweSourceRegistry.ts
      // without being fetched as storefronts.
      ...getZimbabweAutomatedRetailSources(),
    ],
    retailStatus: 'public-web',
  },
}

export function getSadcCountryCodes(): string[] {
  return Object.keys(SADC_MARKET_SOURCES)
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
