import type { ClothingPlatform } from '../services/clothingCatalogue'
import type { GarmentType } from '../services/clothingTaxonomy'

// Every store here was probed live and answered a public catalogue endpoint.
// Nothing goes on this list hopefully: a shop that 403s or hides behind an
// SPA belongs in the notes at the bottom, not in the sweep.

export interface ClothingRetailer {
  id: string
  name: string
  origin: string
  platform: ClothingPlatform
  /// Which product image to prefer, when a shop leads with a campaign banner
  /// rather than the garment.
  imageIndex?: number
  /// Pages to read per sweep. Big rails deserve more; boutiques do not.
  pages?: number
  /// What a single-category shop sells, for products whose titles are model
  /// names rather than garment words — a Bathu "Journey 2.0" is a shoe even
  /// though nothing in the title says so.
  assumeType?: GarmentType
}

export const CLOTHING_RETAILERS: ClothingRetailer[] = [
  // TFG's VTEX catalogue: one endpoint, and behind it Foschini, Markham,
  // Sportscene, Totalsports, Exact, Refinery and Zando. The biggest garment
  // rail in the country, so it reads the most pages.
  { id: 'bash', name: 'Bash (TFG)', origin: 'https://bash.com', pages: 8, platform: 'vtex' },

  // Shopify — the bulk of South African fashion retail.
  { id: 'ackermans', name: 'Ackermans', origin: 'https://www.ackermans.co.za', pages: 4, platform: 'shopify' },
  { id: 'pep', name: 'PEP', origin: 'https://www.pepstores.com', pages: 4, platform: 'shopify' },
  { id: 'edgars', name: 'Edgars', origin: 'https://www.edgars.co.za', pages: 4, platform: 'shopify' },
  { id: 'legit', name: 'Legit', origin: 'https://www.legit.co.za', pages: 4, platform: 'shopify' },
  { id: 'tekkie-town', name: 'Tekkie Town', origin: 'https://tekkietown.co.za', pages: 3, platform: 'shopify' },
  // Bathu's first image is a lifestyle banner, so take the next one.
  { assumeType: 'footwear', id: 'bathu', name: 'Bathu', imageIndex: 1, origin: 'https://www.bathu.co.za', pages: 3, platform: 'shopify' },
  { id: 'kswiss', name: 'K-Swiss South Africa', origin: 'https://www.kswiss.co.za', platform: 'shopify' },
  { id: 'shoe-box', name: 'Shoe Box', origin: 'https://shoebox.co.za', platform: 'shopify' },
  { id: 'swest-kicks', name: 'Swest Kicks', origin: 'https://swestkicks.co.za', platform: 'shopify' },
  { id: 'the-space', name: 'The Space', origin: 'https://thespace.co.za', platform: 'shopify' },
  { id: 'chepa', name: 'Chepa Streetwear', origin: 'https://www.chepa.co.za', platform: 'shopify' },
  { id: 'butan', name: 'Butan', origin: 'https://butan.co.za', platform: 'shopify' },
  { id: 'tigerlilly', name: 'Tigerlilly', origin: 'https://tigerlilly.co.za', platform: 'shopify' },
  { id: 'kheper', name: 'Kheper Activewear', origin: 'https://kheper.co.za', platform: 'shopify' },
  { id: 'koko-active', name: 'Koko Active', origin: 'https://kokoactive.co.za', platform: 'shopify' },
  { id: 'livv-activewear', name: 'Livv Activewear', origin: 'https://www.livvactivewear.co.za', platform: 'shopify' },
  { id: 'angelwear', name: 'Angelwear', origin: 'https://angelwear.co.za', platform: 'shopify' },
  { id: 'chooseme', name: 'ChooseMe Intimate', origin: 'https://chooseme.co.za', platform: 'shopify' },
  { id: 'the-store-stuff', name: 'The Store Stuff', origin: 'https://www.thestorestuff.co.za', platform: 'shopify' },
  { id: 'boardhub', name: 'Boardhub', origin: 'https://www.boardhub.co.za', platform: 'shopify' },
  { id: 'komsurf', name: 'Komsurf', origin: 'https://komsurf.com', platform: 'shopify' },

  // WooCommerce — prices arrive as minor-unit integers, which the parser
  // divides by the store's own currency_minor_unit.
  { id: 'queenspark', name: 'Queenspark', origin: 'https://www.queenspark.com', pages: 3, platform: 'woocommerce' },
  { id: 'the-sole-provider', name: 'The Sole Provider', origin: 'https://thesoleprovider.co.za', platform: 'woocommerce' },
  { id: 'darkstar-direct', name: 'Darkstar Direct', origin: 'https://darkstardirect.co.za', platform: 'woocommerce' },
  { id: 'johnos-skate', name: 'Johnos Skate Shop', origin: 'https://johnosskateshop.co.za', platform: 'woocommerce' },
]

// Probed and deliberately left out, so nobody re-probes them by accident:
//   Cotton On      — HTTP 410 behind an anti-automation wall.
//   Superbalist    — Nuxt SPA, every /api/* path 404s.
//   Jet            — no storefront API; default page only.
//   Woolworths     — Dynatrace-guarded SPA (its Constructor.io feed is
//                    already read elsewhere in this codebase).
//   Studio 88      — Klevu search, needs a POST and a cluster bootstrap.
//   Mr Price       — GraphQL behind a store header; schema unmapped.
//   Truworths      — Unbxd, only autosuggest confirmed.
