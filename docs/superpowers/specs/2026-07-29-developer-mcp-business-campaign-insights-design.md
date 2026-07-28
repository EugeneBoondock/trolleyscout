# Trolley Scout Developer MCP, API, Campaign Destinations, and Business Insights

Date: 2026-07-29
Status: Approved through delegated implementation authority

## Outcome

Trolley Scout will offer a paid “Developers” subscription for programmatic shopping-data access and business campaign management.

Developers will connect compatible MCP clients through hosted OAuth. Direct developer API requests will use account-managed API keys. Both paths will apply the same plan checks, scopes, account ownership rules, usage allowance, rate limit, and audit records.

Businesses will be able to place each publication in any one or more of three shopper destinations:

- Marketplace
- Window Shopping
- Stories

Business reporting will show performance for today, the last 7 days, and the last 30 days. It will rank the business’s content by Marketplace image views, saves, link clicks, and impressions.

## Product Decisions

### Developers subscription

“Developers” is a paid member plan above “Organisation”. It includes all Organisation allowances and one approved business workspace.

Prices:

| Currency or market | Monthly | Annual |
| --- | ---: | ---: |
| ZAR | R999 | R9,990 |
| USD | $199 | $1,990 |
| EUR | €199 | €1,990 |
| GBP | £179 | £1,790 |
| Zimbabwe USD pricing | $59 | $590 |

The annual price equals ten monthly payments, matching existing Trolley Scout pricing rules.

The plan includes 25,000 authenticated developer calls per billing month. A rolling rate limit permits 120 calls per minute per account. MCP tool calls and direct API requests consume the same allowance.

Administrators may test developer features without changing their active plan. Their activity is still recorded.

### Access boundaries

Read scopes expose:

- Deal search
- Catalogue listing
- Nearby-store search
- Story listing
- Daily, weekly, and monthly shopping trends

Business scopes expose:

- Campaign listing and detail
- Draft creation and editing
- Submission for review
- Pause and resume
- Campaign results

Business tools operate only on an approved organization linked to the authenticated account. They preserve the current Trolley Scout review flow. Developers cannot approve their own publications, read another organization’s results, or bypass publication limits.

## Architecture

### Shared developer access layer

A focused server module will provide:

- Plan entitlement checks
- Scope checks
- Organization ownership checks
- Monthly allowance checks
- Per-minute rate checks
- Structured audit records
- Stable error responses

MCP tools and REST endpoints will call the same application services. This prevents access rules or response behaviour from drifting between the two transports.

### Hosted MCP OAuth

The existing `/mcp` Cloudflare Pages endpoint will become an authenticated Streamable HTTP MCP server.

Public discovery routes will include:

- OAuth protected-resource metadata
- OAuth authorization-server metadata
- Dynamic client registration for compatible MCP clients
- Authorization endpoint
- Token endpoint

OAuth uses authorization-code flow with PKCE. The user signs in through the existing Trolley Scout member session, reviews the requested scopes, and grants access.

Authorization codes are single use and short lived. Access tokens expire after one hour. Refresh tokens expire after 30 days and rotate on every use. Tokens, codes, and client secrets are stored as SHA-256 hashes. Plain secrets are returned only at issuance.

Revoked, expired, downgraded, banned, or over-limit accounts receive a standards-shaped OAuth or MCP error. A plan downgrade immediately blocks new MCP calls while leaving the user’s Trolley Scout account intact.

### Developer API keys

The account area will have a Developer section available to Developers subscribers and administrators.

Users may create named API keys with:

- Selected read and business scopes
- Optional expiry
- Last-used timestamp
- Creation timestamp
- Revocation control

Keys use a recognisable `ts_dev_` prefix followed by cryptographically random bytes. Only the key prefix and SHA-256 hash are stored. The complete secret is shown once after creation.

API requests accept `Authorization: Bearer <key>`. Query-string keys are rejected to reduce accidental logging. A user session or an API key cannot be used to create another API key through a public developer endpoint.

### Developer REST API

Versioned endpoints will live under `/api/developer/v1`.

Initial read endpoints:

- `GET /deals`
- `GET /catalogues`
- `GET /stores/nearby`
- `GET /stories`
- `GET /trends`

Initial campaign endpoints:

- `GET /campaigns`
- `GET /campaigns/:id`
- `POST /campaigns`
- `PATCH /campaigns/:id`
- `POST /campaigns/:id/submit`
- `POST /campaigns/:id/pause`
- `POST /campaigns/:id/resume`
- `GET /campaigns/:id/results`

Pagination uses opaque cursors. List responses include count and next cursor. Validation failures return field issues. Authentication, scope, allowance, rate, ownership, and server failures use stable error codes with request IDs.

## MCP Tools

The authenticated MCP server exposes:

Read tools:

- `search_deals`
- `list_catalogues`
- `nearby_stores`
- `list_stories`
- `get_trends`

Business tools:

- `list_campaigns`
- `get_campaign`
- `create_campaign_draft`
- `update_campaign_draft`
- `submit_campaign`
- `pause_campaign`
- `resume_campaign`
- `get_campaign_results`

Tool schemas match the developer API input rules. MCP results return structured content plus readable text. Write tools state the resulting campaign status and available next actions.

## Campaign Destinations

The current single `placement` value cannot represent all combinations of Marketplace, Window Shopping, and Stories. A publication-destination table will become the source of truth.

Each publication must select at least one destination. Existing data will be backfilled:

- `marketplace` becomes Marketplace
- `window` becomes Window Shopping
- `both` becomes Marketplace and Window Shopping

The existing placement column remains during the transition for safe rollback and older code paths. New reads use destination records first and fall back to the legacy value when records are absent.

The business composer will use three checkboxes and matching previews. It will support light and dark themes with the current design tokens.

Approved, live publications selected for Stories will be mapped into the dashboard story feed. Each business becomes a story group, and each eligible publication becomes a story frame. Time windows, sold-out state, organization status, and review status remain enforced.

## Business Measurement

### Definitions

- Impression: an eligible publication card or story frame was displayed.
- Image view: a shopper enlarged the publication image in Marketplace.
- Save: a shopper saved the publication.
- Link click: a shopper opened the campaign’s outbound destination.

The client sends the publication ID, destination, and event name. The server validates that the publication is approved and visible for the stated destination before incrementing an aggregate.

The reporting table stores daily totals by publication and destination. It does not store shopper identity.

### Reporting

The business Insights page will offer:

- Today
- Last 7 days
- Last 30 days

It will show:

- Total impressions
- Marketplace image views
- Saves
- Link clicks
- Rates calculated against impressions
- Destination breakdown
- Daily activity
- Top publications for each metric

Reports are restricted to the authenticated organization. Rankings use the selected period and deterministic tie-breaking by publication update time and ID.

## Data Records

New records cover:

- OAuth clients
- OAuth authorization codes
- OAuth access tokens
- OAuth refresh tokens
- Developer API keys
- Developer call usage and audit data
- Publication destinations
- Daily publication metrics by destination

Token and key tables store hashes rather than reusable secrets. Foreign keys link credentials and usage to member accounts. Cleanup removes expired authorization codes and expired or revoked tokens after a retention window.

Usage records store request ID, account ID, credential type, operation, outcome, status code, and timestamp. Tool arguments and response bodies are excluded to avoid retaining campaign content or location searches unnecessarily.

## Error Handling

Security-sensitive failures do not reveal whether another account, campaign, key, or token exists.

Developer API responses use:

- `401` for missing or invalid credentials
- `402` for an inactive Developers subscription or exhausted monthly allowance
- `403` for missing scopes
- `404` for resources outside the caller’s business
- `409` for invalid campaign state transitions
- `422` for field validation
- `429` for per-minute rate limits
- `500` with a request ID for unexpected failures

MCP converts the same failures into JSON-RPC errors and tool results where appropriate. OAuth endpoints use OAuth error names and `WWW-Authenticate` metadata.

## Validation

Automated checks will cover:

- Developers pricing and checkout
- Plan changes and admin access
- OAuth discovery, registration, PKCE, consent, token exchange, refresh rotation, expiry, and revocation
- API-key creation, one-time display, hash storage, scope checks, expiry, and revocation
- Shared monthly allowance and per-minute rate limit
- Request and tool audit records
- Read endpoint filtering and pagination
- Campaign ownership and state transitions
- Destination backfill and every destination combination
- Marketplace, Window Shopping, and Stories delivery
- Image-view, save, click, and impression counting
- Today, 7-day, and 30-day business reports
- Light and dark business and developer screens

Build validation will include TypeScript, unit tests, production web build, Flutter tests affected by story and campaign changes, and business Android release build when mobile code changes.

## Rollout

1. Apply schema changes.
2. Backfill publication destinations.
3. Deploy shared access services and developer API routes.
4. Deploy OAuth discovery and MCP authentication.
5. Release the Developers subscription and account controls.
6. Release three-destination business publishing and Stories delivery.
7. Release event tracking and business reporting.
8. Monitor authentication failures, rate-limit responses, usage totals, and campaign event volume.

The old unauthenticated MCP tools will stop accepting calls once OAuth is released. Discovery metadata stays public so compatible clients can begin authorization.
