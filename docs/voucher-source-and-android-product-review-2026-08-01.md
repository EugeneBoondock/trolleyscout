# Voucher source and Android product review

Date: 1 August 2026

## Decision

TrolleyScout cannot reliably maintain 100 public, reusable grocery checkout codes from legitimate public sources across its supported markets. Keep the voucher area as a country-scoped shopper contribution system with visible confidence signals, expiry rules, and moderation. Do not present retailer loyalty prices or clip coupons as checkout codes.

The live read-only API check found 103 retailer-issued offers, all in South Africa: 54 Amazon product clip coupons and 49 loyalty offers from Checkers, Pick n Pay, and Shoprite. None was a public reusable checkout code. The checkout-code endpoint returned zero codes.

## Markets checked

The retail source registry and public site copy cover 16 markets:

- Angola
- Botswana
- Comoros
- Democratic Republic of the Congo
- Eswatini
- Lesotho
- Madagascar
- Malawi
- Mauritius
- Mozambique
- Namibia
- Seychelles
- South Africa
- Tanzania
- Zambia
- Zimbabwe

The account picker accepts other countries, but those countries do not have curated retail sources. Voucher reads and submissions therefore use the signed-in member country or the request country, with South Africa as the safe fallback for older records.

## Source assessment

Public retailer pages, retailer terms, current loyalty pages, and public search results were checked for each market. South African checks included Checkers, Pick n Pay, Shoprite, and Woolworths. Checks in the other markets included the retailers already represented by TrolleyScout’s retail source registry, such as Choppies, Game, Shoprite, SPAR, Pick n Pay, TM Pick n Pay, Winners, Super U, Shoppers, Maxi, Leader Price, Kin Marché, Sana, and local market sites.

Findings:

- Retailer sites publish catalogues, loyalty prices, personalized vouchers, and time-limited campaigns. They do not expose a durable public feed of reusable checkout codes.
- [Pick n Pay asap! terms](https://www.pnp.co.za/pnp-asap-terms-and-conditions) state that codes have campaign-specific rules and can be rejected when distributed without authorization.
- [Woolworths MyDifference](https://www.woolworths.co.za/content/look/my-difference/_/A-cmp216141) describes vouchers as personalized and available inside the loyalty area of its app.
- Search results for the other 15 markets produced retailer catalogues, loyalty offers, expired campaign posts, or third-party coupon pages. None provided a large, current, retailer-authorized checkout-code inventory.
- Awin and Admitad offer structured promotion APIs, but access requires publisher credentials and programme access. Awin’s [publisher API documentation](https://developer.awin.com/apidocs/for-publishers) is not an anonymous public inventory. The feed adapters remain optional and only accept promotions with an explicit two-letter market.
- Coupon aggregators, referral posts, private groups, leaked codes, and terms-restricted sources were excluded.

A count of 100 could only be reached by mixing unrelated product coupons, loyalty offers, referrals, expired campaigns, or unverified aggregator entries. That would create a misleading inventory and could conflict with retailer terms.

## Sustainable product rules

- Each code belongs to one country.
- Member submissions start as unconfirmed.
- A positive report from another shopper confirms the code.
- Negative reports lower its rank and can retire it under the existing voting threshold.
- An undated code disappears after 30 days without a successful report.
- Personal, referral, invite-only, single-use, URL-shaped, and contact-shaped submissions are rejected.
- Existing member submissions cannot overwrite terms, benefits, dates, or revive a retired code.
- Approved affiliate feeds may refresh records only when credentials and advertiser access are configured.
- Empty states say that no public codes have been shared for the selected country and invite an eligible contribution. They do not promise a minimum inventory.

## Android product review

Current grocery and shopping leaders reviewed included Walmart, Amazon Shopping, Checkers Sixty60, Shoprite SA, and Kimbino. Repeated useful patterns were prominent search, scan or photo input, saved lists, clear filters, local specials, status feedback, and layouts that adapt beyond phone widths. TrolleyScout already has search, barcode scanning, saved items, alerts, lists, filters, and offline feedback.

The highest-impact feasible gap was large-screen navigation. Android’s current [adaptive navigation guidance](https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation) recommends a bottom navigation bar for compact windows and a navigation rail for expanded windows. The [window size class guidance](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes) places expanded width at 840 dp and above. TrolleyScout now switches to a rail at that width and keeps its bottom bar on phones. A widget test covers the expanded layout.

Android also recommends a local source of truth for dependable offline reads in its [offline-first guidance](https://developer.android.com/topic/architecture/data-layer/offline-first). TrolleyScout already presents cached catalogue data and connectivity feedback, so this review did not replace that working path.

## Release note

Migration 0048 for country-scoped voucher moderation was applied during the previously authorized Cloudflare release. Migration 0049 for source-backed deal reports remains a repository change and must be applied before that feature is released.
