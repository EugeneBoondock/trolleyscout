// One adapter per South African property portal: a URL builder (how to address
// a location) and a listings parser (how to read the server-rendered results).
// propertyScout fans out across every adapter that can address the location.
//
// Reconnoitred live 2026-07. Most portals take a plain city/province slug; a few
// need a numeric location id carried in the catalogue (Property24, Private
// Property, SA Home Traders reuse the Property24 id; Pam Golding and MyRoof have
// their own harvested ids). All are fetched through the reader proxy.

import type { PropertyListing, PropertyListingType, PropertyPortalId } from '../types'
import {
  PROPERTY_PORTAL_LABELS,
  bedroomsFromTitle,
  buildPrivatePropertyUrl,
  buildProperty24Url,
  collapseSpace,
  parsePrivatePropertyListings,
  parseProperty24Listings,
  parseRandValue,
  slug,
  type PrivatePropertyLocation,
  type Property24Location,
} from './propertyPortals'

// What an adapter needs to address a location. Structurally satisfied by the
// static catalogue entry (SaPropertyLocation).
export interface PortalLocationInput {
  name: string
  province: string
  p24?: { id: number; type: number; name: string; parent: string }
  pp?: { id: number; name: string; descriptor: string }
  pamgolding?: number
  myroof?: { id: number; slug: string }
}

export interface PortalAdapter {
  id: PropertyPortalId
  label: string
  // Returns undefined when this portal can't address the location (e.g. it needs
  // an id the catalogue doesn't have for this place).
  buildUrl(loc: PortalLocationInput, listingType: PropertyListingType, page: number): string | undefined
  parse(html: string, listingType: PropertyListingType): PropertyListing[]
}

// ---------------------------------------------------------------------------
// Small regex helpers
// ---------------------------------------------------------------------------

function cap(re: RegExp, s: string): string | undefined {
  const m = re.exec(s)
  return m ? m[1] : undefined
}

function cleanUrl(href: string): string {
  return href.replace(/&amp;/g, '&').trim()
}

// Splits html into chunks each starting at an occurrence of `marker`.
function chunksBy(html: string, marker: RegExp, maxLen = 6000): string[] {
  const idx: number[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(marker.source, marker.flags.includes('g') ? marker.flags : marker.flags + 'g')
  while ((m = re.exec(html)) !== null) {
    idx.push(m.index)
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return idx.map((start, i) => html.slice(start, i + 1 < idx.length ? idx[i + 1] : Math.min(html.length, start + maxLen)))
}

function suburbFromDescription(desc: string): string | undefined {
  const m = /\bin\s+(.+?)\s*$/i.exec(desc.trim())
  return m ? m[1].trim() : undefined
}

// ---------------------------------------------------------------------------
// Gumtree — inline JSON array (galleryAdList_searchGallery)
// ---------------------------------------------------------------------------

function parseGumtree(html: string, type: PropertyListingType): PropertyListing[] {
  const m = /galleryAdList_searchGallery\s*=\s*(\[[\s\S]*?\]);/.exec(html)
  if (!m) return []
  let arr: unknown
  try {
    arr = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: PropertyListing[] = []
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const it = raw as Record<string, any>
    const chip = it.chiplets ?? {}
    const beds = chip.bedrooms?.bedroomsValue
    const baths = chip.bathrooms?.bathroomsValue
    const price = it.price ?? {}
    if (beds == null && !price.amount) continue // skip non-dwellings
    const seo: string = it.viewSeoUrl ?? ''
    const url = seo ? (seo.startsWith('http') ? seo : `https://www.gumtree.co.za${seo}`) : ''
    if (!url || !it.title) continue
    const pic = Array.isArray(it.pictures) && it.pictures[0]?.url
    out.push({
      id: `gumtree:${it.adId ?? it.id}`,
      portal: 'gumtree',
      portalName: 'Gumtree',
      title: collapseSpace(String(it.title)),
      priceText: price.formattedAmount ? collapseSpace(String(price.formattedAmount)) : undefined,
      priceValue: typeof price.amount === 'number' && price.amount > 0 ? price.amount : undefined,
      location: it.geo?.name ? collapseSpace(String(it.geo.name)) : undefined,
      bedrooms: beds != null ? Number(beds) : undefined,
      bathrooms: baths != null ? Number(baths) : undefined,
      imageUrl: pic ? String(pic).replace(/\?size=[a-z]/, '?size=l') : undefined,
      listingUrl: cleanUrl(url),
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// PropData platform (Harcourts, Chas Everitt) — <a class="property-card-sm">
// ---------------------------------------------------------------------------

function parsePropDataCardSm(
  html: string,
  type: PropertyListingType,
  portal: PropertyPortalId,
  origin: string,
): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /class="[^"]*property-card-sm[^"]*"/)) {
    const href = cap(/href="(\/results\/[^"]+)"/, chunk)
    if (!href) continue
    const id = cap(/data-id="([^"]+)"/, chunk) ?? href
    const key = `${portal}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    const priceRaw = cap(/card-price[^>]*>([^<]+)</, chunk)
    const desc = cap(/card-description[^>]*>([^<]+)</, chunk)
    const title = desc ? collapseSpace(desc) : 'Property'
    const beds = cap(/icon-solid-bed[\s\S]{0,90}?<p>\s*([\d.]+)/, chunk)
    const baths = cap(/icon-solid-bath[\s\S]{0,90}?<p>\s*([\d.]+)/, chunk)
    const img = cap(
      /(https:\/\/[a-z0-9.]*cloudfront\.net\/media\/uploads\/[^"'&\\ ]+\.(?:avif|jpg|jpeg|png|webp))/i,
      chunk,
    )
    out.push({
      id: key,
      portal,
      portalName: PROPERTY_PORTAL_LABELS[portal],
      title,
      priceText: priceRaw ? collapseSpace(priceRaw) : undefined,
      priceValue: parseRandValue(priceRaw),
      location: suburbFromDescription(title),
      bedrooms: beds ? Number(beds) : bedroomsFromTitle(title),
      bathrooms: baths ? Number(baths) : undefined,
      imageUrl: img,
      listingUrl: origin + cleanUrl(href).split('?')[0],
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Seeff — <div class="seeff-listing-card">
// ---------------------------------------------------------------------------

function parseSeeff(html: string, type: PropertyListingType): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /class="seeff-listing-card"/)) {
    const href = cap(/href="(\/results\/[^"]+)"/, chunk)
    if (!href) continue
    const id = cap(/data-id="([^"]+)"/, chunk) ?? href
    const key = `seeff:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    // Price may be nested (card-price"><span>R…</span>), so grab the first
    // R-amount after the marker rather than the immediate text node.
    const priceRaw = cap(/card-price[\s\S]{0,160}?(R[\s\d.,]+|POA)/i, chunk)
    const title = collapseSpace(cap(/card-heading[^>]*>([^<]+)</, chunk) ?? 'Property')
    const address = cap(/card-address[^>]*>\s*([^<]*?)\s*</, chunk)
    const img = cap(/(https:\/\/[a-z0-9.]*cloudfront\.net\/[^"'&\\ ]+\.(?:avif|jpg|jpeg|png|webp))/i, chunk)
    out.push({
      id: key,
      portal: 'seeff',
      portalName: 'Seeff',
      title,
      priceText: priceRaw && /\d/.test(priceRaw) ? collapseSpace(priceRaw) : undefined,
      priceValue: parseRandValue(priceRaw),
      location: address ? collapseSpace(address) : suburbFromDescription(title),
      bedrooms: bedroomsFromTitle(title),
      imageUrl: img,
      listingUrl: 'https://www.seeff.com' + cleanUrl(href).split('?')[0],
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Jawitz — <div class="property-list-listing">
// ---------------------------------------------------------------------------

function parseJawitz(html: string, type: PropertyListingType): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /class="property-list-listing/)) {
    const href = cap(/data-href="([^"]+)"/, chunk) ?? cap(/property-list-marketing-heading"[^>]*href="([^"]+)"/, chunk)
    if (!href) continue
    const id = cap(/data-id="([^"]+)"/, chunk) ?? href
    const key = `jawitz:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    const priceRaw = cap(/property-list-price-heading[^>]*>\s*([^<]+?)\s*</, chunk)
    const title = collapseSpace(cap(/property-list-marketing-heading[^>]*>\s*([^<]+?)\s*</, chunk) ?? 'Property')
    const address = cap(/property-list-address[^>]*>\s*([^<]*?)\s*</, chunk)
    const beds = cap(/(\d+)\s*beds?\b/i, chunk)
    const baths = cap(/(\d+)\s*baths?\b/i, chunk)
    const img = cap(/(https:\/\/[a-z0-9.]*cloudfront\.net\/[^"'&\\ ]+\.(?:avif|jpg|jpeg|png|webp))/i, chunk)
    const absolute = href.startsWith('http') ? href : 'https://www.jawitz.co.za' + href
    out.push({
      id: key,
      portal: 'jawitz',
      portalName: 'Jawitz',
      title,
      priceText: priceRaw && /\d/.test(priceRaw) ? collapseSpace(priceRaw) : undefined,
      priceValue: parseRandValue(priceRaw),
      location: address ? collapseSpace(address) : suburbFromDescription(title),
      bedrooms: beds ? Number(beds) : bedroomsFromTitle(title),
      bathrooms: baths ? Number(baths) : undefined,
      imageUrl: img,
      listingUrl: cleanUrl(absolute).split('?')[0],
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Rawson — <div class="card"> with card__link / card__price / card__title
// ---------------------------------------------------------------------------

function parseRawson(html: string, type: PropertyListingType): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /class="card__link"/)) {
    const href = cap(/href="(https?:\/\/[^"]*rawson\.co\.za\/property\/(?:for-sale|to-rent)\/[a-z0-9-]+\/\d+)"/, chunk)
    if (!href) continue
    const id = cap(/\/(\d+)(?:[/?#]|$)/, href) ?? href
    const key = `rawson:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    const title = collapseSpace(cap(/card__title[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+?)\s*</, chunk) ?? 'Property')
    const priceRaw = cap(/card__price[^>]*>\s*([^<]+?)\s*</, chunk)
    const img = cap(/data-bg="([^"]+)"/, chunk)
    const baths = cap(/(\d+)\s*bath/i, chunk)
    out.push({
      id: key,
      portal: 'rawson',
      portalName: 'Rawson',
      title,
      priceText: priceRaw && /\d/.test(priceRaw) ? collapseSpace(priceRaw) : undefined,
      priceValue: parseRandValue(priceRaw),
      location: suburbFromDescription(title),
      bedrooms: bedroomsFromTitle(title),
      bathrooms: baths ? Number(baths) : undefined,
      imageUrl: img ? cleanUrl(img) : undefined,
      listingUrl: cleanUrl(href),
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// RE/MAX — JSON-LD property + offer nodes joined by @id
// ---------------------------------------------------------------------------

const REMAX_PROP_TYPES = new Set([
  'House', 'Apartment', 'Townhouse', 'SingleFamilyResidence', 'Residence', 'Product', 'Accommodation', 'ApartmentComplex',
])

function parseRemax(html: string, type: PropertyListingType): PropertyListing[] {
  const nodes: Record<string, any>[] = []
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    // Full recursive walk: RE/MAX nests listing nodes under itemListElement/item,
    // not just @graph, so descend into every object value and array element.
    const stack: any[] = [data]
    while (stack.length) {
      const node = stack.pop()
      if (Array.isArray(node)) {
        stack.push(...node)
      } else if (node && typeof node === 'object') {
        nodes.push(node)
        for (const value of Object.values(node)) {
          if (value && typeof value === 'object') stack.push(value)
        }
      }
    }
  }
  const props = new Map<string, any>()
  const offers = new Map<string, any>()
  const images = new Map<string, string>()
  const baseOf = (id: unknown) => (typeof id === 'string' ? id.split('#')[0] : undefined)
  for (const node of nodes) {
    const t = node['@type']
    const id = node['@id']
    if (typeof id !== 'string') continue
    const base = baseOf(id)
    if (!base) continue
    if (id.includes('#offer') || t === 'Offer') offers.set(base, node)
    else if (t === 'ImageObject') {
      const url = node.contentUrl ?? node.url
      if (typeof url === 'string' && !images.has(base)) images.set(base, url)
    } else if ((typeof t === 'string' && REMAX_PROP_TYPES.has(t)) || node.address) {
      if (!props.has(base)) props.set(base, node)
    }
  }
  const out: PropertyListing[] = []
  for (const [base, node] of props) {
    const offer = offers.get(base)
    const priceValue = offer && typeof offer.price === 'number' ? offer.price : parseRandValue(offer?.price)
    const address = node.address ?? {}
    const listingUrl = base.startsWith('http') ? base : `https://www.remax.co.za${base}`
    out.push({
      id: `remax:${cap(/(\d+)(?:\/)?$/, base) ?? base}`,
      portal: 'remax',
      portalName: 'RE/MAX',
      title: collapseSpace(String(node.name ?? 'Property')),
      priceText: priceValue ? `R ${priceValue.toLocaleString('en-ZA')}` : undefined,
      priceValue,
      location: address.addressLocality ? collapseSpace(String(address.addressLocality)) : undefined,
      province: address.addressRegion ? String(address.addressRegion) : undefined,
      bedrooms: bedroomsFromTitle(String(node.name ?? '')),
      imageUrl: images.get(base),
      listingUrl,
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// ImmoAfrica — <div class="card ..."> with data-reference / strong.price
// ---------------------------------------------------------------------------

function parseImmoAfrica(html: string, type: PropertyListingType): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /data-reference="IA\d+"/)) {
    const ref = cap(/data-reference="(IA\d+)"/, chunk)
    if (!ref) continue
    const key = `immoafrica:${ref}`
    if (seen.has(key)) continue
    seen.add(key)
    const href = cap(/href="(\/[a-z-]+\/[^"]*\/IA\d+)"/, chunk)
    const priceRaw = cap(/class="[^"]*price[^"]*"[^>]*>\s*([^<]*R[\d\s,]+[^<]*?)\s*</, chunk) ?? cap(/(R[\s\d,]{4,})/, chunk)
    const title = collapseSpace(cap(/card-title[^>]*>\s*([^<]+?)\s*</, chunk) ?? 'Property')
    const address = cap(/card-text[^>]*>\s*([^<]+?)\s*</, chunk)
    const beds = cap(/(\d+)\s*(?:bd|bed)/i, chunk)
    const baths = cap(/(\d+)\s*(?:ba|bath)/i, chunk)
    const img = cap(/data-src="([^"]+)"/, chunk)
    out.push({
      id: key,
      portal: 'immoafrica',
      portalName: 'ImmoAfrica',
      title,
      priceText: priceRaw && /\d/.test(priceRaw) ? collapseSpace(priceRaw) : undefined,
      priceValue: parseRandValue(priceRaw),
      location: address ? collapseSpace(address) : undefined,
      bedrooms: beds ? Number(beds) : bedroomsFromTitle(title),
      bathrooms: baths ? Number(baths) : undefined,
      imageUrl: img ? cleanUrl(img) : undefined,
      listingUrl: href ? 'https://www.immoafrica.net' + cleanUrl(href) : `https://www.immoafrica.net`,
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// SA Home Traders — Property24 taxonomy + p24_regularTile markup
// ---------------------------------------------------------------------------

function parseSahometraders(html: string, type: PropertyListingType): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /class="p24_regularTile/)) {
    const href = cap(/href="(\/[^"]*-\d+)"/, chunk)
    if (!href) continue
    const id = cap(/-(\d+)(?:[/?#]|$)/, href) ?? href
    const key = `sahometraders:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    const priceContent = cap(/p24_price[^>]*content="(\d+)"/, chunk)
    const priceText = cap(/p24_price[^>]*>\s*([^<]+?)\s*</, chunk)
    const title = collapseSpace(cap(/p24_propertyTitle[^>]*>\s*([^<]+?)\s*</, chunk) ?? 'Property')
    const location = cap(/p24_location[^>]*>\s*([^<]+?)\s*</, chunk)
    const imgId = cap(/images\.prop24\.com\/(\d+)\/Crop/, chunk)
    out.push({
      id: key,
      portal: 'sahometraders',
      portalName: 'SA Home Traders',
      title,
      priceText: priceText && /\d/.test(priceText) ? collapseSpace(priceText) : undefined,
      priceValue: priceContent ? Number(priceContent) : parseRandValue(priceText),
      location: location ? collapseSpace(location) : undefined,
      bedrooms: bedroomsFromTitle(title),
      imageUrl: imgId ? `https://images.prop24.com/${imgId}/Crop600x400` : undefined,
      listingUrl: 'https://www.sahometraders.co.za' + cleanUrl(href),
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Pam Golding — results__item-* cards (needs a Pam Golding numeric location id)
// ---------------------------------------------------------------------------

function parsePamgolding(html: string, type: PropertyListingType): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /results__item-heading-link/)) {
    const href = cap(/href="([^"]*\/property-details\/[^"]+)"/, chunk)
    if (!href) continue
    const title = collapseSpace(cap(/results__item-heading-link[^>]*>\s*([^<]+?)\s*</, chunk) ?? 'Property')
    const key = `pamgolding:${cap(/\/([a-z0-9]+)\/?(?:[?#]|$)/i, href) ?? href}`
    if (seen.has(key)) continue
    seen.add(key)
    const priceRaw = cap(/results__item-price[\s\S]{0,220}?(R[\s\d.,]+|POA|On Application)/i, chunk)
    const beds = cap(/(\d+)\s*Bed/i, chunk)
    const baths = cap(/(\d+)\s*Bath/i, chunk)
    const img = cap(/(https:\/\/resources\.pamgolding\.co\.za\/[^"'&\\ ]+\.(?:jpg|jpeg|png|webp|avif))/i, chunk)
    out.push({
      id: key,
      portal: 'pamgolding',
      portalName: 'Pam Golding',
      title,
      priceText: priceRaw && /\d/.test(priceRaw) ? collapseSpace(priceRaw) : undefined,
      priceValue: parseRandValue(priceRaw),
      location: suburbFromDescription(title),
      bedrooms: beds ? Number(beds) : bedroomsFromTitle(title),
      bathrooms: baths ? Number(baths) : undefined,
      imageUrl: img,
      listingUrl: href.startsWith('http') ? cleanUrl(href) : 'https://www.pamgolding.co.za' + cleanUrl(href),
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// MyRoof — prop_content prop_data_row cards (needs a MyRoof place slug + id)
// ---------------------------------------------------------------------------

function parseMyroof(html: string, type: PropertyListingType): PropertyListing[] {
  const out: PropertyListing[] = []
  const seen = new Set<string>()
  for (const chunk of chunksBy(html, /prop_content prop_data_row/)) {
    const href = cap(/href="(\/MR\d+-[^"]+)"/, chunk)
    if (!href) continue
    const mr = cap(/\/MR(\d+)-/, href)
    const key = `myroof:MR${mr ?? href}`
    if (seen.has(key)) continue
    seen.add(key)
    const fullTitle = cap(/prop_title[^>]*title="([^"]+)"/, chunk) ?? cap(/photo_link[^>]*title="([^"]+)"/, chunk)
    const suburb = collapseSpace(cap(/prop_title[^>]*>\s*([^<]+?)\s*</, chunk) ?? '')
    const money = cap(/money_value">\s*([\d.,]+)/, chunk)
    const beds = cap(/prop_icon_bed[\s\S]{0,100}?key_value">\s*(\d+)/, chunk)
    const baths = cap(/prop_icon_bath[\s\S]{0,100}?key_value">\s*(\d+)/, chunk)
    const img = cap(/data-original="(https:\/\/[^"']*myroof\.co\.za\/prop_static\/[^"]+\.jpg)"/, chunk)
    const title = fullTitle ? collapseSpace(fullTitle) : suburb || 'Property'
    out.push({
      id: key,
      portal: 'myroof',
      portalName: 'MyRoof',
      title,
      priceText: money ? `R ${money}` : undefined,
      priceValue: money ? parseRandValue(`R${money}`) : undefined,
      location: suburb || suburbFromDescription(title),
      bedrooms: beds ? Number(beds) : bedroomsFromTitle(title),
      bathrooms: baths ? Number(baths) : undefined,
      imageUrl: img ? cleanUrl(img) : undefined,
      listingUrl: 'https://www.myroof.co.za' + cleanUrl(href),
      listingType: type,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Adapters registry
// ---------------------------------------------------------------------------

function toP24(loc: PortalLocationInput): Property24Location | undefined {
  if (!loc.p24) return undefined
  return {
    id: loc.p24.id,
    name: loc.p24.name,
    parentName: loc.p24.parent,
    type: loc.p24.type,
    normalizedName: '',
    normalizedParentName: '',
  }
}

function toPP(loc: PortalLocationInput): PrivatePropertyLocation | undefined {
  return loc.pp ? { id: loc.pp.id, name: loc.pp.name, descriptor: loc.pp.descriptor } : undefined
}

const RESULTS_PREFIX: Record<PropertyListingType, string> = { sale: 'for-sale', rent: 'to-rent' }
// Some PropData sites use "to-let" for rentals.
const RESULTS_PREFIX_LET: Record<PropertyListingType, string> = { sale: 'for-sale', rent: 'to-let' }

export const PORTAL_ADAPTERS: PortalAdapter[] = [
  {
    id: 'property24',
    label: 'Property24',
    buildUrl: (l, t, p) => {
      const loc = toP24(l)
      return loc ? buildProperty24Url(loc, t, p) : undefined
    },
    parse: parseProperty24Listings,
  },
  {
    id: 'privateproperty',
    label: 'Private Property',
    buildUrl: (l, t, p) => {
      const loc = toPP(l)
      return loc ? buildPrivatePropertyUrl(loc, t, p) : undefined
    },
    parse: parsePrivatePropertyListings,
  },
  {
    id: 'gumtree',
    label: 'Gumtree',
    buildUrl: (l, t, p) =>
      `https://www.gumtree.co.za/s-houses-flats-${t === 'sale' ? 'for-sale' : 'for-rent'}/${slug(l.name)}/v1c${t === 'sale' ? 9074 : 9078}p${p}`,
    parse: parseGumtree,
  },
  {
    id: 'seeff',
    label: 'Seeff',
    buildUrl: (l, t, p) =>
      `https://www.seeff.com/results/residential/${RESULTS_PREFIX_LET[t]}/${slug(l.name)}/${p > 1 ? `?page=${p}` : ''}`,
    parse: parseSeeff,
  },
  {
    id: 'harcourts',
    label: 'Harcourts',
    buildUrl: (l, t, p) =>
      `https://www.harcourts.co.za/results/residential/${RESULTS_PREFIX[t]}/${slug(l.name)}/${p > 1 ? `?page=${p}` : ''}`,
    parse: (h, t) => parsePropDataCardSm(h, t, 'harcourts', 'https://www.harcourts.co.za'),
  },
  {
    id: 'chaseveritt',
    label: 'Chas Everitt',
    buildUrl: (l, t, p) =>
      `https://www.chaseveritt.co.za/results/residential/${RESULTS_PREFIX_LET[t]}/${slug(l.name)}/${p > 1 ? `?page=${p}` : ''}`,
    parse: (h, t) => parsePropDataCardSm(h, t, 'chaseveritt', 'https://www.chaseveritt.co.za'),
  },
  {
    id: 'jawitz',
    label: 'Jawitz',
    buildUrl: (l, t, p) =>
      `https://www.jawitz.co.za/results/residential/${RESULTS_PREFIX_LET[t]}/${slug(l.name)}/${p > 1 ? `?page=${p}` : ''}`,
    parse: parseJawitz,
  },
  {
    id: 'rawson',
    label: 'Rawson',
    buildUrl: (l, t, p) =>
      `https://www.rawson.co.za/property/${RESULTS_PREFIX[t]}/${slug(l.name)}${p > 1 ? `?page=${p}` : ''}`,
    parse: parseRawson,
  },
  {
    id: 'remax',
    label: 'RE/MAX',
    buildUrl: (l, t) =>
      `https://www.remax.co.za/property-${RESULTS_PREFIX[t]}-south-africa/${slug(l.province)}/${slug(l.name)}`,
    parse: parseRemax,
  },
  {
    id: 'immoafrica',
    label: 'ImmoAfrica',
    buildUrl: (l, t) =>
      `https://www.immoafrica.net/property-${RESULTS_PREFIX[t]}/${slug(l.name)}/${slug(l.province)}/south-africa`,
    parse: parseImmoAfrica,
  },
  {
    id: 'sahometraders',
    label: 'SA Home Traders',
    buildUrl: (l, t, p) => {
      if (!l.p24) return undefined
      const base = `https://www.sahometraders.co.za/property-${RESULTS_PREFIX[t]}-in-${slug(l.name)}-c${l.p24.id}`
      return p > 1 ? `${base}/p${p}` : base
    },
    parse: parseSahometraders,
  },
  {
    id: 'pamgolding',
    label: 'Pam Golding',
    buildUrl: (l, t, p) =>
      l.pamgolding
        ? `https://www.pamgolding.co.za/property-search/property-${RESULTS_PREFIX[t]}-${slug(l.name)}/${l.pamgolding}${p > 1 ? `/${p}` : ''}`
        : undefined,
    parse: parsePamgolding,
  },
  {
    id: 'myroof',
    label: 'MyRoof',
    buildUrl: (l, t) =>
      l.myroof
        ? `https://www.myroof.co.za/property-${RESULTS_PREFIX[t]}/south-africa/property-${RESULTS_PREFIX[t]}-in-${l.myroof.slug}-${l.myroof.id}/?search_view=List`
        : undefined,
    parse: parseMyroof,
  },
]
