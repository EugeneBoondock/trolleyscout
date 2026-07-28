# Developer MCP, API, Campaign Destinations, and Business Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release a paid Developers plan with OAuth-protected MCP access, API-key-protected REST access, three-destination business campaigns, Stories delivery, and private business performance rankings.

**Architecture:** Keep the remote MCP and REST routes in Cloudflare Pages Functions. Route both transports through shared authorization, campaign, and reporting services so billing, scopes, ownership, limits, and audits behave the same way. Store credential hashes and aggregate campaign metrics in D1.

**Tech Stack:** React 19, TypeScript, Cloudflare Pages Functions, Cloudflare D1, Vitest, Vite, Flutter, PayFast

## Global Constraints

- Developers pricing is ZAR 999/9,990, USD 199/1,990, EUR 199/1,990, GBP 179/1,790, and Zimbabwe USD 59/590 for monthly/annual billing.
- The Developers plan includes Organisation allowances, one approved business workspace, 25,000 authenticated calls per billing month, and 120 calls per minute.
- MCP uses hosted OAuth authorization code with PKCE. Developer REST endpoints use bearer API keys.
- Full API keys, access tokens, refresh tokens, authorization codes, and client secrets are returned only when issued. D1 stores SHA-256 hashes.
- Campaign destinations are Marketplace, Window Shopping, and Stories. At least one is required.
- Business reporting exposes no shopper identity.
- New UI must work in light and dark modes and must not use em dashes.
- Preserve unrelated worktree changes. Stage only files belonging to each task.

---

### Task 1: Add the Developers subscription

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data/memberPlans.ts`
- Modify: `src/data/planPricing.ts`
- Modify: `src/data/memberPlans.test.ts`
- Modify: `src/data/planPricing.test.ts`
- Modify: `functions/_shared/memberStore.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `MemberPlanId` containing `developers`
- Produces: `getDeveloperAllowance(planId): { callsPerMonth: number; callsPerMinute: number } | undefined`
- Produces: Developers prices through `getPlanBillingOption`

- [ ] **Step 1: Write failing plan tests**

```ts
it('prices Developers in every supported market', () => {
  expect(getLocalPlanPrice('developers', 'monthly', 'ZAR')).toBe(999)
  expect(getLocalPlanPrice('developers', 'annual', 'USD')).toBe(1990)
  expect(getLocalPlanPrice('developers', 'monthly', 'USD', 'ZW')).toBe(59)
})

it('grants API and Organisation allowances to Developers', () => {
  expect(getDeveloperAllowance('developers')).toEqual({
    callsPerMinute: 120,
    callsPerMonth: 25_000,
  })
  expect(getPlanMerchantAllowance('developers')?.shopProfiles).toBe(1)
})
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm test -- src/data/memberPlans.test.ts src/data/planPricing.test.ts`

Expected: TypeScript or assertions fail because `developers` is not a plan.

- [ ] **Step 3: Add the plan and prices**

Extend `MemberPlanId` and `PaidPlanId`. Add prices from Global Constraints. Add a `developer` allowance to `MemberPlan`, and define Developers as a paid plan carrying the existing Organisation merchant limits.

- [ ] **Step 4: Make labels, checkout, plan changes, and admin plan controls accept Developers**

Update explicit plan labels and normalization fallbacks. Keep Organisation application checks for the Developers plan because its campaign tools require an approved business workspace.

- [ ] **Step 5: Run plan, subscription, and billing tests**

Run: `npm test -- src/data/memberPlans.test.ts src/data/planPricing.test.ts functions/api/subscription.test.ts functions/_shared/payfastBilling.test.ts functions/_shared/planChanges.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/data/memberPlans.ts src/data/planPricing.ts src/data/memberPlans.test.ts src/data/planPricing.test.ts functions/_shared/memberStore.ts src/App.tsx
git commit -m "feat: add Developers subscription"
```

### Task 2: Add developer credentials, OAuth records, usage, and campaign destination schema

**Files:**
- Create: `migrations/0043_developer_mcp_campaign_insights.sql`
- Create: `functions/_shared/developerAccess.ts`
- Create: `functions/_shared/developerAccess.test.ts`
- Modify: `functions/_shared/env.ts`

**Interfaces:**
- Produces: `DeveloperScope = 'shopping:read' | 'trends:read' | 'campaigns:read' | 'campaigns:write'`
- Produces: `hashDeveloperSecret(value: string): Promise<string>`
- Produces: `authorizeDeveloperRequest(env, request, requiredScopes): Promise<DeveloperPrincipal>`
- Produces: `consumeDeveloperCall(env, principal, operation, requestId): Promise<void>`
- Produces: `DeveloperAccessError` with stable `code`, `httpStatus`, and `message`

- [ ] **Step 1: Write failing security and allowance tests**

```ts
it('stores and compares SHA-256 hashes without persisting the secret', async () => {
  const secret = 'ts_dev_example'
  expect(await hashDeveloperSecret(secret)).toMatch(/^[a-f0-9]{64}$/)
  expect(await hashDeveloperSecret(secret)).not.toContain(secret)
})

it('rejects a valid key when the plan is inactive', async () => {
  await expect(
    authorizeDeveloperRequest(env, bearer('ts_dev_valid'), ['shopping:read']),
  ).rejects.toMatchObject({ code: 'developer_subscription_required', httpStatus: 402 })
})
```

- [ ] **Step 2: Run the access tests and confirm failure**

Run: `npm test -- functions/_shared/developerAccess.test.ts`

Expected: FAIL because the module and schema do not exist.

- [ ] **Step 3: Create migration 0043**

Create tables for:

- `developer_api_keys`
- `developer_oauth_clients`
- `developer_oauth_codes`
- `developer_oauth_access_tokens`
- `developer_oauth_refresh_tokens`
- `developer_usage_monthly`
- `developer_rate_windows`
- `developer_call_audit`
- `organization_publication_destinations`
- `organization_publication_metrics_daily`

Use foreign keys to `member_accounts` and `organization_publications`, unique hash indexes, expiry indexes, and `CHECK` rules for credential status, scopes, destination, and non-negative counters.

Backfill destinations with:

```sql
INSERT OR IGNORE INTO organization_publication_destinations (publication_id, destination)
SELECT id, 'marketplace' FROM organization_publications WHERE placement IN ('marketplace', 'both');

INSERT OR IGNORE INTO organization_publication_destinations (publication_id, destination)
SELECT id, 'window' FROM organization_publications WHERE placement IN ('window', 'both');
```

- [ ] **Step 4: Implement shared access checks**

Parse only `Authorization: Bearer`. Hash the presented secret. Load active credentials and their account. Require Developers or admin access. Check required scopes, the monthly allowance, and the minute bucket. Record success and failure outcomes without request arguments or response bodies.

- [ ] **Step 5: Run access tests**

Run: `npm test -- functions/_shared/developerAccess.test.ts`

Expected: PASS for hashing, invalid keys, expiry, revocation, scopes, plan gates, monthly limit, per-minute limit, and admin access.

- [ ] **Step 6: Commit**

```bash
git add migrations/0043_developer_mcp_campaign_insights.sql functions/_shared/developerAccess.ts functions/_shared/developerAccess.test.ts functions/_shared/env.ts
git commit -m "feat: add developer access data model"
```

### Task 3: Add account-managed API keys

**Files:**
- Create: `functions/api/developer-keys.ts`
- Create: `functions/api/developer-keys.test.ts`
- Modify: `src/services/apiClient.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `GET /api/developer-keys`
- Produces: `POST /api/developer-keys` with `{ name, scopes, expiresAt? }`
- Produces: `DELETE /api/developer-keys` with `{ keyId }`
- Produces: `DeveloperApiKeySummary`

- [ ] **Step 1: Write failing key lifecycle tests**

```ts
it('returns the full key once and stores only its hash', async () => {
  const response = await onRequest(postAsDeveloper({
    name: 'Production',
    scopes: ['shopping:read'],
  }))
  expect(response.status).toBe(201)
  expect((await response.clone().json()).secret).toMatch(/^ts_dev_/)
  expect(db.sql).not.toContain('ts_dev_')
})

it('prevents API keys from creating API keys', async () => {
  const response = await onRequest(postWithApiKey({ name: 'Nested key' }))
  expect(response.status).toBe(403)
})
```

- [ ] **Step 2: Run the route tests and confirm failure**

Run: `npm test -- functions/api/developer-keys.test.ts`

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement session-only list, create, and revoke**

Generate 32 random bytes, encode base64url, prefix with `ts_dev_`, store the SHA-256 hash and first 12 visible characters, and return the full secret only in the create response. Reject empty names, unknown scopes, past expiry, more than 10 active keys, and key-authenticated management calls.

- [ ] **Step 4: Add the Developer account panel**

Show allowance, usage, endpoint URLs, key list, create form, one-time secret copy panel, and revoke action. Use existing light and dark tokens. Do not place the full secret back into persistent React state after the one-time panel closes.

- [ ] **Step 5: Run route and component tests**

Run: `npm test -- functions/api/developer-keys.test.ts src/App.subscription-business.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/api/developer-keys.ts functions/api/developer-keys.test.ts src/services/apiClient.ts src/App.tsx src/index.css
git commit -m "feat: add developer API key controls"
```

### Task 4: Add the versioned developer REST API

**Files:**
- Create: `functions/_shared/developerApi.ts`
- Create: `functions/_shared/developerApi.test.ts`
- Create: `functions/api/developer/v1/[[path]].ts`
- Create: `functions/api/developer/v1/[[path]].test.ts`
- Modify: `functions/_shared/organizationPublicationStore.ts`

**Interfaces:**
- Consumes: `authorizeDeveloperRequest`, `consumeDeveloperCall`
- Produces: `/api/developer/v1/deals`, `/catalogues`, `/stores/nearby`, `/stories`, `/trends`
- Produces: `/api/developer/v1/campaigns` and campaign action routes
- Produces: `developerApiError(error, requestId): Response`

- [ ] **Step 1: Write failing read and ownership tests**

```ts
it('requires shopping:read for deal search', async () => {
  const response = await route(get('/deals?q=rice', keyWith(['trends:read'])))
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ error: { code: 'scope_required' } })
})

it('returns 404 for another organization campaign', async () => {
  const response = await route(get('/campaigns/org-pub-other', campaignKey))
  expect(response.status).toBe(404)
})
```

- [ ] **Step 2: Run the route tests and confirm failure**

Run: `npm test -- functions/_shared/developerApi.test.ts functions/api/developer/v1/[[path]].test.ts`

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Implement the router and read services**

Dispatch by HTTP method and decoded path segments. Reuse discovery, catalogue, nearby-store, and story source builders rather than making outbound calls back to the same origin. Cap page size at 100 and use a base64url cursor containing the last stable sort key.

- [ ] **Step 4: Implement campaign services**

Map create and edit inputs into `OrganizationPublicationInput`. Require `campaigns:write` for mutations and `campaigns:read` for reads. Preserve draft, review, pause, and resume rules from `organizationPublicationStore`.

- [ ] **Step 5: Add stable errors and request IDs**

Return the status codes from the design with:

```json
{
  "error": {
    "code": "scope_required",
    "message": "This key does not include campaigns:write.",
    "requestId": "req_..."
  }
}
```

- [ ] **Step 6: Run API tests**

Run: `npm test -- functions/_shared/developerApi.test.ts functions/api/developer/v1/[[path]].test.ts`

Expected: PASS for authentication, scopes, paging, filters, ownership, state conflicts, validation, rate limits, and usage.

- [ ] **Step 7: Commit**

```bash
git add functions/_shared/developerApi.ts functions/_shared/developerApi.test.ts functions/api/developer/v1/[[path]].ts functions/api/developer/v1/[[path]].test.ts functions/_shared/organizationPublicationStore.ts
git commit -m "feat: add developer REST API"
```

### Task 5: Add hosted OAuth and protect the MCP server

**Files:**
- Create: `functions/_shared/developerOAuth.ts`
- Create: `functions/_shared/developerOAuth.test.ts`
- Create: `functions/.well-known/oauth-authorization-server.ts`
- Create: `functions/.well-known/oauth-protected-resource.ts`
- Create: `functions/oauth/register.ts`
- Create: `functions/oauth/authorize.ts`
- Create: `functions/oauth/token.ts`
- Create: `functions/oauth/revoke.ts`
- Modify: `functions/mcp.ts`
- Create: `functions/mcp.test.ts`
- Modify: `public/.well-known/mcp/server-card.json`

**Interfaces:**
- Produces: OAuth discovery, registration, authorization, token, refresh, and revocation routes
- Produces: `authorizeMcpRequest(env, request, scopes): Promise<DeveloperPrincipal>`
- Consumes: developer application services from Task 4

- [ ] **Step 1: Write failing OAuth tests**

```ts
it('rejects authorization without S256 PKCE', async () => {
  const response = await authorize(request({ code_challenge_method: 'plain' }))
  expect(response.status).toBe(400)
  expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe(
    'invalid_request',
  )
})

it('rotates a refresh token and invalidates the old token', async () => {
  const first = await refresh(validRefreshToken)
  expect(first.refresh_token).not.toBe(validRefreshToken)
  expect((await refresh(validRefreshToken)).error).toBe('invalid_grant')
})
```

- [ ] **Step 2: Run OAuth tests and confirm failure**

Run: `npm test -- functions/_shared/developerOAuth.test.ts functions/mcp.test.ts`

Expected: FAIL because OAuth support is absent.

- [ ] **Step 3: Implement discovery and client registration**

Publish issuer, endpoints, supported response and grant types, `S256`, token endpoint authentication methods, and supported scopes. Permit HTTPS redirect URIs plus loopback HTTP for native clients. Return a generated client secret only when the client authentication method requires it.

- [ ] **Step 4: Implement consent and token lifecycle**

Require an existing Trolley Scout member session on authorization. Present requested scopes and client name. Issue a single-use five-minute code. Issue one-hour access tokens and rotating 30-day refresh tokens. Validate exact redirect URI and PKCE verifier.

- [ ] **Step 5: Replace unauthenticated MCP calls**

Require OAuth bearer tokens for MCP POST requests. Return a `401` with `WWW-Authenticate` and protected-resource metadata when absent. Keep `initialize` and tool schemas standards-shaped after authentication.

Map the REST services into the read and campaign tools named in the design. Count one usage call per `tools/call`, not per internal service lookup.

- [ ] **Step 6: Run OAuth and MCP tests**

Run: `npm test -- functions/_shared/developerOAuth.test.ts functions/mcp.test.ts`

Expected: PASS for discovery, registration, PKCE, consent, code reuse, refresh rotation, expiry, revocation, subscription loss, scopes, tool ownership, and audit records.

- [ ] **Step 7: Commit**

```bash
git add functions/_shared/developerOAuth.ts functions/_shared/developerOAuth.test.ts functions/.well-known/oauth-authorization-server.ts functions/.well-known/oauth-protected-resource.ts functions/oauth/register.ts functions/oauth/authorize.ts functions/oauth/token.ts functions/oauth/revoke.ts functions/mcp.ts functions/mcp.test.ts public/.well-known/mcp/server-card.json
git commit -m "feat: secure Trolley Scout MCP with OAuth"
```

### Task 6: Replace publication placement with destination selections

**Files:**
- Modify: `src/business/types.ts`
- Modify: `functions/_shared/organizationPublicationStore.ts`
- Modify: `functions/_shared/organizationPublicationStore.test.ts`
- Modify: `functions/_shared/organizationPublicationFeed.ts`
- Modify: `functions/_shared/organizationPublicationFeed.test.ts`
- Modify: `src/business/PublicationComposer.tsx`
- Modify: `src/business/BusinessShell.tsx`
- Modify: `src/business/AdminPublicationReview.tsx`
- Modify: `src/business/business.css`
- Modify: `src/business/BusinessApp.test.tsx`

**Interfaces:**
- Produces: `PublicationDestination = 'marketplace' | 'window' | 'stories'`
- Produces: `PublicationDraft.destinations: PublicationDestination[]`
- Produces: destination-aware live publication queries

- [ ] **Step 1: Write failing destination tests**

```ts
it('accepts every non-empty destination combination', () => {
  expect(validatePublicationInput({
    ...draft,
    destinations: ['marketplace', 'window', 'stories'],
  }).issues).toEqual([])
})

it('rejects a publication without a destination', () => {
  expect(validatePublicationInput({ ...draft, destinations: [] }).issues).toContain(
    'Choose at least one shopper destination.',
  )
})
```

- [ ] **Step 2: Run publication tests and confirm failure**

Run: `npm test -- functions/_shared/organizationPublicationStore.test.ts functions/_shared/organizationPublicationFeed.test.ts src/business/BusinessApp.test.tsx`

Expected: FAIL because only the legacy placement exists.

- [ ] **Step 3: Add destination persistence**

Write destination rows in the same mutation flow as publication create and update. Read destination rows in batches for publication lists. Fall back to legacy placement only when no rows exist.

- [ ] **Step 4: Update consumer feed mapping**

Marketplace and Window Shopping filters read `destinations`. Keep kind rules and time/status checks.

- [ ] **Step 5: Update business and admin UI**

Replace the segmented control with three checkboxes. Add Marketplace, Window Shopping, and Stories previews. Show all selected destinations in content lists and moderation. Use current theme tokens for both colour modes.

- [ ] **Step 6: Run destination tests**

Run: `npm test -- functions/_shared/organizationPublicationStore.test.ts functions/_shared/organizationPublicationFeed.test.ts src/business/BusinessApp.test.tsx src/business/AdminPublicationReview.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/business/types.ts functions/_shared/organizationPublicationStore.ts functions/_shared/organizationPublicationStore.test.ts functions/_shared/organizationPublicationFeed.ts functions/_shared/organizationPublicationFeed.test.ts src/business/PublicationComposer.tsx src/business/BusinessShell.tsx src/business/AdminPublicationReview.tsx src/business/business.css src/business/BusinessApp.test.tsx
git commit -m "feat: add three campaign destinations"
```

### Task 7: Deliver business campaigns in Stories

**Files:**
- Modify: `src/services/dashboardStories.ts`
- Modify: `src/services/dashboardStories.test.ts`
- Modify: `functions/api/discovery.ts`
- Modify: `functions/api/discovery.test.ts`
- Modify: `mobile/lib/dashboard_stories.dart`
- Modify: `mobile/test/dashboard_stories_test.dart`

**Interfaces:**
- Consumes: live publications whose destinations contain `stories`
- Produces: business story groups and frames in web and mobile discovery payloads

- [ ] **Step 1: Write failing story mapping tests**

```ts
it('creates a business story frame only for the Stories destination', () => {
  const stories = buildDashboardStories(catalogues, deals, retailers, [businessPublication])
  expect(stories).toContainEqual(
    expect.objectContaining({
      id: 'organization:fresh-market',
      frames: expect.arrayContaining([
        expect.objectContaining({ id: 'publication:org-pub-1', kind: 'business' }),
      ]),
    }),
  )
})
```

- [ ] **Step 2: Run story tests and confirm failure**

Run: `npm test -- src/services/dashboardStories.test.ts functions/api/discovery.test.ts`

Expected: FAIL because story builders accept no business publications.

- [ ] **Step 3: Add business story records to discovery**

Fetch eligible Stories publications once during discovery. Return the fields needed by both clients without exposing private business metadata.

- [ ] **Step 4: Map business story groups in web and Flutter**

Group by organization. Use logo when available, publication image as the frame, target URL as the action, and campaign price or offer as subtitle.

- [ ] **Step 5: Run web and Flutter story tests**

Run: `npm test -- src/services/dashboardStories.test.ts functions/api/discovery.test.ts`

Run: `cd mobile && flutter test test/dashboard_stories_test.dart test/dashboard_stories_widget_test.dart`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/dashboardStories.ts src/services/dashboardStories.test.ts functions/api/discovery.ts functions/api/discovery.test.ts mobile/lib/dashboard_stories.dart mobile/test/dashboard_stories_test.dart
git commit -m "feat: publish business campaigns to Stories"
```

### Task 8: Track destination metrics and rank business content

**Files:**
- Modify: `src/business/types.ts`
- Modify: `functions/_shared/organizationPublicationStore.ts`
- Modify: `functions/_shared/organizationPublicationStore.test.ts`
- Modify: `functions/api/organization-publication-events.ts`
- Modify: `functions/api/organization-publication-events.test.ts`
- Modify: `functions/api/organization-metrics.ts`
- Modify: `src/services/apiClient.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/DashboardStories.tsx`
- Modify: `src/business/api.ts`
- Modify: `src/business/BusinessShell.tsx`
- Modify: `src/business/business.css`
- Modify: `src/business/BusinessApp.test.tsx`

**Interfaces:**
- Produces: `PublicationEvent = 'impression' | 'image_view' | 'save' | 'link_click'`
- Produces: `recordOrganizationPublicationEvent(id, destination, event)`
- Produces: `BusinessMetrics` with totals, daily rows, destination rows, and ranked publications

- [ ] **Step 1: Write failing event and report tests**

```ts
it('counts Marketplace enlargement as image_view', async () => {
  await recordOrganizationPublicationEvent(env, id, 'marketplace', 'image_view')
  expect(await metricRow(id, 'marketplace')).toMatchObject({ imageViews: 1 })
})

it('ranks the most saved publication for the selected range', async () => {
  const report = await getOrganizationMetrics(env, accountId, 7)
  expect(report.rankings.saves[0]).toMatchObject({ publicationId: 'org-pub-best' })
})
```

- [ ] **Step 2: Run metric tests and confirm failure**

Run: `npm test -- functions/_shared/organizationPublicationStore.test.ts functions/api/organization-publication-events.test.ts src/business/BusinessApp.test.tsx`

Expected: FAIL because metrics are not destination-aware and expose no rankings.

- [ ] **Step 3: Implement validated aggregate recording**

Accept event, publication ID, and destination. Confirm the publication is approved, live for that destination, and inside its date window. Upsert the matching daily row. Return `202` for accepted events and preserve privacy by storing no member ID.

- [ ] **Step 4: Instrument shopper interactions**

Send:

- `impression` when an eligible card or story frame becomes visible
- `image_view` when a Marketplace image enlargement opens
- `save` after a successful save
- `link_click` immediately before an outbound campaign link opens

Deduplicate impressions per publication and destination for the mounted view.

- [ ] **Step 5: Build range reports**

Support `days=1`, `days=7`, and `days=30`. Return totals, daily rows, destination totals, and the top 10 publications for each metric. Break ties by `updated_at DESC, id ASC`.

- [ ] **Step 6: Update Business Insights**

Use “Today”, “7 days”, and “30 days”. Show metric cards, destination totals, daily results, and top lists for viewed, saved, and clicked content. Use “Image views” for Marketplace enlargements and “Link clicks” for outbound actions.

- [ ] **Step 7: Run metric and UI tests**

Run: `npm test -- functions/_shared/organizationPublicationStore.test.ts functions/api/organization-publication-events.test.ts src/business/BusinessApp.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/business/types.ts functions/_shared/organizationPublicationStore.ts functions/_shared/organizationPublicationStore.test.ts functions/api/organization-publication-events.ts functions/api/organization-publication-events.test.ts functions/api/organization-metrics.ts src/services/apiClient.ts src/App.tsx src/components/DashboardStories.tsx src/business/api.ts src/business/BusinessShell.tsx src/business/business.css src/business/BusinessApp.test.tsx
git commit -m "feat: add business campaign performance rankings"
```

### Task 9: Publish developer documentation and run release validation

**Files:**
- Modify: `public/auth.md`
- Modify: `public/llms.txt`
- Modify: `public/.well-known/api-catalog`
- Create: `public/developers.md`
- Modify: `README.md`

**Interfaces:**
- Documents: OAuth MCP connection URL, API key creation, scopes, REST routes, errors, limits, examples, and campaign destination values

- [ ] **Step 1: Update machine-readable discovery**

Mark `/mcp` as OAuth protected. Add OAuth metadata links and developer API routes. Remove claims that MCP is unauthenticated or read-only.

- [ ] **Step 2: Write developer setup documentation**

Include:

- Subscription requirement
- MCP connection URL
- OAuth consent flow
- API-key creation and one-time display
- Bearer header example
- Scope table
- REST route table
- Campaign JSON example with all three destinations
- Error codes
- Monthly and minute limits
- Revocation instructions

- [ ] **Step 3: Run focused tests**

Run: `npm test -- src/data/memberPlans.test.ts src/data/planPricing.test.ts functions/_shared/developerAccess.test.ts functions/_shared/developerOAuth.test.ts functions/mcp.test.ts functions/api/developer-keys.test.ts functions/api/developer/v1/[[path]].test.ts functions/_shared/organizationPublicationStore.test.ts functions/_shared/organizationPublicationFeed.test.ts src/services/dashboardStories.test.ts src/business/BusinessApp.test.tsx`

Expected: PASS.

- [ ] **Step 4: Run all web and Functions checks**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 5: Run affected Flutter checks**

Run: `cd mobile && flutter test test/dashboard_stories_test.dart test/dashboard_stories_widget_test.dart test/business_app_test.dart`

Expected: PASS.

- [ ] **Step 6: Apply migration using the configured production database command**

Run: `npm run cf:migrate`

Expected: migration `0043_developer_mcp_campaign_insights.sql` applies successfully to `trolley-scout`.

- [ ] **Step 7: Run production builds**

Run: `npm run build`

Run: `cd mobile && flutter build appbundle --release --flavor business -t lib/main_business.dart`

Expected: web build and business AAB complete successfully.

- [ ] **Step 8: Commit documentation**

```bash
git add public/auth.md public/llms.txt public/.well-known/api-catalog public/developers.md README.md
git commit -m "docs: publish Trolley Scout developer access guide"
```

