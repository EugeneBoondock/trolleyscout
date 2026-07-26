# Trolley Scout for Business

Date: 2026-07-26

## Product decision

Trolley Scout will have two products with one shared service:

- Trolley Scout helps shoppers discover, compare, save, and browse offers.
- Trolley Scout for Business helps approved businesses publish, schedule, manage, and measure their content.

The business web product will live at `org.trolleyscout.co.za`. It will use the existing repository, Cloudflare Pages project, D1 database, member accounts, organization approval gate, and brand tokens. Its interface and navigation will be separate from the shopper shell.

A later Android app named Trolley Scout for Business will use the same API contracts and task structure. It will be a separate app listing and app package. It will not expose a business mode inside the shopper app.

## Approaches considered

### Dedicated shell in the current repository

This is the selected approach. The hostname chooses either the shopper shell or the business shell at startup. Shared account, API, type, validation, brand, and testing code stays in one place. The two interfaces remain focused on different jobs.

### Separate business web repository

This gives the business product an independent release path. It also duplicates account work, API clients, brand tokens, test setup, and deployment configuration. That cost is not justified for the first release.

### Business mode inside the shopper app

This is the fastest route to a few forms. It creates crowded navigation and makes store staff work inside a product designed for browsing. It also weakens the two-product message. This approach is rejected.

## Phase one scope

Phase one delivers the business web portal and the publishing service behind it.

Included:

- Business sign-in and organization access states
- Organization profile and locations
- Deals, specials, promotions, and posts
- Drafts, previews, scheduling, review, publishing, pausing, expiry, and archiving
- Placement in the shopper Marketplace, Window Shopping, or both
- Image upload and image library
- Content list with filters and direct actions
- Aggregate views, opens, saves, and outbound visits
- Light and dark themes
- Responsive desktop, tablet, and phone layouts
- Admin review support
- Plan limit display and enforcement

Deferred:

- Trolley Scout for Business on Android
- Video upload and video processing
- Bulk catalogue import
- Point of sale connections
- Staff invitations and role management
- Automated campaign advice
- Custom reports and data export

The data model will retain creator fields so staff roles can be added later without replacing publication history.

## Audience and jobs

The first release serves an owner, marketing manager, or store manager who needs to:

1. Publish an offer quickly.
2. See exactly where it will appear.
3. Know whether it is in draft, under review, scheduled, live, paused, or finished.
4. Correct a price, end date, location, or sold-out state.
5. See whether shoppers viewed, saved, or opened the offer.

The default path should take an approved business from the overview to a submitted deal in under three minutes.

## Access states

The hostname opens the business shell first. The shell then reads the member session and organization gate.

- Signed out: focused business sign-in with a link to create a member account.
- No application: short explanation and the existing organization application form.
- Pending application: review status, submitted details, and support path.
- Rejected application: review note and a new application action.
- Approved and active: portal access.
- Suspended: access notice and support action.

The current session cookie is host-only. A user signs in on the business hostname even if they already signed in on the shopper hostname. Both hostnames still use the same account and password.

## Information architecture

Desktop navigation uses a stable left rail and a compact top bar.

- Overview
- Content
- Create
- Locations
- Insights
- Account

The top bar shows the organization name, active location filter, theme control, account menu, and a strong “Create” action.

Phone navigation uses five destinations:

- Overview
- Content
- Create
- Insights
- More

“More” contains locations, organization profile, billing, theme, support, and sign out.

The phone layout is also the task model for the later Android business app.

## Visual direction

Reading this as: an operational product for busy store teams, with the existing South African specials-insert identity made calmer and denser for repeated daily work.

- Design variance: 4
- Motion intensity: 3
- Visual density: 6

The current cream, ink, yellow, red, green, Anton display face, body font, radii, and Phosphor icons remain the design language. The business shell uses less paper texture and fewer heavy borders than the consumer marketing pages.

Light mode uses cream page backgrounds, pale surfaces, dark text, and yellow primary actions. Dark mode uses the existing warm dark surfaces, light text, and the same yellow action color. Status colors never carry meaning without text or an icon.

Large display type is reserved for page titles and empty states. Forms, tables, filters, and metrics use the body face for scanning speed. Cards are used for grouped actions and summaries. Long content collections use a responsive list on desktop and action cards on phone.

Motion is limited to route fades, drawers, status feedback, upload progress, and preview changes. Every motion has a reduced-motion form.

## Overview

The overview answers three questions in order:

1. What needs attention?
2. What is live now?
3. How is current content performing?

The top section contains:

- A greeting with the organization and current location scope
- A “Create publication” action
- An action-required panel for requested changes, expiring content, sold-out items, or missing profile details

The next section shows:

- Live publications
- Scheduled publications
- Drafts
- Plan use, shown as active publications out of the allowed total

The lower section shows recent publication results and recent activity. Empty organizations receive a setup checklist for profile, first location, and first publication.

## One publication model

Deals, specials, promotions, and posts use one publication record with a `kind` field. This keeps lifecycle, review, placement, media, location, and reporting behavior consistent.

### Deal

A product or service with a current selling price. Price, currency, date window, destination, and at least one image are required. A previous price is optional.

### Special

A limited offer such as a multibuy, percentage saving, bundle, or member price. The editor reveals fields that match the selected offer format.

### Promotion

A campaign, voucher, launch, event, or broad store offer. A promotion may carry a coupon code and optional price details.

### Post

An arrival, story, announcement, event update, or shopping idea. Posts are designed for Window Shopping and may link to the business site. They do not require price fields.

Commercial publications count toward the existing active publication allowance. The first release treats the current “25 live promos” allowance as 25 live deals, specials, promotions, or posts.

## Publication composer

Creation is a focused page with a live consumer preview beside the form on wide screens. On phone, preview opens as a full-screen sheet.

The editor follows this order:

1. Choose deal, special, promotion, or post.
2. Add title, description, and images.
3. Add kind-specific price or offer details.
4. Choose the destination link.
5. Choose Marketplace, Window Shopping, or both.
6. Choose all locations or selected locations.
7. Set start and end times.
8. Review the consumer preview.
9. Save draft or submit for review.

The preview can switch between Marketplace and Window Shopping when both are selected. It renders the same display component and field mapping used by the shopper surfaces.

Drafts save after a short idle period and expose an explicit save action. The header reports “Saving”, “Saved”, or a recovery message. Navigation warns before leaving unsaved work.

Image rules:

- JPEG, PNG, or WebP
- Maximum 8 MB per image
- Up to six images per publication
- Required alternative text
- First image is the cover
- Reordering and removal supported
- Clear upload progress and retry

## Publication lifecycle

The allowed states are:

- Draft
- Submitted
- Changes requested
- Scheduled
- Live
- Paused
- Expired
- Rejected
- Archived

Every first-release submission is reviewed before it can become scheduled or live. This protects shopper trust and matches the current source-backed product position.

An approved item becomes live at its start time and expires at its end time. A business can pause a live item, resume it before expiry, mark it sold out, duplicate it into a new draft, or archive it. Changes to price, offer terms, destination, media, or date window return a live item to review. Copy fixes that do not change the offer may use the same review path in phase one for predictable behavior.

Shopper queries enforce approved start and end times even if a background job is delayed. The hourly worker also advances scheduled and expired records so business status lists stay current.

The interface explains the next step beside every state. It does not leave the user to decode color alone.

## Content workspace

The content page has saved status tabs:

- All
- Action needed
- Drafts
- Scheduled
- Live
- Finished

Search and filters cover content kind, location, placement, and date. Each row shows cover image, title, kind, placement, locations, state, date window, and recent result.

Direct actions are state-aware:

- Edit
- Preview
- Duplicate
- Submit
- Pause or resume
- Mark sold out
- Archive

Archive and destructive state changes require confirmation. Reversible changes provide an undo action when safe.

## Organization profile and locations

The profile stores:

- Public business name
- Logo
- Category
- Description
- Website
- Contact phone and email
- Default destination link
- Default publication location scope

Locations store:

- Location name
- Address
- City or town
- Province or region
- Country
- Map coordinates
- Store link
- Active or closed state

One organization may have several locations under one public profile. The existing one-profile allowance remains respected. Closing a location removes it from new publication choices and does not delete past reporting.

## Shopper delivery

Approved business content enters the existing shopper APIs through one mapping layer.

- Marketplace receives deal, special, and promotion records placed there.
- Window Shopping receives every record placed there, including posts.
- Content placed in both appears once per surface with the same publication identifier.
- Expired, paused, rejected, archived, and sold-out content is excluded or labelled according to the shopper surface rules.

Business content displays the organization name and a clear “Business post” source label. It is not labelled “Sponsored” unless the business separately pays to boost it through the advertising system.

The mapping preserves existing consumer sorting, saving, comments, outbound tracking, country rules, and location filters.

## Insights

Insights show real aggregate activity only:

- Impressions
- Detail opens
- Saves
- Outbound visits
- Save rate
- Open rate

The default range is the last 30 days, with 7-day and 90-day options. The overview shows totals and change against the previous matching period. The publication detail shows daily activity and location results when enough activity exists.

No shopper identity, email, or individual behavior is exposed to businesses. Very small location groups can be rolled into the organization total.

## Data model

New D1 tables:

- `organization_members`
- `organization_profiles`
- `organization_locations`
- `organization_publications`
- `organization_publication_media`
- `organization_publication_locations`
- `organization_publication_events_daily`
- `organization_publication_reviews`

The existing organization owner is backfilled as an owner member. Phase one reads only the owner permission in the UI. The membership table keeps later staff support possible.

Publication records store kind, state, placement, content, price fields, offer fields, schedule, destination, creator, reviewer, timestamps, and sold-out state. Location and media joins preserve order and allow several records.

Media files use a Cloudflare R2 binding named `MEDIA`. D1 stores metadata and stable application URLs. The media endpoint validates ownership, file size, type, and publication limits before storing an object.

## API surface

The current flat Pages Functions naming style remains:

- `GET /api/organization`
- `PATCH /api/organization`
- `GET, POST, PATCH /api/organization-locations`
- `GET, POST, PATCH, DELETE /api/organization-publications`
- `POST, DELETE /api/organization-media`
- `GET /api/organization-metrics`
- `GET, PATCH /api/admin/organization-publications`

Every business route reads the signed-in account, active organization, membership, and required permission on the server. Organization identifiers supplied by the browser never grant access.

Write requests use explicit methods, bounded bodies, server-side validation, and private no-store responses. Repeated submit, pause, resume, and review actions are safe to retry.

## Failure and recovery behavior

- Session loss preserves a local draft and opens sign-in.
- Network failure keeps entered content and offers retry.
- Upload failure leaves successful images in place and retries only failed images.
- Review conflict reloads the latest server record before another decision.
- Plan limit errors identify which live publication must be paused or archived.
- Validation errors appear beside the field and in a linked summary.
- Empty, loading, unavailable, and permission states have a clear next action.
- Server failures never claim that a publication was saved, reviewed, or published.

## Accessibility and responsive rules

- WCAG AA text and control contrast in both themes
- Keyboard access for every action
- Visible focus states
- Semantic headings, navigation, forms, tables, and status regions
- Minimum 44 by 44 pixel touch targets
- Field errors connected to inputs
- Alternative text required for publication images
- Reduced motion support
- Layout support from 320 pixels upward
- Large text support without hidden actions or clipped navigation

Desktop keeps the preview beside the composer. Tablet collapses the rail and moves preview into a drawer. Phone uses a single-column form, sticky save actions, and a full-screen preview.

## Security and trust

- Organization ownership is checked on every request.
- Publication text is stored as plain text.
- Destination URLs must use HTTPS.
- File signatures and declared media types must agree.
- Media filenames are generated by the server.
- Review decisions record reviewer and timestamp.
- Event collection accepts only known publication and event pairs.
- Rate limits apply to submission, upload, and event routes.
- Archived records remain available to the owner and are excluded from shopper delivery.

## Testing

Store and API tests cover:

- Organization ownership and suspension
- Publication validation by kind
- State transition rules
- Scheduling and expiry
- Plan limits
- Location access
- Media ownership and limits
- Review permissions
- Shopper feed mapping
- Event aggregation and privacy rules

UI tests cover:

- Every access state
- Draft recovery
- Conditional composer fields
- Preview parity
- Content filters and actions
- Light and dark themes
- Keyboard operation
- Compact phone, tablet, and desktop layouts
- Loading, empty, error, and retry states

Release verification runs the existing test, lint, build, and function typecheck commands. Browser checks cover the real business hostname behavior and both shopper delivery surfaces.

## Delivery order

1. Add the organization publication, location, member, review, event, and media data stores.
2. Add ownership checks, validators, and business APIs.
3. Replace the organization hostname redirect with the business shell and access gates.
4. Build overview, profile, and location setup.
5. Build content workspace, composer, upload, preview, and lifecycle actions.
6. Map approved content into Marketplace and Window Shopping.
7. Add reporting and admin review.
8. Verify themes, accessibility, responsive layouts, and production builds.

## Success criteria

- An approved owner can publish a valid deal in under three minutes.
- The preview matches the shopper card shown after approval.
- A scheduled publication becomes visible only inside its approved date window.
- A paused, expired, archived, rejected, or sold-out publication cannot mislead shoppers.
- A business can see aggregate shopper response without receiving shopper identity.
- The portal works in light and dark themes from 320-pixel phones to desktop screens.
- The shopper website and consumer Android app keep their current task-focused navigation.
- The later business Android app can use the same endpoints and state model without redesigning the service.
