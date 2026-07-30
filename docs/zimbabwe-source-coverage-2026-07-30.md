# Zimbabwe public deal-source coverage

Date checked: 2026-07-30
Country: Zimbabwe
Method: bounded direct HTTP requests with five to eight second timeouts, public product or promotion endpoints, targeted JSON parsers, canonical product URL deduplication, and no browser session.

## Verified current offer ceiling

The responsible public-source ceiling found in this sweep is **1,650 unique current marked offers across 34 sources**. This is a source-capacity snapshot. The number stored in TrolleyScout at a particular moment also depends on the scheduled scout having visited each source and on each offer still passing its freshness checks.

| Source family | Verified sources | Unique current offers | Acceptance rule |
| --- | ---: | ---: | --- |
| WooCommerce public Store API | 26 | 786 | `on_sale=true` plus a valid current price below the regular price |
| Shopify public product catalogues | 5 | 255 | A valid variant price below its compare-at price |
| Everything Zimbabwean public sale API | 1 | 407 | Public sale endpoint and valid product rows |
| TM Pick n Pay public specials API | 1 | 187 | Current public special rows across all 22 bounded pages |
| Kambudzi public specials | 1 | 15 | Current public promotion rows |
| **Total** | **34** | **1,650** | Canonical product URL and normalized variant deduplication |

The 26 verified WooCommerce sources are 4 Harvests, Avacarts, Belinda Marshall Art, Dairibord, DIY Zimbabwe, FI Laptops, Food World, Infinity Solar, Innovative Technologies, Keson’s TVs, Laptop Zone, Lucky Brand, Magnet, AMA Market, MC Meats, Montana Mall, Nash Furnishers, ZikiMall, Solar Shack, Steel Centre, TC Gas, Tile and Carpet Centre, TV Sales, Vegetable Basket, Volksmaster, and ZBMS.

The five verified Shopify sale sources are African Unique, Amanat Electrical, Mawu Africa, Solution Centre, and Zambezi Cart.

## Discovery coverage

The source registry contains 353 Zimbabwe records:

- 289 direct websites
- 32 social references
- 19 verify-first candidates
- 13 discovery-only records

The direct census checked 293 unique origins because a small number of registry records share an origin. Sixty-eight unique WooCommerce origins answered the bounded public Store API request. Twenty-six had marked sales. Twelve public Shopify catalogues answered, and five had marked sales.

The responding Shopify catalogues exposed 10,208 ordinary products in total. Those rows are not counted as deals unless a live compare-at markdown exists. Greens, Budget Meat Shop, Z-Store, and other full-price catalogues are also excluded from deal totals. This prevents an ordinary product catalogue from inflating Marketplace coverage.

## Why the 5,000 target is not responsibly reachable today

The verified shortfall is **3,350 offers** against the 5,000 target and **8,350 offers** against the 10,000 stretch target.

The remaining public candidates fell into one of these groups:

- ordinary full-price catalogues with no marked promotion
- social-only promotion pages without stable item-level public data
- unavailable origins, expired domains, certificate failures, or persistent server errors
- sites with no public product or promotion endpoint
- pages that require private sessions, access-control bypasses, or collection methods that conflict with site rules
- duplicate shop fronts or product variants already represented by a canonical product URL

None of those groups can be added to the verified total without fabricating deals, duplicating products, or treating an unavailable page as a zero-deal source. The scout records transient failures separately from a genuine, successfully parsed empty result.

## Runtime safeguards

- WooCommerce requests use `on_sale=true`, a maximum of 100 rows per page, and at most ten pages.
- Shopify and other supported commerce requests use bounded page and output ceilings.
- TM Pick n Pay reads at most 30 pages with four concurrent requests and per-request timeouts.
- Large verified results are written in batches of 100 database statements.
- Marketplace reads can load up to 10,000 fresh store promotions before the member’s plan boundary is applied.
- Stale rows are reconciled only after a certain, non-empty source success. A failed or uncertain empty request retains the last known valid rows until normal expiry.

## Next responsible expansion paths

Coverage can rise when retailers publish more marked sales or when additional public item-level endpoints become available. The registry keeps unavailable, social-reference, and verify-first sources distinct so future scout runs can recheck them without presenting them as current deals.
