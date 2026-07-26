# Trolley Scout for Business Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved business portal at `org.trolleyscout.co.za` with organization access, publication management, consumer previews, scheduling, review states, locations, reporting, and shopper delivery.

**Architecture:** The Vite entry chooses a business or shopper React shell from the hostname. Flat Cloudflare Pages Functions expose organization-owned resources backed by focused D1 store modules. Approved publications map into the existing shopper deal and Window Shopping response shapes.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind 4, project CSS tokens, Phosphor Icons, Cloudflare Pages Functions, D1, Vitest, Testing Library

## Global Constraints

- Keep shopper and business navigation separate.
- Keep the existing brand tokens and provide light and dark themes.
- Use the existing member session and active organization gate.
- Check organization ownership on every business write.
- Store publication content as plain text and accept HTTPS destinations only.
- Support keyboard use, visible focus, 44-pixel touch targets, reduced motion, and 320-pixel screens.
- Use one publication record for deal, special, promotion, and post kinds.
- Shopper queries enforce approved start and end windows.
- Do not expose shopper identity in business reporting.
- Do not change the consumer Android navigation in this release.

---

### Task 1: Publication domain and D1 schema

**Files:**
- Create: `migrations/0035_organization_publications.sql`
- Create: `functions/_shared/organizationPublicationStore.ts`
- Create: `functions/_shared/organizationPublicationStore.test.ts`
- Modify: `functions/_shared/memberStore.ts`

**Interfaces:**
- Consumes: `TrolleyScoutEnv`, `getOrganizationForAccount`
- Produces: `listOrganizationPublications`, `getOrganizationPublication`, `createOrganizationPublication`, `updateOrganizationPublication`, `deleteOrganizationPublication`, `listOrganizationLocations`, `createOrganizationLocation`, `updateOrganizationLocation`, `readOrganizationMetrics`

- [ ] **Step 1: Write store tests for ownership, validation, lifecycle, locations, date windows, and plan limits**

Use an in-memory D1-compatible SQLite test binding. Assert that a foreign account cannot read or edit an organization record, deal price fields are validated, posts omit price requirements, submitted records cannot skip review, and live queries reject paused or expired rows.

- [ ] **Step 2: Run the focused store tests and confirm failure**

Run: `npx vitest run functions/_shared/organizationPublicationStore.test.ts`

Expected: failure because the store and migration do not exist.

- [ ] **Step 3: Add the schema**

Create tables for organization members, profiles, locations, publications, publication media, publication locations, daily event totals, and reviews. Backfill current organization owners into organization members. Add indexes for organization status lists and shopper delivery windows.

- [ ] **Step 4: Implement domain types, validation, and store functions**

Define:

```ts
export type OrganizationPublicationKind = 'deal' | 'special' | 'promotion' | 'post'
export type OrganizationPublicationStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'scheduled'
  | 'live'
  | 'paused'
  | 'expired'
  | 'rejected'
  | 'archived'
export type OrganizationPublicationPlacement = 'marketplace' | 'window' | 'both'
```

Create and update operations derive the organization from the signed-in account. Server validation bounds every field, requires HTTPS links, checks date order, and enforces kind-specific price rules.

- [ ] **Step 5: Add account-erasure coverage**

Add the new account-owned membership and event rows to the existing account cleanup list while retaining organization publication history for business audit needs.

- [ ] **Step 6: Run the focused store tests**

Run: `npx vitest run functions/_shared/organizationPublicationStore.test.ts`

Expected: all tests pass.

### Task 2: Business APIs and review API

**Files:**
- Create: `functions/api/organization-publications.ts`
- Create: `functions/api/organization-publications.test.ts`
- Create: `functions/api/organization-locations.ts`
- Create: `functions/api/organization-locations.test.ts`
- Create: `functions/api/organization-metrics.ts`
- Create: `functions/api/admin/organization-publications.ts`
- Create: `functions/api/admin/organization-publications.test.ts`
- Modify: `functions/api/organization.ts`

**Interfaces:**
- Consumes: Task 1 store functions and existing `getMemberSession`
- Produces: JSON endpoints for the business client and admin review

- [ ] **Step 1: Write endpoint tests**

Cover signed-out access, no-organization access, owner reads, create, update, archive, invalid bodies, review permission, repeated review, and private cache headers.

- [ ] **Step 2: Run endpoint tests and confirm failure**

Run: `npx vitest run functions/api/organization-publications.test.ts functions/api/organization-locations.test.ts functions/api/admin/organization-publications.test.ts`

Expected: failure because the endpoint modules do not exist.

- [ ] **Step 3: Implement the publication endpoint**

Map `GET`, `POST`, `PATCH`, and `DELETE` to the store. Return `401` for no session, `403` for no active organization, `404` for foreign records, `422` for validation issues, and private no-store headers.

- [ ] **Step 4: Implement location and metrics endpoints**

Locations support list, create, and update. Metrics return totals and daily rows for 7, 30, or 90 days with no account identifiers.

- [ ] **Step 5: Implement admin review**

Allow admins to list submitted publications and approve, request changes, or reject. Approval chooses `scheduled` when the start time is future and `live` when the start time has arrived.

- [ ] **Step 6: Expand the organization gate payload**

Return organization profile readiness, publication counts, and active allowance so the shell can render the correct first task without extra requests.

- [ ] **Step 7: Run endpoint tests**

Run: `npx vitest run functions/api/organization-publications.test.ts functions/api/organization-locations.test.ts functions/api/admin/organization-publications.test.ts`

Expected: all tests pass.

### Task 3: Business client and hostname shell

**Files:**
- Create: `src/business/types.ts`
- Create: `src/business/api.ts`
- Create: `src/business/api.test.ts`
- Create: `src/business/BusinessApp.tsx`
- Create: `src/business/BusinessApp.test.tsx`
- Modify: `src/main.tsx`
- Modify: `public/_redirects`

**Interfaces:**
- Consumes: Task 2 endpoints and current theme storage
- Produces: `BusinessApp`, typed API resource functions, hostname shell selection

- [ ] **Step 1: Write client and shell tests**

Assert request methods and payloads, business-host selection, signed-out gate, pending and rejected application states, suspended state, and active portal routing.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run src/business/api.test.ts src/business/BusinessApp.test.tsx`

Expected: failure because business modules do not exist.

- [ ] **Step 3: Implement typed API functions**

Expose resource functions for session, organization gate, publications, locations, metrics, create, update, archive, and review-safe retry messages.

- [ ] **Step 4: Select the shell by hostname**

Render `BusinessApp` for `org.trolleyscout.co.za`, `org.localhost`, or a local `?business=1` preview. Render the current `App` for all other hosts.

- [ ] **Step 5: Remove the organization redirect**

Keep the SPA fallback and allow the custom business hostname to serve the same Vite output.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run src/business/api.test.ts src/business/BusinessApp.test.tsx`

Expected: all tests pass.

### Task 4: Portal UI and publication composer

**Files:**
- Create: `src/business/BusinessShell.tsx`
- Create: `src/business/OverviewView.tsx`
- Create: `src/business/ContentView.tsx`
- Create: `src/business/PublicationComposer.tsx`
- Create: `src/business/PublicationPreview.tsx`
- Create: `src/business/LocationsView.tsx`
- Create: `src/business/InsightsView.tsx`
- Create: `src/business/AccountView.tsx`
- Create: `src/business/business.css`
- Create: `src/business/PortalViews.test.tsx`
- Modify: `src/business/BusinessApp.tsx`

**Interfaces:**
- Consumes: Task 3 API functions and business types
- Produces: complete business navigation and publication workflows

- [ ] **Step 1: Write portal component tests**

Cover five phone destinations, desktop rail, action-required status, empty setup, content filters, conditional price fields, location selection, Marketplace and Window previews, validation messages, theme switch, archive confirmation, and failed-save recovery.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run src/business/PortalViews.test.tsx`

Expected: failure because the views do not exist.

- [ ] **Step 3: Build the responsive shell**

Use the existing cream, ink, yellow, red, green, radius, spacing, and type tokens. Provide desktop rail, compact tablet rail, phone bottom navigation, theme control, organization identity, and create action.

- [ ] **Step 4: Build overview and content workspace**

Show action-needed content first, real counts, plan use, recent results, filters, state text, and state-aware actions. Use list rows on desktop and action cards on phone.

- [ ] **Step 5: Build the composer and preview**

Provide kind selection, conditional offer fields, placement, locations, dates, image URL fields for the first deployable release, alternative text, save draft, submit, and matching consumer previews. Preserve user input after failed writes.

- [ ] **Step 6: Build locations, insights, and account views**

Support location creation and state changes, real reporting ranges and empty states, organization details, billing summary, support, theme, and sign out.

- [ ] **Step 7: Run focused component tests**

Run: `npx vitest run src/business/PortalViews.test.tsx`

Expected: all tests pass.

### Task 5: Shopper delivery and event reporting

**Files:**
- Create: `functions/_shared/organizationPublicationFeed.ts`
- Create: `functions/_shared/organizationPublicationFeed.test.ts`
- Create: `functions/api/organization-publication-events.ts`
- Create: `functions/api/organization-publication-events.test.ts`
- Modify: `functions/api/discovery.ts`
- Modify: `functions/api/deal-sites.ts`
- Modify: `src/types.ts`
- Modify: `mobile/lib/api_models.dart`

**Interfaces:**
- Consumes: Task 1 publication rows
- Produces: mapped shopper deals, Window Shopping records, aggregate event writes

- [ ] **Step 1: Write feed and event tests**

Assert placement filtering, date windows, state filtering, source labels, stable identifiers, post exclusion from Marketplace, save-safe Window records, known event names, and daily upserts.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run functions/_shared/organizationPublicationFeed.test.ts functions/api/organization-publication-events.test.ts`

Expected: failure because feed mapping and event endpoint do not exist.

- [ ] **Step 3: Implement publication mapping**

Map approved Marketplace records into `DiscoveredDeal` and approved Window records into the current deal-site response. Retain organization name, “Business post” source text, cover image, dates, location scope, and destination.

- [ ] **Step 4: Add business content to shopper endpoints**

Merge mapped business records after source reads and before existing sorting, deduplication, country, location, and result limits.

- [ ] **Step 5: Implement aggregate event writes**

Accept `impression`, `open`, `save`, and `outbound` for known public publication IDs. Upsert day totals without storing shopper identity.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run functions/_shared/organizationPublicationFeed.test.ts functions/api/organization-publication-events.test.ts`

Expected: all tests pass.

### Task 6: Admin review UI, verification, and production readiness

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/types.ts`
- Modify: `functions/_shared/env.ts`
- Modify: `wrangler.toml`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1 through 5
- Produces: admin review controls and verified release output

- [ ] **Step 1: Add admin review types and API client functions**

Read submitted business publications and post approve, request-changes, or reject decisions through the admin endpoint.

- [ ] **Step 2: Add the review section to the current admin console**

Show business, content kind, placement, dates, preview, state, review note, and guarded decisions. Disable repeated actions during writes.

- [ ] **Step 3: Add Cloudflare media binding documentation**

Define the `MEDIA` R2 binding in the environment type and deployment configuration. Keep image URL entry available when the bucket is not configured.

- [ ] **Step 4: Run punctuation and UI wording checks**

Search changed UI source for em dashes, forbidden wording, unclear state labels, and light-theme contrast mistakes. Correct every match in new business content.

- [ ] **Step 5: Run the full verification suite**

Run: `npm run verify`

Expected: tests, lint, web build, and function typecheck pass.

- [ ] **Step 6: Inspect the built portal**

Open the local business shell at `/?business=1`. Check desktop, tablet, and phone sizes in light and dark themes. Exercise create, edit, submit, review state, location, reporting empty state, keyboard focus, and consumer preview.

- [ ] **Step 7: Commit the implementation**

Stage only business portal and directly related consumer delivery files. Commit with a message describing the business publishing portal.
