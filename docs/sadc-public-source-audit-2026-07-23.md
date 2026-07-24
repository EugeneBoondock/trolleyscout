# SADC public source audit

Checked in the Codex browser on 23 July 2026. South Africa is outside this audit.

The scout uses public pages only. It does not copy authenticated feeds, bypass access controls, or scrape social-network timelines. Retail pages are handled by reusable detectors for PDF and image leaflets, visible product cards, JSON-LD, embedded app state, Shopify, WooCommerce, Magento, Algolia, Constructor, and Klevu. Property pages are handled through JSON-LD, Next/Nuxt state, and visible listing cards.

| Country | Retail sources checked | Store and deal format | Property sources checked | Property format |
| --- | --- | --- | --- | --- |
| Angola | Maxi, AngoMart | WordPress promotion page and direct PDF leaflet | Angocasa, CASA SAPO Angola | Server-rendered listing cards with price, location, and detail links |
| Botswana | Choppies, Sefalana, Shoprite, Pick n Pay | Promotion landing pages, nested offer pages, and online catalogues | Property24 Botswana, Botswana Property | Server-rendered listing cards |
| Comoros | Comores Market | Current offers are social-only, so store discovery remains available but no social deal feed is copied | Agentiz Comoros, Giimot | Server-rendered cards; Agentiz also advertises XML/API imports |
| DR Congo | Kin Marché | Public product catalogue and store directory | ImmoRDC, Jiji DR Congo | Portal pages and public listing cards |
| Eswatini | Pick n Pay Eswatini, Shoprite Eswatini | Public specials pages | Seeff Eswatini, eProperty Online | Public result pages |
| Lesotho | Shoprite Lesotho | Public specials page | Property Market Lesotho, Lesotho Housing | Public result pages |
| Madagascar | Leader Price, Magasins U | Retailer pages with public catalogue content | Immo Madagascar, IasyImmo | Public listing pages |
| Malawi | Sana Cash n Carry, Shoprite Malawi | Retailer site and Shoprite leaflet pages | Pa Den, MyProperty Malawi | Public listing pages |
| Mauritius | Winners, Super U, Intermart | Digital brochure, catalogue page, and retailer catalogue | PropertyCloud Mauritius, Property24 Mauritius | Public listing cards |
| Mozambique | VIP SPAR, Shoprite Mozambique | Retailer page and public offers page | Casa Mozambique, Hibis Mozambique | Public listing pages |
| Namibia | Woermann Brock, Shoprite Namibia | Public special-offer and catalogue pages | Property24 Namibia, MyProperty Namibia | Public listing cards |
| Seychelles | Seychelles Trading Company, ISPC | Product catalogue and Shopify catalogue | Premium Realty Seychelles, Seychelles Estates | Public listing pages |
| Tanzania | Shoppers Supermarket | Public offer-products page | Property Tanzania, Jiji Tanzania | Public listing pages |
| Zambia | Shoprite Zambia, Pick n Pay Zambia | Public specials pages | Zambian Estate, Real Estate Zambia | Public listing pages |
| Zimbabwe | TM Pick n Pay, SPAR Zimbabwe | Online catalogue and public promotion page | Property Zimbabwe, Propertybook | Public listing cards |

## Runtime rules

1. The country source registry supplies a verified first set, then live search and stored store websites add newly discovered sources.
2. A matched retailer source carries country-directory provenance, so a central chain offers page can be accepted without pretending it is a branch page.
3. The store scout checks the exact discovered page first, then common multilingual promotion paths.
4. A promotion landing page may lead to two same-site offer detail pages. The scout follows those links within a strict request budget.
5. Prices are emitted only when explicit promotion evidence exists, such as a reduced prior price, a promotion identifier, or dated offer data.
6. Property cards are parsed from structured page data or bounded visible HTML. Unsafe and private-network URLs are rejected.
7. Empty or failed registered sources are not cached as successful results.

## Zimbabwe deep expansion (24 July 2026)

Zimbabwe's registry was probed against the platform detectors (161 candidate
sites from two research lists) and grown from 3 to ~90 verified-reachable
retail sources across groceries, wholesale, pharmacy, hardware, solar,
electronics, furniture, books, fashion, agriculture, automotive, and pet
supplies.

- **Deal-fetch coverage.** 70 of the probed shops run WooCommerce, Shopify, or
  Magento, so the existing platform detector reads their live on-sale feed
  directly (e.g. TV Sales, Nash Furnishers, Magnet, 4 Harvests, Vegetable
  Basket on WooCommerce; Pfeka, Happy Home on Shopify; CTM, GetMore, Ownai on
  Magento). Verified against live APIs: real was/now discounts parse correctly.
- **TM Pick n Pay** runs a custom Laravel commerce API. Its Next.js storefront
  bot-walls datacenter fetches with a redirect loop, but `api.tmpnponline.co.zw`
  answers plain JSON; the scout reads `/products/sections` on host match and
  emits a deal only where `sale_price` is a positive number below `price`
  (the feed uses `sale_price: 0` for "no special" and has carried a data-entry
  `sale_price` above `price`).
- **Currency.** Zimbabwe's country default is ZWG but its shops price in USD
  (and some diaspora Shopify stores in EUR/ZAR). Deals now carry the currency
  the API or page states — WooCommerce `currency_code`, Magento price currency,
  or the storefront's own `Shopify.currency`/JSON-LD/Open Graph signal — instead
  of the country default.
- **Online-only reach.** A paced scheduled scout runs the detector on the
  registry's online-only retailers (no physical branch for the near-me scout to
  find), so their country-scoped deals still populate.
- **Corrections.** Choppies exited Zimbabwe (rebranded Sai Mart); Jet uses
  jetstores.co.zw, not Bash; Halsteds is `.co.zw` plural. Unreachable from the
  edge and therefore not deal-scoutable: OK Online (revoked TLS certificate),
  Bon Marché, Halsted's legacy host, Zim MegaStore (country-blocked), Ubuy
  (bot challenge).
