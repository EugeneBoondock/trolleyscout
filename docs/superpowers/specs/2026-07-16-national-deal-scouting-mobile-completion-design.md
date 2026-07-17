# National Deal Scouting and Flutter Completion Design

## Outcome

Trolley Scout will keep a shared, source-backed directory of South African stores, their current deals, and their current catalogues. A Near Me search adds newly found stores to that directory. Scheduled scouting keeps those stores fresh without requiring another shopper to visit the same area.

The website and Flutter app will read the same data and show the same store logos, product images, catalogue covers, deal filters, saved data, dashboard totals, and active navigation state.

## Current State

The existing discovery service already reads public product feeds, embedded page data, retailer pages, and catalogue documents. Near Me can find stores and queue background store checks. Local work also contains a discovered-stores endpoint, store-logo helpers, Amazon image parsing, and verified-offer image storage.

The missing work is connection and persistence. Discovered stores currently live inside expiring location-cache rows. Flutter ignores several response fields. The Stores and Dashboard screens do not read the discovered-stores endpoint. Product images and catalogue covers are missing from several Flutter views. PayFast opens a page route instead of a modal sheet.

## Authentication and Navigation

Signed-out launches always open public Home. Restoring a missing or invalid session cannot open the authentication form. The full authentication form appears only after the shopper taps “Log in” or “Sign up”.

When a signed-out shopper taps a protected drawer destination, the app keeps the current public page visible and shows a short login notice. The drawer gives the active destination a clear selected background, border, icon colour, and semantic selected state.

## Persistent Store Directory

A new D1 `discovered_stores` table stores one row per `place_id` with the store name, address, website, coordinates, matched retailer, first-seen time, last-seen time, and last source tile. Store rows do not expire. This is the national directory.

Location-cache rows still expire because they are only a fast answer for a geographic tile. Current promotions still expire at their printed end date, or after the existing short fallback period when no date is available.

Every successful Near Me discovery upserts its stores into `discovered_stores`. Area-search results use the same write path. The public discovered-stores endpoint reads the permanent table and adds live promotion counts plus a best-effort logo URL.

## Scouting Strategy

The scheduled Worker keeps the existing retailer feed and catalogue scan, then checks a bounded batch of due discovered stores. Each store follows these public-data methods in order:

1. Known public JSON or embedded state used by the retailer page.
2. JSON-LD Product and Offer records.
3. Specials, promotions, deals, and catalogue paths on the store website.
4. Catalogue PDF or interactive catalogue discovery.
5. Public web-search fallback that returns a source-backed specials or catalogue page.

The scout never bypasses authentication, paywalls, bot protection, or private APIs. It uses rate caps, timeouts, bounded response sizes, a clear user agent, source URLs, duplicate removal, and expiry dates. Failed stores receive a later retry time and cannot block the rest of a scout run.

## Public Data Responses

`/api/retailers` adds `logoUrl` to each official retailer.

`/api/nearby-stores` adds `logoUrl`, preserves catalogue images, and writes every returned store into the permanent directory.

`/api/discovered-stores` returns permanent store rows, live promotion counts, area counts, known-chain counts, and logo URLs.

`/api/discovery` merges unexpired store-level deal promotions into the global deal board and exposes store catalogues beside retailer leaflets. Its summary counts the complete live result, so Dashboard reads the same values shoppers see.

## Website and Flutter Deals

Both deal boards add filters for text, retailer, source type, images, and savings. Changing a filter resets pagination. Each deal keeps its official product or source link.

Flutter switches from a deals-only request to the full discovery response. It renders catalogue cards with cover image, validity dates, retailer name, and official link. Product rows render `imageUrl` with a fixed thumbnail area and a safe placeholder when loading fails. The local Amazon parser fix supplies images after the next live refresh.

## Stores, Near Me, and Dashboard

The website and Flutter Stores pages show two clear groups: official retailer sources and stores discovered near shoppers. Both groups show logos when available. Discovered stores show address, latest-seen date, and live deal or catalogue counts.

Flutter Near Me retains its last successful results in device storage and restores them on the next visit or app launch. Starting a new search keeps the prior history visible until the new response succeeds. A timestamp explains when the history was captured.

Dashboard combines the global discovery summary with permanent discovered-store totals. Refreshing Near Me, Deals, Stores, or Dashboard reads server state again so the latest completed scouting work appears without restarting the app.

## Member Views

Basket rows render the saved deal image. Verified Offers parse and render `imageUrl`. Saved Sources becomes a clearly named watchlist of official store pages, grouped by retailer with logo, source-type label, saved date, open action, and remove action. Its copy explains that saving a source bookmarks the exact official page Trolley Scout checks.

## Subscription Checkout

Android and iOS open PayFast inside a tall modal bottom sheet containing the existing WebView. The sheet has a close action, loading state, safe-area padding, and completion handling. Desktop fallback may still use the external browser when WebView support is unavailable. Flutter web opens a modal confirmation and submits PayFast in a separate secure tab because payment pages may block framing.

## Failure Handling

Every new network view has loading, empty, retry, and stale-history states. Image failures never remove product text or actions. A failed store check records no promotion and leaves prior valid promotions untouched. Migration writes use guarded upserts so replaying a Near Me result cannot duplicate stores.

## Verification

Tests cover signed-out startup, protected drawer taps, selected drawer state, permanent store upserts, due-store selection, public response fields, global promotion merging, Amazon image parsing, Flutter catalogue parsing, deal filters, Near Me history, store logos, basket and offer images, saved-source grouping, and PayFast modal behavior.

Final checks run the website test and type-check gate, Worker tests, Flutter analysis, Flutter tests, website production build, Flutter web build, Android debug build, D1 migration listing, secret scan, and whitespace scan.
