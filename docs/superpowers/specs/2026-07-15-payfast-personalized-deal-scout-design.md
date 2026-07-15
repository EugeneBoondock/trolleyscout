# PayFast, Personalised Deal Scout, Catalogues, and Product Images

Status: Approved

Date: 15 July 2026

## Purpose

Trolley Scout will add paid subscriptions through PayFast Onsite, learn deal interests for signed-in users, scout verified public retailer sources on a schedule, discover retailers outside the current static list, read official retailer catalogues, and display locally cached product images.

The work must preserve the current Pages application, Cloudflare D1 database, saved-deal data, basket data, and the last good deal snapshots.

## Product Decisions

### Plans and Prices

| Plan | Monthly | Annual | Saved deals | Saved sources | Basket items |
| --- | ---: | ---: | ---: | ---: | ---: |
| Free | R0 | R0 | 10 | 10 | 15 |
| Scout | R29 | R290 | 100 | 100 | 150 |
| Household | R59 | R590 | 250 | 250 | 400 |

Annual billing gives close to two months free. The existing plan names and limits remain unchanged. Personalised deal learning is available to all signed-in users and is not reserved for a paid plan.

### Payment Experience

Paid-plan buttons open PayFast Onsite inside the current page. The browser must not navigate away for normal checkout. Users can choose monthly or annual billing before opening the modal.

The browser callback only reports that the modal completed or closed. It never activates a plan. Plan state changes only after the server accepts a verified PayFast Instant Transaction Notification, called an ITN.

### Learning Experience

Learning starts only after authentication. It records submitted searches and high-value deal actions. It does not record each key press.

Account settings provide:

- A “Deal learning” switch.
- A list of recent learning activity.
- Removal of one activity entry.
- A “Clear learning history” action.

Deal cards may show plain-language reasons such as “Based on your coffee searches” or “You often save baby products”.

## Considered Approaches

### Selected: Cloudflare-Native Scout

Keep the application, data, scheduled work, media, document conversion, and browser fallback on Cloudflare. Use Brave Search only to locate possible official retailer URLs. This approach fits the deployed stack, supports scheduled work and catalogue processing, and keeps operating budgets explicit.

### Rejected: Deterministic Parsers Only

HTML, JSON, and plain PDF text parsers would cost less, but they would miss many JavaScript-heavy sources, scanned catalogues, and product images. This does not meet the catalogue requirement.

### Rejected: Managed Crawling Vendor

A hosted crawling and document vendor could reduce some parser work, but it would add another data processor, a larger recurring cost, and a hard provider dependency. The selected Cloudflare path can meet the first release requirements with bounded optional AI work.

## Technical Shape

### Cloudflare Services

- Cloudflare Pages serves the React application and request APIs.
- The existing D1 database stores billing, activity, source, scout, catalogue, and normalized deal records.
- A separate Worker named `trolley-scout-scout` runs scheduled jobs and shares the D1 database.
- An R2 bucket stores retailer images, original catalogue files, catalogue page images, and derived crops.
- Workers AI converts supported PDF documents to Markdown and provides structured vision output for image-based catalogue content.
- Browser Rendering handles JavaScript-heavy retailer pages and catalogue page captures when direct HTTP fetching is insufficient.
- Brave Search supplies transient candidate URLs for new retailer discovery. Retailer facts and deals are fetched again from official public sources before storage.

### Release Stages

1. Provider-neutral billing schema, PayFast server flow, ITN handling, prices, and the Onsite modal.
2. Signed-in activity capture, interest scoring, explanations, history controls, and personalised ranking.
3. Normalized image fields, R2 media storage, safe image fetching, and deal-card images.
4. Scheduled Worker, dynamic retailer sources, demand-prioritized refreshes, and candidate discovery.
5. Catalogue discovery, PDF conversion, structured deal extraction, and catalogue images.
6. End-to-end checks, sandbox payments, production secrets, deployment, and live checks.

Each stage must pass its automated checks before the next stage is enabled in production.

## Billing Design

### Server-Owned Plan Catalogue

Prices, billing frequencies, PayFast item names, and plan limits live in one server-owned plan catalogue. The browser can display this catalogue but cannot provide trusted payment amounts.

The supported paid price points are:

- Scout monthly: R29, frequency `3`, recurring amount R29.
- Scout annual: R290, frequency `6`, recurring amount R290.
- Household monthly: R59, frequency `3`, recurring amount R59.
- Household annual: R590, frequency `6`, recurring amount R590.

Recurring checkout uses subscription type `1` and cycles `0`. PayFast recurring subscriptions use card payments.

### Onsite Session

`POST /api/subscription/checkout` requires an authenticated member and accepts only a plan identifier plus a billing cycle. The server:

1. Looks up the trusted amount and frequency.
2. Creates an internal billing attempt with a random reference.
3. Builds and signs the PayFast request using server secrets.
4. Requests an Onsite UUID from the correct sandbox or live PayFast endpoint.
5. Stores the attempt and returns only the UUID, public engine URL, plan identifier, billing cycle, and expiry.

The client loads the PayFast engine script once and calls the Onsite function with the UUID. Closing the modal leaves the existing plan untouched.

### ITN Processing

`POST /api/payfast/itn` accepts form-encoded PayFast notifications. Processing must:

1. Parse the exact submitted fields.
2. Verify the signature with the server passphrase.
3. Verify the configured merchant identifier.
4. Confirm the notification through PayFast’s server validation endpoint.
5. Compare the amount, currency, plan, cycle, and internal attempt against the server-owned catalogue.
6. Reject unknown attempts, mismatched values, stale requests, and malformed data.
7. Record the provider payment identifier and payload hash before applying an account change.
8. Treat repeated notifications as successful no-ops.
9. Activate or renew only on a confirmed completed status.

Return and cancel URLs display status only. They never act as proof of payment.

### Billing Storage

New provider-neutral records replace Stripe-specific assumptions:

- `billing_subscriptions` stores member, provider, plan, cycle, status, provider token, billing dates, and cancellation state.
- `billing_attempts` stores checkout references, trusted amounts, Onsite UUID state, and expiry.
- `billing_events` stores unique provider event identifiers, payload hashes, validation state, and processing results.

Existing Stripe columns remain during the safe transition, but new code does not write to them. A later migration can remove them after production verification.

No card number, CVV, or full payment instrument data is accepted or stored by Trolley Scout.

### Secrets

The live merchant key and security passphrase shown in chat are considered exposed and must be rotated before live billing is enabled.

The Worker and Pages environments use encrypted secrets for:

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_MODE`
- `BRAVE_SEARCH_API_KEY`

No secret value appears in source control, application JavaScript, logs, or API responses.

## Signed-In Deal Learning

### Captured Events

Authenticated activity endpoints accept these event types:

- `search_submitted`
- `deal_opened`
- `deal_saved`
- `basket_added`
- `retailer_opened`

A search is recorded after explicit submission or a short settled delay, contains at least three meaningful characters, and is normalized before storage. Authentication, billing, and free-form account fields are never included.

### Storage and Retention

- `user_deal_activity` stores the member, event type, normalized terms or entity identifiers, and event time.
- `user_interest_weights` stores explainable weights for category, brand, retailer, and common product terms.
- Raw activity expires after 90 days through scheduled cleanup.
- Interest weights decay over time so old behaviour matters less.
- Disabling learning stops new events immediately.
- Clearing history deletes both raw activity and derived weights in one transaction.

### Ranking

The ranking score combines:

- Existing deal quality and saving score.
- Freshness and current validity.
- Category interest.
- Brand interest.
- Retailer interest.
- Repeated saved-deal and basket signals.

Saving a deal or adding it to the basket counts more than opening a result. A search counts less than either action. The API returns the top reason used for each personalised result, allowing the user interface to explain the ordering.

The default public deal ordering remains available when a member has no activity or disables learning.

## Scheduled Deal Scout

### Source Registry

The fixed retailer identifier union changes to a flexible string identifier backed by D1 retailer metadata. Existing identifiers remain stable.

`retailer_sources` stores:

- Retailer name, slug, logo, and official domain.
- Source URL and source type.
- Parser type and parser settings.
- Source status: candidate, verified, paused, or failed.
- Last success, last failure, consecutive failures, and next run.
- Crawl interval, request budget, and validation notes.

The application reads retailer labels and images from API metadata so a new verified retailer can appear without a front-end release.

### Scheduled Runs

The scheduled Worker runs every six hours. A D1 lease prevents overlapping runs. Each invocation has a bounded source count, request count, response size, and wall-clock budget.

Priority is calculated from:

1. Expired or stale verified sources.
2. High signed-in demand categories.
3. Sources with a good reliability record.
4. Candidate sources awaiting validation.

Jobs retry temporary failures with delay. A parser failure never deletes the last good snapshot. Repeated failures pause a source for review and record the reason.

### New Retailer Discovery

New-source discovery runs daily and uses three inputs:

- A maintained seed list of South African retailers and official catalogue pages.
- Shop suggestions submitted by signed-in users.
- Brave Search candidate URLs generated from popular category buckets and South African retail terms.

Raw personal search history is not sent to Brave. The discovery query uses a category label such as “coffee” or “baby products”, contains no member identifier, and is used only to locate possible official sources.

The first release caps Brave discovery at 20 searches per day. If the API key is absent or the budget is reached, verified source refreshes and seed candidates continue normally.

A candidate becomes verified only when:

- Its domain is an official retailer domain.
- Requests respect the site’s public access rules, robots instructions, and reasonable rate limits.
- A parser finds stable product names and valid South African rand prices.
- Dates and evidence are recorded where the source provides them.
- Repeated validation runs produce consistent output.

No login walls, anti-bot barriers, private APIs, or access controls are bypassed.

## Deal Records and Evidence

HTML, JSON, and catalogue pipelines write to one `deal_records` table. A record contains:

- Retailer and source identifiers.
- Product title, normalized product key, brand, category, and size.
- Current price, prior price, saving, and unit price when available.
- Start date, end date, first seen, last seen, and last verified.
- Product URL, source URL, catalogue identifier, and catalogue page when applicable.
- Image asset identifier and image origin type.
- Extraction method, confidence, and evidence text.

A unique source key makes refreshes idempotent. Historical price rows are retained separately for later price-history features. The existing snapshot table remains a fast response cache and is rebuilt from validated normalized records.

Deals without enough evidence remain candidate records and do not appear in the public feed.

## Catalogue Processing

### Discovery and Storage

The source scout detects PDF links and catalogue viewer pages on official retailer domains. It records the advertised validity period when available, downloads the PDF with size and content-type limits, computes a checksum, and stores one original copy in R2.

`catalogues` stores retailer, official source URL, R2 key, checksum, validity dates, processing state, page count when available, and errors. An unchanged checksum is not processed twice.

### Text Extraction

Workers AI PDF-to-Markdown conversion provides the first text pass. Deterministic parsers identify currency values, prior prices, multibuy patterns, product names, units, page markers, and validity text.

Structured vision is used only for pages whose text is missing or cannot be mapped reliably. Vision output follows a strict JSON schema and remains a candidate until server checks confirm:

- A valid rand price.
- A plausible product title.
- A catalogue page reference.
- A retailer and catalogue source.
- A validity period or a clearly marked unknown date.

No generated product fact is published without source evidence.

### Catalogue Images

The image path follows this order:

1. Use an official product image linked by the retailer page.
2. Extract an embedded raster product image from the PDF when one maps safely to the deal.
3. Use a validated product crop from a rendered catalogue page.
4. Use a catalogue page thumbnail when an exact product crop is not reliable.
5. Fall back to the standard neutral product placeholder.

Catalogue page captures and crops retain retailer, catalogue, page, and source URL metadata. A catalogue image is labelled as such in the user interface.

## Media Pipeline

Remote images are downloaded server-side only from verified source domains. The fetcher enforces:

- HTTPS.
- Public, non-local addresses after DNS resolution.
- Redirect limits.
- Image content-type checks.
- Byte and dimension limits.
- Timeouts.
- Rejection of active formats that could execute script.

Accepted images are normalized to safe web formats, hashed, stored once in R2, and served through a cached media route. Source URL, copyright source, content hash, dimensions, and fetch time are stored in `media_assets`.

The app never depends permanently on retailer hotlinks. A failed image fetch does not remove the deal.

## API Changes

### Billing

- `GET /api/subscription` returns plan, billing cycle, prices, current status, and limits.
- `POST /api/subscription/checkout` creates a PayFast Onsite session.
- `POST /api/payfast/itn` verifies and processes PayFast notifications.

### Learning

- `POST /api/activity` records an allowed authenticated event.
- `GET /api/activity` returns recent activity and learning status.
- `DELETE /api/activity/:id` removes one event and rebuilds affected weights.
- `DELETE /api/activity` clears all learning history.
- `PATCH /api/preferences` enables or disables deal learning.

### Sources and Deals

- `POST /api/sources/suggest` accepts an authenticated shop name or public URL.
- `GET /api/retailers` returns dynamic verified retailer metadata.
- `GET /api/discovery` accepts a personalised flag for authenticated requests and returns image data, evidence, and ranking reasons.
- `GET /api/media/:key` serves validated cached media with immutable cache headers where appropriate.

Every write route uses existing session authentication, origin checks, request-size limits, validation, and rate limits.

## User Interface

### Subscriptions

- Show prices directly on plan cards.
- Add a monthly or annual selector.
- Show annual savings in plain language.
- Disable the active plan button.
- Open PayFast Onsite without a page redirect.
- Show “Waiting for payment confirmation” after modal completion and poll account status for a limited period.
- Show useful close, failure, and timeout messages without claiming payment success.

### Deals

- Add a consistent image area to deal cards and basket items.
- Use a neutral surface behind product images in both light and dark themes.
- Show retailer, catalogue, validity, and evidence labels.
- Add a “For you” section for signed-in members with enough activity.
- Show one short ranking reason.
- Mark newly added retailers without making them look less trustworthy than existing verified retailers.

### Account Settings

- Add deal-learning controls and recent activity.
- Add individual removal and clear-history confirmation.
- Explain that learning affects ordering and scouting priorities.

All new controls must have keyboard access, visible focus, readable labels, suitable contrast, and correct light and dark theme tokens.

## Failure Behaviour

- PayFast modal close: keep the current plan and show a neutral message.
- Missing or late ITN: keep the account pending and allow a status refresh.
- Invalid ITN: record a safe diagnostic result and make no account change.
- Duplicate ITN: return success without repeating the account update.
- Retailer fetch failure: serve the last good snapshot.
- Parser drift: mark the run failed, retain existing deals, and pause after repeated failures.
- Catalogue conversion failure: retain the source and original file for a later retry.
- Image failure: use the placeholder and keep the deal visible.
- Brave outage or missing key: skip open-web candidate discovery and continue verified source refreshes.
- Workers AI or Browser Rendering budget reached: pause costly catalogue work and continue deterministic sources.

## Security, Privacy, and Cost Controls

- Only signed-in member identifiers are attached to activity.
- Personal activity is never exposed in public deal responses.
- Discovery uses category buckets instead of raw member histories.
- Activity deletion is immediate and transactional.
- Payment secrets use encrypted Cloudflare secrets.
- Payment logs redact signatures, keys, passphrases, tokens, and personal fields.
- Media fetching blocks local network access and unsafe redirects.
- Source fetchers use declared limits and respectful request rates.
- Scheduled jobs have daily budgets for search, AI, browser use, bytes, and source count.
- A usage table records budget consumption and causes optional work to stop cleanly at its cap.

## Verification Strategy

### Automated Tests

- PayFast signature creation and verification fixtures.
- Monthly and annual server-owned price checks.
- Onsite session authentication and validation.
- Valid, invalid, mismatched, stale, and duplicate ITN cases.
- No plan activation from return URLs or modal callbacks.
- Learning disabled, event capture, retention, deletion, and clear-history cases.
- Interest scoring, weight decay, and explanation selection.
- Dynamic retailer serialization and existing identifier compatibility.
- Scheduled lease, retry, pause, budget, and idempotency cases.
- HTML, JSON, and PDF catalogue fixtures.
- Image allow-list, redirect, size, type, cache, and fallback cases.
- Light and dark theme component checks.

### Release Checks

- Run the repository verification command after every stage.
- Apply D1 migrations locally before applying them remotely with the configured Cloudflare account.
- Run PayFast sandbox monthly and annual subscriptions through the Onsite modal.
- Confirm that only a valid sandbox ITN changes the plan.
- Trigger the scheduled Worker manually and confirm normalized deals and snapshots.
- Process at least one text PDF and one image-heavy official catalogue fixture.
- Confirm images are served from Trolley Scout storage and fall back safely.
- Verify desktop and mobile subscription, deal, account, light, and dark views.
- Deploy, then check the production health endpoint, public deal feed, authenticated learning controls, and subscription modal.

## Acceptance Criteria

The work is complete when:

- Prices and monthly or annual billing are visible for Scout and Household.
- A signed-in user can open PayFast Onsite without leaving the page.
- A plan changes only after a valid, amount-matched, idempotent PayFast ITN.
- Signed-in users receive explainable personalised ordering and can disable or clear learning.
- A scheduled job refreshes known sources without relying on a page visit.
- The source registry can add a verified retailer without a front-end deployment.
- Candidate discovery can find new official retailer sources within its daily budget.
- Deal cards show cached official product images or safe catalogue images with a fallback.
- An official PDF catalogue can produce candidate deals, evidence, validity data, and image references.
- Failed refreshes preserve the last good public data.
- New user interface elements work in light and dark themes and meet keyboard and contrast expectations.
- Automated checks, sandbox payment checks, migration checks, deployment, and production checks pass.

## Deferred Work

These items are outside this release:

- Multiple Household member profiles and invitations.
- Push, email, or WhatsApp deal alerts.
- Automated purchasing or retailer account login.
- Historical price charts in the user interface.
- Native mobile applications.

The schema may retain room for these features without shipping unfinished user interface controls.

## Research References

- [PayFast Onsite and ITN documentation](https://developers.payfast.co.za/docs/itn-instant-transaction-notification/)
- [PayFast subscription support](https://payfast.io/features/subscriptions/)
- [PayFast fees](https://payfast.io/fees/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/)
- [Cloudflare Images binding](https://developers.cloudflare.com/images/optimization/binding/)
- [Cloudflare Workers AI PDF support](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/supported-formats/)
- [Cloudflare Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Cloudflare Browser Rendering API](https://developers.cloudflare.com/api/resources/browser_rendering/)
- [Brave Search API pricing](https://api-dashboard.search.brave.com/documentation/pricing)
