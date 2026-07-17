# Retailer Feed and Voucher Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect source-backed specials and vouchers automatically for known retailers and supermarkets found through Near Me, then serve the same scoped rows to web and Flutter.

**Architecture:** Focused source adapters convert public retailer responses into normalized candidates. D1 stores active deals, vouchers, source cursors, and catalogue-page progress. Scheduled workers refresh bounded source batches, while public APIs remain cache-first.

**Tech Stack:** TypeScript, React, Cloudflare Pages Functions and Workers, D1, Vitest, Flutter, Dart, and Flutter Test.

## Global Constraints

- Keep all existing uncommitted user work intact.
- Use official public pages, feeds, embedded public state, catalogue documents, and official-domain search results only.
- Do not bypass authentication, private APIs, paywalls, or bot controls.
- Store national, province, store, and online price scope explicitly.
- Near Me resolves store, then province, then labelled national or online fallback.
- Keep request caps, timeouts, duplicate removal, source URLs, expiry, and delayed retry.
- Keep vouchers separate from ordinary deals.
- Never ingest or expose personalized voucher codes, PINs, barcodes, SMS tokens, or till-slip tokens.
- Keep paid gift vouchers separate from savings.
- Support light and dark themes in web and Flutter.
- Write and run a failing test before every production behavior change.
- Apply D1 migrations locally and remotely only after focused tests and type checks pass.
- Do not create commits unless the user separately requests them.

---

### Task 1: Retailer adapter contracts and structured feeds

**Files:**
- Create: `src/services/retailerFeeds/types.ts`
- Create: `src/services/retailerFeeds/woolworths.ts`
- Create: `src/services/retailerFeeds/clicks.ts`
- Create: `src/services/retailerFeeds/foodLovers.ts`
- Create: `src/services/retailerFeeds/massmart.ts`
- Test: `src/services/retailerFeeds/*.test.ts`

**Interfaces:**
- Produces: `RetailerFeedPage`, `RetailerDealCandidate`, `FeedCursor`, and one pure parser per retailer family.
- Consumers: scheduled source collection and D1 upserts in Tasks 3 and 4.

- [ ] Write fixtures that prove Woolworths promotion IDs, images, price lists, URLs, and paging.
- [ ] Run the Woolworths test and confirm failure because the adapter is missing.
- [ ] Implement the pure Woolworths parser and run the test to green.
- [ ] Repeat the red-green cycle for Clicks pagination and promotion gating.
- [ ] Repeat the red-green cycle for Food Lover’s direct records and scoped PDF records.
- [ ] Repeat the red-green cycle for Game, Builders, and Makro strict promotion gating.
- [ ] Run `npm test -- src/services/retailerFeeds` and confirm all adapter tests pass.

### Task 2: Normalized D1 deal storage

**Files:**
- Create: `migrations/0013_deal_items.sql`
- Create: `functions/_shared/dealItemStore.ts`
- Test: `functions/_shared/dealItemStore.test.ts`
- Modify: `functions/_shared/env.ts`

**Interfaces:**
- Consumes: `RetailerDealCandidate` from Task 1.
- Produces: `upsertDealItems`, `listActiveDealItems`, `expireDealItems`, `readSourceCursor`, and `writeSourceCursor`.

- [ ] Write failing tests for idempotent product upserts, content fingerprint updates, simultaneous scope rows, cursor persistence, and Johannesburg expiry.
- [ ] Run the focused test and verify the expected missing-store failures.
- [ ] Add `deal_items`, `deal_source_runs`, and `deal_source_cursors` with retailer, scope, source, product, price, image, dates, fingerprint, status, and indexes.
- [ ] Implement the minimal D1 store helpers.
- [ ] Run `npm test -- functions/_shared/dealItemStore.test.ts` and confirm it passes.

### Task 3: Scheduled structured-feed collection

**Files:**
- Create: `functions/_shared/retailerFeedScout.ts`
- Test: `functions/_shared/retailerFeedScout.test.ts`
- Modify: `functions/api/discovery.ts`
- Modify: `workers/scout.ts`
- Test: `functions/api/discovery.test.ts`
- Test: `workers/scout.test.ts`

**Interfaces:**
- Consumes: Task 1 adapters and Task 2 storage.
- Produces: bounded scheduled refreshes and normalized discovery reads.

- [ ] Write failing tests for cursor continuation, request caps, failed-source preservation, strict accepted-row metrics, and snapshot fallback during cutover.
- [ ] Run focused tests and verify they fail for missing orchestration.
- [ ] Add the source registry and bounded scheduled lanes.
- [ ] Read normalized active rows before legacy snapshots and merge without product duplication.
- [ ] Run the focused scout, Worker, and discovery tests.

### Task 4: Resumable catalogue scanning and automatic unknown-store scouting

**Files:**
- Modify: `functions/_shared/catalogueScout.ts`
- Modify: `functions/_shared/storeScout.ts`
- Modify: `functions/_shared/locationStore.ts`
- Modify: `workers/scout.ts`
- Test: `src/services/catalogueDeals.test.ts`
- Test: `functions/_shared/catalogueScout.test.ts`
- Test: `functions/_shared/storeScout.test.ts`

**Interfaces:**
- Produces: high-resolution page URLs, catalogue page cursors, product crop coordinates, and due-store source candidates.

- [ ] Write failing tests that select a 1,350px or better FlippingBook substrate and resume at the first unscanned page.
- [ ] Write failing tests that every discovered supermarket receives a due scout time and generic source-path queue.
- [ ] Run the focused tests and verify both behaviors are absent.
- [ ] Replace thumbnail-only scanning with high-resolution substrate or PDF fallback.
- [ ] Persist document fingerprint and page progress, and keep multiple active regional catalogues.
- [ ] Expand generic store scouting to embedded JSON, official specials paths, catalogue links, PDFs, and bounded official-domain search fallback.
- [ ] Run the focused catalogue, store, and Worker tests.

### Task 5: First-class public voucher storage and Amazon adapter

**Files:**
- Create: `migrations/0014_vouchers.sql`
- Create: `src/services/voucherDiscovery.ts`
- Create: `src/services/voucherDiscovery.test.ts`
- Create: `functions/_shared/voucherStore.ts`
- Create: `functions/_shared/voucherStore.test.ts`
- Create: `functions/api/vouchers.ts`
- Create: `functions/api/voucher-claim.ts`
- Create: `functions/api/vouchers.test.ts`
- Modify: `src/services/dealDiscovery.ts`

**Interfaces:**
- Produces: `Voucher`, public filtered listing, and no-cache claim actions.

- [ ] Write failing tests that preserve Amazon coupon ID, ASIN, benefit, image, account requirement, redemption URL, and multiple vouchers per product.
- [ ] Write failing D1 tests for expiry, code hashing, no personalized-code storage, and deal-voucher coexistence.
- [ ] Run tests and verify the new resource is missing.
- [ ] Implement the Amazon public coupon adapter and voucher store.
- [ ] Add public list and claim endpoints with exact-code responses restricted to confirmed reusable public codes.
- [ ] Remove Amazon vouchers from ordinary deal dedupe only after the voucher endpoint test is green.
- [ ] Run the voucher and discovery tests.

### Task 6: Web voucher view and deal matching

**Files:**
- Create: `src/views/VouchersView.tsx`
- Create: `src/services/voucherFilters.ts`
- Test: `src/services/voucherFilters.test.ts`
- Modify: `src/services/apiClient.ts`
- Modify: `src/api/contracts.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: public voucher API from Task 5.
- Produces: public voucher navigation, filters, claim actions, and matching badges on deal and basket rows.

- [ ] Write failing filter and component tests for retailer, eligibility, redemption, channel, expiry, images, and code reveal.
- [ ] Run focused tests and verify the view is absent.
- [ ] Add typed API methods and the focused voucher view.
- [ ] Add theme-aware cards and matching badges without growing voucher rendering inside `App.tsx`.
- [ ] Run focused web tests and type checking.

### Task 7: Flutter voucher parity

**Files:**
- Create: `mobile/lib/screens/vouchers_screen.dart`
- Create: `mobile/lib/voucher_filters.dart`
- Create: `mobile/test/voucher_filters_test.dart`
- Modify: `mobile/lib/api_models.dart`
- Modify: `mobile/lib/api.dart`
- Modify: `mobile/lib/main.dart`
- Modify: `mobile/lib/widgets/app_drawer.dart`
- Modify: `mobile/lib/screens/dashboard_screen.dart`
- Modify: `mobile/lib/screens/near_me_screen.dart`
- Test: `mobile/test/api_models_test.dart`
- Test: `mobile/test/api_test.dart`
- Test: `mobile/test/member_screens_test.dart`

**Interfaces:**
- Consumes: Task 5 voucher API.
- Produces: public voucher browsing and official claim actions in Flutter.

- [ ] Write failing model, API, filter, navigation, light-theme, and dark-theme widget tests.
- [ ] Run focused Flutter tests and verify the new types and screen are absent.
- [ ] Add voucher models, API calls, navigation, filters, cards, and claim handling.
- [ ] Attach matching voucher counts to Dashboard and Near Me without storing expired rows in history.
- [ ] Run focused Flutter tests and analysis.

### Task 8: Migrations, live refresh, and release verification

**Files:**
- Verify: `migrations/0013_deal_items.sql`
- Verify: `migrations/0014_vouchers.sql`
- Verify: all files changed by Tasks 1 through 7.

- [ ] Run the full web and Worker test suite.
- [ ] Run lint, website build, and Functions type checking.
- [ ] Run Flutter analysis and the full Flutter test suite.
- [ ] Build the Flutter web app and Android APK.
- [ ] Apply the new D1 migrations locally and remotely with Wrangler.
- [ ] Deploy Pages and the scheduled scout only after every verification gate passes.
- [ ] Trigger a live scout refresh and verify retailer counts, voucher counts, images, scopes, expiry, and automatic queueing for discovered supermarkets.
- [ ] Run secret and whitespace scans without printing secret values.
