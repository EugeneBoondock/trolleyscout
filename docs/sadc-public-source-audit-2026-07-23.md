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
