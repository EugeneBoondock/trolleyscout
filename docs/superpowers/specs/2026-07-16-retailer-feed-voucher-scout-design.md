# Retailer Feed and Voucher Scout Design

## Outcome

Trolley Scout will automatically collect current specials from known South African retailers and from supermarkets added through Near Me. The website and Flutter app will read the same stored deal and voucher records.

## Source strategy

Known retailers use dedicated adapters for their official public formats. The first set covers Woolworths, Clicks, Makro, Game, Builders, Food Lover’s Market, SPAR, Dis-Chem, Shoprite, Checkers, Usave, and OK Foods.

Every discovered supermarket enters the scheduled scouting queue. An unknown store uses a bounded generic sequence:

1. Official structured product data and JSON-LD.
2. Public embedded page state.
3. Specials, promotions, deals, and catalogue pages on the store’s own site.
4. Official PDFs and interactive catalogues.
5. Official-domain search results when the site does not expose a stable index.

The scout does not bypass authentication, private APIs, paywalls, or bot controls. Requests use caps, timeouts, conditional cache headers, source attribution, and delayed retry.

## Deal records and price scope

Each active deal is stored as its own D1 row. A row contains retailer, official product ID, title, image, current price, previous price, saving or promotion text, official source and product URLs, validity dates, capture time, expiry, and a content fingerprint.

Price scope is explicit:

- `store`: a named branch price.
- `province`: a regional catalogue or feed price.
- `national`: a retailer-wide public price.
- `online`: a public online storefront price.

Near Me uses store rows first, then province rows, then a clearly labelled national or online fallback. A store-scoped price is never presented as national.

## Scheduled collection

Structured feeds run in small cursor-based batches every few hours. HTML sources run less often. New catalogues are discovered daily and scanned once per page and document version.

The catalogue reader uses high-resolution page substrates or the original PDF. Progress is stored by catalogue ID, page number, and document fingerprint, so later runs resume at the next page. Vision extraction returns the page number and product bounding box, allowing Trolley Scout to create a product-specific crop.

Expired campaigns, ordinary-price rows, stale carousel items, unsupported member-only prices, and duplicate products are rejected. Existing valid rows remain available when a source temporarily fails.

## Voucher Scout

Vouchers are stored separately from ordinary deals. The public voucher board supports:

- Public product vouchers such as Amazon clip coupons.
- Reusable public promotional codes confirmed on an official source.
- Official campaigns that issue a voucher after a qualifying purchase or action.
- Loyalty offers that require a named retailer membership.
- Cashback opportunities with verified terms.

Paid gift vouchers and stored-value cards appear in a separate section and never count as savings.

Personalized, single-use, till-slip, SMS, PIN, and barcode values are never collected or redistributed. Trolley Scout may show the official steps and destination for those offers. A later private import flow may let a signed-in member add their own voucher without providing retailer credentials.

Voucher rows include the benefit, minimum spend, eligibility, redemption method, product targets, channel, scope, official terms, validity, and claim URL. Exact reusable public codes are returned only from a no-cache claim endpoint.

## Shared product behavior

Web and Flutter receive the same deal and voucher contracts. Both clients expose filters, retailer logos, images, source evidence, scope labels, expiry, and official actions. Deal cards and basket rows can show matching vouchers without collapsing a deal and voucher that reference the same product.

Dashboard, Stores, Near Me, Find Deals, saved deals, offers, and basket totals read current D1 rows. A Near Me result queues the store immediately and keeps its prior history visible while new scouting runs.

## Failure and trust rules

Every public record retains its source URL and observation time. Missing end dates use a short repeat-observation expiry. Low-certainty catalogue text remains a scanner candidate until reviewed. Public list responses never expose private voucher codes. Member endpoints and voucher claims use private, no-store responses.

## Verification

Tests cover adapter parsing and pagination, strict deal gates, scope ordering, row upserts and expiry, catalogue page resume, generic store queueing, voucher separation and claims, web filters, Flutter parsing, light and dark rendering, and preservation of existing valid data after a failed source request.
