// Property portals outside southern Africa whose search pages the scout can
// actually read.
//
// The SADC registry stays where it is; this one is country-keyed the same way
// the online storefront registry is, so a new country is a list of portals
// rather than new parsing code. Every entry below was fetched in July 2026 and
// parsed by the one generic property parser: no portal has, or needs, its own
// adapter.
//
// A URL may carry a placeholder. `{location}` becomes the searched place as a
// slug ("amsterdam"), and `{Location}` becomes it capitalised ("Amsterdam"),
// for portals whose search path is nothing but the place. Portals that key
// their search on a state code or an internal city id keep the URL that was
// verified; the searched city still reaches those portals through the scout's
// web-search pass.
//
// Deliberately absent, because they answer a fetch with a challenge instead of
// listings, and a source that can never return a home is worse than no source:
//   Zillow, Trulia, HotPads and Movoto  - PerimeterX captcha (HTTP 403)
//   Realtor.com                         - Akamai edge block (HTTP 403)
//   Homes.com, Apartments.com, LoopNet  - CoStar "Access Denied" (HTTP 403)
//   Rent.com and Compass                - AWS WAF token page served as HTTP 202
//   Funda                               - answered a plain fetch from a home
//                                         connection but blocks datacentre
//                                         egress, which is what the worker has
//
// Funda's card shape is still handled by the parser, so if its stance ever
// changes the only work is adding the entry.

export interface PropertySource {
  label: string
  rentUrl?: string
  saleUrl?: string
}

const property = (
  label: string,
  urls: { rentUrl?: string; saleUrl?: string },
): PropertySource => ({ label, ...urls })

export const PROPERTY_SOURCES: Readonly<Record<string, readonly PropertySource[]>> = {
  // Argentina. Zonaprop and Properati both refuse us outright (403 and 401),
  // and RE/MAX Argentina renders its results in the browser, so Argenprop is
  // what is left that answers with listings in the page.
  //
  // It is registered honestly rather than optimistically: its Buenos Aires
  // sale pages read cleanly — eighteen homes, every one priced — while other
  // cities and its rental pages give up far less, because the card markup
  // changes between them and rentals are quoted in pesos rather than dollars.
  // The web-search pass that runs for every country covers what this misses.
  AR: [
    property('Argenprop', {
      rentUrl: 'https://www.argenprop.com/departamentos/alquiler/{location}',
      saleUrl: 'https://www.argenprop.com/casas/venta/{location}',
    }),
  ],
  // Paraguay. InfoCasas answers directly and reads cleanly on both sides,
  // which is the whole of what is reachable there today: Clasipar does not
  // resolve at all.
  PY: [
    property('InfoCasas', {
      rentUrl: 'https://www.infocasas.com.py/alquiler/casas/{location}',
      saleUrl: 'https://www.infocasas.com.py/venta/casas/{location}',
    }),
  ],
  NL: [
    // Structured listings with a real euro price per card.
    property('Rentola', { rentUrl: 'https://rentola.nl/huren/{location}' }),
    // Reached through the reader, which is what gets past their Cloudflare
    // challenge. Prices, addresses and photos all survive the trip.
    property('Pararius', {
      rentUrl: 'https://www.pararius.nl/huurwoningen/{location}',
      saleUrl: 'https://www.pararius.nl/koopwoningen/{location}',
    }),
    property('Huurwoningen.nl', { rentUrl: 'https://www.huurwoningen.nl/in/{location}/' }),
    property('Huurstunt', { rentUrl: 'https://www.huurstunt.nl/huren/{location}/' }),
    // Vastgoed Nederland is where VBO's own search redirects. Its sale pages
    // return the search form with no results, so only rent is registered.
    property('VBO Vastgoed Nederland', {
      rentUrl: 'https://aanbod.vastgoednederland.nl/huurwoningen/{location}',
    }),
    property('Kamernet', { rentUrl: 'https://kamernet.nl/en/for-rent/properties-{location}' }),
    property('HousingAnywhere', {
      rentUrl: 'https://housinganywhere.com/s/{Location}--Netherlands',
    }),
    // A national portfolio rather than a city search: addresses and photos
    // read cleanly, the price sits outside the card link so it is left off.
    property('Pandomo', {
      rentUrl: 'https://www.pandomo.nl/woningaanbod/',
      saleUrl: 'https://www.pandomo.nl/woningaanbod/',
    }),
  ],
  US: [
    // Redfin carries the richest US payload: address, beds, floor size and a
    // real dollar price per card. Its search path needs Redfin's own city id,
    // so the entry stays on the verified page.
    property('Redfin', {
      rentUrl: 'https://www.redfin.com/city/30818/TX/Austin/apartments-for-rent',
      saleUrl: 'https://www.redfin.com/city/30818/TX/Austin',
    }),
    // Craigslist is the one US portal whose search path is just the metro, so
    // it follows the searched city.
    property('Craigslist', {
      rentUrl: 'https://www.craigslist.org/search/area/{location}?cat=apa',
      saleUrl: 'https://www.craigslist.org/search/area/{location}?cat=rea',
    }),
    // Price and address live under offers.itemOffered.
    property('RE/MAX', { saleUrl: 'https://www.remax.com/homes-for-sale/tx/austin' }),
    // Zumper and ApartmentGuide render the rent client-side, so their listings
    // arrive named and located but without a price. Neither is given one.
    property('Zumper', { rentUrl: 'https://www.zumper.com/apartments-for-rent/austin-tx' }),
    property('ApartmentGuide', {
      rentUrl: 'https://www.apartmentguide.com/apartments/Texas/Austin/',
    }),
  ],
}

export function getPropertySourceCountryCodes(): string[] {
  return Object.keys(PROPERTY_SOURCES)
}

export function getPropertySources(
  countryCode: string,
  listingType: 'rent' | 'sale',
): Array<{ label: string; url: string }> {
  return (PROPERTY_SOURCES[countryCode.toUpperCase()] ?? [])
    .map((source) => ({
      label: source.label,
      url: (listingType === 'rent' ? source.rentUrl : source.saleUrl) ?? '',
    }))
    .filter((source) => source.url.length > 0)
}
