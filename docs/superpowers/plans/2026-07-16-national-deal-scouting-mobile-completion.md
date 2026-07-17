# National Deal Scouting and Flutter Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Trolley Scout’s permanent store directory, scouting results, images, catalogues, filters, member views, subscription checkout, and signed-out navigation work across the website and Flutter app.

**Architecture:** Cloudflare D1 stores permanent discovered-store records and expiring promotion records. Near Me and the scheduled scout share the same store upsert path. Public APIs return the merged discovery data consumed by both clients. Flutter keeps only a local copy of the last successful Near Me response for fast history display.

**Tech Stack:** TypeScript, React, Cloudflare Pages Functions and Workers, D1, Vitest, Flutter, Dart, WebView Flutter, SharedPreferences, and Flutter Test.

## Global Constraints

- Keep all existing uncommitted user work intact.
- Use public source pages, public feeds, JSON-LD, embedded public state, and catalogue documents only.
- Keep request caps, timeouts, duplicate removal, source URLs, and expiry dates.
- Follow both light and dark themes for every changed view.
- Keep signed-out Home public and make authentication an explicit shopper action.
- Apply D1 migrations locally and remotely only after tests pass.
- Do not create commits unless the user separately requests them.

---

### Task 1: Permanent discovered-store storage

**Files:**
- Create: `migrations/0011_discovered_store_directory.sql`
- Modify: `functions/_shared/locationStore.ts`
- Test: `functions/_shared/locationStore.test.ts`

- [ ] Write failing tests for idempotent place upserts, first-seen preservation, last-seen updates, due-store selection, and permanent reads after tile expiry.
- [ ] Add the `discovered_stores` schema and indexes for place, retailer, last seen, and next scout time.
- [ ] Add typed write, read, count, due selection, and scout-result update helpers.
- [ ] Run the focused test file and confirm it passes.

### Task 2: Persist stores from Near Me and area scouting

**Files:**
- Modify: `functions/api/nearby-stores.ts`
- Modify: `functions/_shared/areaScout.ts`
- Modify: `functions/_shared/storeLogos.ts`
- Test: `functions/api/nearby-stores.test.ts`
- Test: `functions/_shared/areaScout.test.ts`

- [ ] Write failing tests that every returned place is upserted and receives a logo URL.
- [ ] Route Geoapify and area-search results through the permanent store write helper.
- [ ] Preserve returned catalogue images, promotions, and existing cache behavior.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Public store and retailer APIs

**Files:**
- Modify: `functions/api/discovered-stores.ts`
- Modify: `functions/api/retailers.ts`
- Modify: `src/services/storeLogos.ts`
- Test: `functions/api/discovered-stores.test.ts`
- Test: `functions/api/retailers.test.ts`
- Test: `src/services/storeLogos.test.ts`

- [ ] Write failing response-contract tests for logos, permanent counts, live deal counts, known chains, and area counts.
- [ ] Read discovered stores from D1 and join unexpired promotion totals.
- [ ] Add retailer logos to the official retailer response.
- [ ] Run the focused API and logo tests.

### Task 4: Scout due stores and parse public offers

**Files:**
- Modify: `functions/_shared/storeScout.ts`
- Modify: `workers/scout.ts`
- Test: `functions/_shared/storeScout.test.ts`
- Test: `workers/scout.test.ts`

- [ ] Write failing parser tests for JSON-LD Product and Offer data, embedded public JSON, duplicate removal, source attribution, and bounded failures.
- [ ] Add public-page offer parsing with price, prior price, image, URL, retailer, and expiry fields.
- [ ] Select a capped batch of due permanent stores in the scheduled Worker.
- [ ] Record successful and failed scout times without removing still-valid promotions.
- [ ] Run the focused scout and Worker tests.

### Task 5: Merge store promotions into global discovery

**Files:**
- Modify: `functions/api/discovery.ts`
- Modify: `functions/_shared/locationStore.ts`
- Test: `functions/api/discovery.test.ts`

- [ ] Write failing tests for unexpired store deal merging, duplicate removal, catalogue exposure, images, and summary totals.
- [ ] Map store promotions into the shared deal and catalogue response shapes.
- [ ] Ensure expired promotions never enter the result.
- [ ] Run the discovery API tests.

### Task 6: Flutter response models and API methods

**Files:**
- Modify: `mobile/lib/api_models.dart`
- Modify: `mobile/lib/api.dart`
- Test: `mobile/test/api_models_test.dart`
- Test: `mobile/test/api_test.dart`

- [ ] Write failing tests for retailer logos, discovered stores, full discovery catalogues, catalogue images, nearby-store logos, refreshed times, and offer images.
- [ ] Add the missing typed fields and discovered-stores request.
- [ ] Make Find Deals consume the full discovery response.
- [ ] Run the focused Dart tests.

### Task 7: Explicit Flutter authentication and selected navigation

**Files:**
- Modify: `mobile/lib/main.dart`
- Modify: `mobile/lib/widgets/app_drawer.dart`
- Test: `mobile/test/widget_test.dart`

- [ ] Write failing widget tests for signed-out Home, protected destination taps, explicit login and signup actions, and selected drawer styling.
- [ ] Keep the current public screen when a signed-out shopper taps a protected destination and show a login notice.
- [ ] Add a visible theme-aware active item background, border, icon treatment, and selected semantics.
- [ ] Run the focused widget tests.

### Task 8: Persistent Flutter Near Me history

**Files:**
- Create: `mobile/lib/nearby_history_store.dart`
- Modify: `mobile/lib/screens/near_me_screen.dart`
- Modify: `mobile/pubspec.yaml`
- Test: `mobile/test/nearby_history_store_test.dart`
- Test: `mobile/test/member_screens_test.dart`

- [ ] Write failing tests for history encoding, restoration, replacement after success, and preservation during a failed refresh.
- [ ] Store the last successful response and timestamp with SharedPreferences.
- [ ] Restore history on screen load and keep it visible during new searches.
- [ ] Render store logos, deal images, catalogue covers, stale timestamp, retry, and empty states.
- [ ] Run the focused history and screen tests.

### Task 9: Flutter Stores and Dashboard live data

**Files:**
- Modify: `mobile/lib/screens/stores_screen.dart`
- Modify: `mobile/lib/screens/dashboard_screen.dart`
- Test: `mobile/test/member_screens_test.dart`

- [ ] Write failing widget tests for official and discovered groups, logos, discovered store counts, addresses, last-seen dates, and global deal totals.
- [ ] Load official retailers and permanent discovered stores together.
- [ ] Read Dashboard totals from global discovery plus permanent store counts.
- [ ] Add theme-aware loading, empty, and retry states.
- [ ] Run the focused screen tests.

### Task 10: Deal images, catalogues, and filters

**Files:**
- Modify: `mobile/lib/screens/deals_screen.dart`
- Modify: `src/App.tsx`
- Modify: `src/services/apiClient.ts`
- Test: `mobile/test/member_screens_test.dart`
- Test: `src/App.test.tsx`
- Test: `src/services/dealDiscovery.test.ts`

- [ ] Write failing tests for text, retailer, source, image, and savings filters plus pagination reset.
- [ ] Render Flutter deal thumbnails and catalogue cover cards with safe placeholders.
- [ ] Add matching website filters and discovered-store cards.
- [ ] Keep the Amazon image parser regression test and cover both high and low resolution shapes.
- [ ] Run the focused web and Flutter tests.

### Task 11: Basket, Offers, and Saved Sources

**Files:**
- Modify: `mobile/lib/screens/basket_screen.dart`
- Modify: `mobile/lib/screens/offers_screen.dart`
- Modify: `mobile/lib/screens/saved_sources_screen.dart`
- Test: `mobile/test/member_screens_test.dart`

- [ ] Write failing tests for basket images, offer images, retailer-grouped source rows, source labels, saved dates, open actions, and remove actions.
- [ ] Render existing image fields with stable thumbnail sizing and fallbacks.
- [ ] Group Saved Sources by retailer and explain the watchlist behavior in plain language.
- [ ] Run the focused member-view tests.

### Task 12: PayFast modal checkout

**Files:**
- Modify: `mobile/lib/payfast_checkout_native.dart`
- Modify: `mobile/lib/payfast_checkout_web.dart`
- Modify: `mobile/lib/screens/subscription_screen.dart`
- Test: `mobile/test/payfast_checkout_test.dart`
- Test: `mobile/test/member_screens_test.dart`

- [ ] Write failing tests for native modal configuration, close behavior, loading state, completion handling, and web confirmation behavior.
- [ ] Open Android and iOS checkout in a safe-area modal bottom sheet containing the WebView.
- [ ] Open Flutter web checkout from a confirmation dialog into a separate secure tab.
- [ ] Run the focused checkout tests.

### Task 13: Apply migration and run all verification gates

**Files:**
- Verify: `migrations/0011_discovered_store_directory.sql`
- Verify: website, Functions, Worker, and Flutter files changed above

- [ ] Apply D1 migrations to the local database and verify the new table and indexes.
- [ ] Apply D1 migrations to the remote database and list migration status.
- [ ] Run `npm run verify`.
- [ ] Run Flutter analysis and the full Flutter test suite.
- [ ] Build the website, Flutter web app, and Android debug APK.
- [ ] Run project secret and whitespace scans without printing secret values.
- [ ] Review the final diff for unrelated edits and report any live-data refresh or deployment step that remains external to this task.
