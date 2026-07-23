# Trolley Scout product audit and completion report

Date: 22 July 2026  
Scope: Flutter mobile app, public web app, member web app, shared APIs, store scouting, and Android release output.

## Outcome

The reviewed journeys now share the same account rules, store data, recovery paths, visual language, and comparison preference across mobile and web. The work focused first on blocked or unsafe journeys, then navigation and accessibility, then response time and operating cost, and finally interface polish.

Automated verification at completion:

- Web and API: 97 test files, 775 tests passed.
- Mobile: 207 tests passed serially.
- Flutter static analysis: no findings.
- Web production dependency audit: no known findings.
- Web production entry bundle: 460.69 kB, 127.26 kB gzip.
- Android: release APK and AAB built after the tests, with signing and hashes checked separately.

## Priority 1: Broken flows, security, and critical accessibility

### 1. Session persistence and offline returning-user startup

1. **Screen or flow:** First launch, login, returning launch, offline launch, and logout.
2. **Problem:** Native session data and the last account snapshot were held in general preferences. Startup also waited on background services before rendering the first frame.
3. **User impact:** Account data had weaker device-at-rest protection, and a slow plug-in or network path could make launch appear frozen.
4. **Principle:** Security by default, Doherty Threshold, error prevention, and graceful failure.
5. **Severity:** Critical.
6. **Recommended fix:** Keep session and account data in encrypted platform storage, migrate legacy values once, render the app before optional startup work, and permit a read-only cached account shell during a network outage.
7. **Implementation notes:** Session cookies and the account snapshot now use secure storage. Legacy preference values are moved and removed. An HTTP 401 always clears the cached account. Background initialization runs after the first frame and does not block launch.
8. **Acceptance criteria:** A valid session survives restart; legacy values migrate once; offline returning users reach the cached shell; rejected sessions return to login; logout removes all session copies; the first frame does not wait for notification scheduling.

### 2. Large text, compact screens, touch size, and theme contrast

1. **Screen or flow:** Navigation, onboarding, account forms, profile, Deals, Stores, Near Me, modals, and shared controls.
2. **Problem:** Several controls fell below a reliable mobile tap size, some headers and forms could clip at 200 percent text, and compact landscape layouts could overflow.
3. **User impact:** People using motor assistance, larger type, or compact devices could miss actions or lose content.
4. **Principle:** Fitts’s Law, WCAG 2.2 target size and reflow guidance, iOS Human Interface Guidelines, and Material Design touch guidance.
5. **Severity:** Critical.
6. **Recommended fix:** Use a shared minimum control size, allow headings and actions to wrap, avoid fixed text-height containers, respect safe areas, and test both color themes at large type.
7. **Implementation notes:** Shared mobile controls now provide 48 logical-pixel targets. Web controls provide at least 44 CSS-pixel targets. Screen headers wrap, wide form rows collapse, the keyboard can no longer cover required actions, and light and dark tokens preserve readable surfaces and text.
8. **Acceptance criteria:** Core journeys work at 320 CSS pixels on web and compact Android widths; mobile remains usable at 200 percent text; interactive targets meet the shared minimum; no horizontal page overflow occurs; both themes retain readable text, focus, error, and disabled states.

### 3. Logout, relogin, and stale asynchronous account work

1. **Screen or flow:** Profile logout, navigation-drawer logout, interrupted login, and immediate relogin.
2. **Problem:** Notification cleanup and older account requests could outlive logout. A slow request could restore stale state or delay the next login.
3. **User impact:** Logout felt unreliable, and a user could land in the wrong post-authentication state.
4. **Principle:** Error prevention, deterministic state transitions, and immediate feedback.
5. **Severity:** Critical.
6. **Recommended fix:** Clear local auth state immediately, cancel or ignore stale hydration work, run optional device cleanup in the background, and reset the destination to Dashboard for the next session.
7. **Implementation notes:** Account hydration now has generation checks. Sign-out clears native state before remote cleanup. Notification cleanup cannot hold the session transition. Successful relogin consistently selects Dashboard.
8. **Acceptance criteria:** Logout returns to the signed-out journey immediately; stale requests cannot reopen member content; relogin works without restarting the app; drawer and profile logout behave the same way.

## Priority 2: Major usability, navigation, and recovery

### 4. Back behavior, app links, notification taps, and interrupted destinations

1. **Screen or flow:** Drawer destinations, Android system back, custom links, notification taps, signed-out link opening, and returning sessions.
2. **Problem:** Secondary destinations did not have one predictable recovery path, and external entry points were not routed through a single coordinator.
3. **User impact:** Users could reach a dead end, lose the requested destination during login, or exit the app when they expected to return Home.
4. **Principle:** Jakob’s Law, predictable platform navigation, recognition over recall, and state preservation.
5. **Severity:** High.
6. **Recommended fix:** Treat Dashboard as the signed-in navigation root, map trusted links to known destinations, queue member-only destinations through login, and route notification taps through the same path.
7. **Implementation notes:** Android and iOS custom-scheme entries are configured. The coordinator filters unknown hosts and unsupported paths, retains one pending destination through authentication, and sends system back from a secondary destination to Dashboard.
8. **Acceptance criteria:** A supported link opens the correct signed-in destination; the same link waits through login when signed out; unsupported links are ignored safely; notification taps and drawer navigation share destination rules; system back from a secondary page returns Home.

### 5. Destructive actions and transaction status

1. **Screen or flow:** Basket, saved deals, saved sources, verified offers, logout, subscription changes, advertising checkout, and payment WebViews.
2. **Problem:** Several irreversible actions ran on a single tap, and closing a payment view could be mistaken for success.
3. **User impact:** Users could remove data or change a plan accidentally, submit twice, or believe a payment completed when it had not.
4. **Principle:** Error prevention, clear system status, and recovery before commitment.
5. **Severity:** High.
6. **Recommended fix:** Confirm high-impact actions, provide Undo for reversible local removals, disable duplicate submissions, and label closed or pending payment states accurately.
7. **Implementation notes:** Both platforms now confirm sign-out and destructive member actions. Mobile removal flows expose Undo where recovery is safe. Subscription downgrades show the scheduled result. Advertising and subscription WebViews report closed or pending status without claiming success. Advertising URLs must use HTTPS.
8. **Acceptance criteria:** A destructive action requires explicit confirmation or offers a working Undo; repeated taps cannot create duplicate requests; closing checkout never changes the plan or reports payment; invalid external links are rejected before submission.

### 6. Permission, offline, slow-network, empty, and failure recovery

1. **Screen or flow:** Near Me location, notification opt-in, discovery loading, store directory, voucher summaries, and shared API requests.
2. **Problem:** Permission denial and slow responses could end in a message without a next action. Full response-body reads were not bounded by one timeout.
3. **User impact:** Users could become stuck or wait indefinitely, with no clear distinction between no data and failed data.
4. **Principle:** Tesler’s Law, Doherty Threshold, actionable error recovery, and dependable network behavior.
5. **Severity:** High.
6. **Recommended fix:** Explain the state in plain language, offer the next available recovery action, bound each request, retain safe cached data, and keep loading, empty, and error states visually distinct.
7. **Implementation notes:** Location denial can open device settings. Notification settings provide a settings action. Native requests apply a 15-second timeout across response reading. The directory and summary sections provide retry states. Cached account data supports an offline shell, and 401 responses never use it.
8. **Acceptance criteria:** Denied permissions offer settings recovery; request failure shows Retry; empty data is not styled or worded as an error; slow calls time out with a useful message; existing safe content remains visible when refresh fails.

### 7. Password recovery and account validation

1. **Screen or flow:** Login, registration, profile password change, and web support.
2. **Problem:** Password recovery was not discoverable, password fields lacked visibility controls, and confirmation mismatches could be discovered only after submission.
3. **User impact:** A locked-out user had no obvious recovery path, and form mistakes required unnecessary retries.
4. **Principle:** Error prevention, recognition over recall, familiar account conventions, and accessible form feedback.
5. **Severity:** High.
6. **Recommended fix:** Add a visible password-help route, add labelled show and hide controls, validate confirmation during entry and at submit, and require the current password for a profile change.
7. **Implementation notes:** Mobile opens the account-help support topic. Web routes directly to the same preselected topic. Login and profile forms have accessible visibility toggles. Password change requires current, new, and confirmation values, with mismatch feedback before submission.
8. **Acceptance criteria:** Password help is visible only where relevant; it opens the account-help topic; visibility controls have accessible names; mismatched values block submission and identify the field; a valid change sends all required values once.

### 8. Information architecture and public-page consistency

1. **Screen or flow:** Top navigation, public Home, Deals, Vouchers, About, Support, and legal pages.
2. **Problem:** Narrow navigation, inconsistent Home naming, account-gated copy on public tasks, and skipped heading levels weakened orientation.
3. **User impact:** Users could misunderstand which tasks require an account, lose navigation items on a compact screen, or receive a less useful screen-reader outline.
4. **Principle:** Jakob’s Law, Hick’s Law, Miller’s Law, clear hierarchy, and semantic structure.
5. **Severity:** High.
6. **Recommended fix:** Keep four primary public destinations visible, use Home consistently, state account requirements only at the action that needs them, and give each page one H1 followed by ordered headings.
7. **Implementation notes:** Compact web navigation hides only the long brand wordmark. Home, Deals, Vouchers, and Help stay available. Public copy now reflects anonymous access correctly. Home cards, Deals, Vouchers, About, Support, and legal pages now have an ordered heading outline.
8. **Acceptance criteria:** Navigation fits at 320 CSS pixels without horizontal scrolling; the current destination is clear; anonymous users can browse public content; each audited route exposes one H1 and does not skip a visible heading level.

## Priority 3: Performance, scale, and operating cost

### 9. Dashboard overfetch and repeated startup requests

1. **Screen or flow:** Returning-user Dashboard and app resume.
2. **Problem:** The Dashboard downloaded full store and voucher data to render small counts and previews.
3. **User impact:** Launch used more bandwidth, memory, database work, and time than the visible summary required.
4. **Principle:** Fetch only what is rendered, batch related work, and keep perceived response below the Doherty Threshold where possible.
5. **Severity:** High.
6. **Recommended fix:** Add compact summary responses, request independent summaries concurrently, cache safe shared data briefly, and avoid blocking the shell on secondary content.
7. **Implementation notes:** Mobile and web now use compact store and voucher summary endpoints. Independent hydration work runs concurrently. The full records remain available only on the destination that needs them.
8. **Acceptance criteria:** Dashboard requests do not contain full store branches, catalogues, or voucher bodies; summaries load independently; a failed secondary summary does not block the account shell; endpoint tests assert compact response shapes.

### 10. Unbounded store directory and branch-detail payloads

1. **Screen or flow:** Mobile Stores, web store directory, search, pagination, and branch detail.
2. **Problem:** The directory could return the full national data set, including branch promotion and catalogue detail, before the user searched or opened a branch.
3. **User impact:** Response and rendering cost grew with every discovered store, making the directory slower and more expensive over time.
4. **Principle:** Pagination, progressive disclosure, server-side filtering, lazy detail, and bounded queries.
5. **Severity:** High.
6. **Recommended fix:** Return a compact paged list, debounce server search, load a bounded next page, and fetch one branch’s detail only when opened.
7. **Implementation notes:** The endpoint accepts summary, detail, limit, offset, query, and place identifiers. Mobile and web request compact pages, search on the server, load 60 rows at a time, and fetch catalogue and promotion details on demand.
8. **Acceptance criteria:** Initial directory payload excludes branch-heavy detail; search does not download all rows; pagination is bounded; opening one branch requests only that place identifier; error and retry states work for both list and detail calls.

### 11. Duplicate counts and high-cardinality edge caching

1. **Screen or flow:** Discovered-store API list and search requests.
2. **Problem:** Compact reads could perform an extra area-count query, and arbitrary search strings could create many low-value cache entries.
3. **User impact:** Database and edge-storage work could grow faster than useful traffic.
4. **Principle:** Remove redundant queries, bound cache keys, and cache only data with meaningful reuse.
5. **Severity:** Medium.
6. **Recommended fix:** Skip tile counting when a compact caller does not render it, and bypass shared edge caching for high-cardinality search requests.
7. **Implementation notes:** The store read helper now takes an explicit tile-count option. Compact list calls disable the duplicate count. Search requests bypass edge caching, while stable summary and page requests keep the existing cache path.
8. **Acceptance criteria:** Compact list tests show no tile-count dependency; arbitrary query values do not create shared cache entries; stable requests remain cacheable; response contracts stay backward compatible.

### 12. Independent-store deal scouting and store-scoped comparison

1. **Screen or flow:** Near Me branch scouting and the compare tool on mobile and web.
2. **Problem:** Shoprite and Checkers had a store-specific anonymous feed, yet lesser-known shops needed a different discovery path. Compare choices were also easy to lose between sessions and platforms.
3. **User impact:** Independent shops could appear without useful deal rows, and shoppers had to repeat retailer selection.
4. **Principle:** Tesler’s Law, preference persistence, platform parity, and graceful source fallback.
5. **Severity:** High.
6. **Recommended fix:** Keep chain-specific store APIs where available, add bounded adapters for common commerce platforms, preserve website and catalogue fallbacks, and save selected retailer identifiers in member state.
7. **Implementation notes:** The scout checks Shoprite Group branch promotions first for matching branches. It can extract bounded product and offer data from supported common commerce storefronts, then falls back to the existing site and catalogue paths. Compare selections are saved through member state and used by the same live-price request on web and mobile.
8. **Acceptance criteria:** A known Shoprite Group branch returns active branch-scoped offers; supported independent storefront fixtures return dated or priced offers; unsupported sites fall back safely; selected retailers survive restart and appear on both clients; rapid preference changes keep the newest selection.

### 13. Web bundle size, route loading, and reduced motion

1. **Screen or flow:** First public-page load, secondary route navigation, and animated source cards.
2. **Problem:** Secondary routes and a motion package were part of the primary JavaScript path even when the first page did not need them.
3. **User impact:** Users downloaded and parsed more JavaScript on first visit, especially noticeable on low-end phones or slow connections.
4. **Principle:** Route-level lazy loading, dependency restraint, visible loading feedback, and reduced-motion support.
5. **Severity:** Medium.
6. **Recommended fix:** Split secondary routes, remove a package used for one simple entrance effect, reproduce that effect in CSS, and disable it under reduced-motion preferences.
7. **Implementation notes:** About, Support, Legal, Vouchers, Near Me, Toolkit, Properties, and Store Map are lazy chunks with a loading strip. The former motion dependency is removed. The remaining entrance effect uses CSS and follows the global reduced-motion rule.
8. **Acceptance criteria:** Secondary routes build as separate chunks; first-route navigation shows loading feedback; production entry JavaScript is no larger than 500 kB before gzip; reduced-motion mode removes the entrance movement; route back behavior remains correct.

### 14. Development-tool dependency advisory

1. **Screen or flow:** Local development and deployment tooling only.
2. **Problem:** The current Wrangler tool chain pins a version of Sharp with a published high-severity advisory. The package is absent from the production browser dependency audit.
3. **User impact:** There is no shipped browser or mobile runtime exposure from this path. Local and deployment environments still depend on the vendor’s pinned package version.
4. **Principle:** Supply-chain hygiene and proportionate risk handling.
5. **Severity:** Medium.
6. **Recommended fix:** Keep production dependencies clean, avoid a forced Wrangler downgrade, and update when the upstream tool chain releases a compatible Sharp fix.
7. **Implementation notes:** The production-only npm audit reports zero findings. The full development audit reports the Wrangler to Miniflare to Sharp path. The automated npm suggestion would downgrade Wrangler and is not a safe corrective action for this project.
8. **Acceptance criteria:** Production audit remains clear; no vulnerable package is bundled into browser assets; the tool chain is updated once the vendor releases a compatible fix; deployment checks pass after that update.

## Priority 4 and 5: Design system consistency and polish

### 15. Signed-out onboarding imagery and action shape

1. **Screen or flow:** Signed-out first launch, “Stretch your budget”, “Window shop the deals”, and “Bring the savings home”.
2. **Problem:** Generic icons did not carry the Scout character through the first-use story, and the main action had sharper corners than the rest of the mobile interface.
3. **User impact:** First launch felt less branded and less visually consistent than the signed-in product.
4. **Principle:** Aesthetic-usability effect, consistent component language, clear hierarchy, and brand recognition.
5. **Severity:** Medium.
6. **Recommended fix:** Create a distinct Scout scene for each promise, keep the character identity stable, use transparent production assets, and use the shared rounded control radius.
7. **Implementation notes:** Three new images were generated for the budget, browsing, and home stories. They were cleaned to transparent PNG assets, resized to 640 by 640, and registered in Flutter assets. The onboarding action uses the shared rounded radius. No text is baked into the artwork.
8. **Acceptance criteria:** Every slide shows a different Scout scene; images remain crisp and uncropped on compact and large screens; transparent edges work in both themes; the action shape matches shared controls; screen-reader users receive the slide’s written heading and description without decorative image noise.

### 16. Shared visual states and terminology

1. **Screen or flow:** Buttons, cards, headers, filters, forms, loading, success, empty, disabled, and error states across mobile and web.
2. **Problem:** Repeated local sizing and labelling choices made the same action feel different between destinations.
3. **User impact:** Inconsistent feedback increased learning effort and made the product feel unfinished.
4. **Principle:** Jakob’s Law, Miller’s Law, design-system reuse, and clear system status.
5. **Severity:** Medium.
6. **Recommended fix:** Route repeated controls through shared tokens and components, use one naming model, and define all interaction states rather than styling only the default state.
7. **Implementation notes:** Mobile now uses shared spacing, radius, control-height, header, loading, and error patterns. Navigation says Home consistently. Web controls use the same compact breakpoint, focus-visible treatment, rounded language, and theme tokens. Loading, empty, failure, selected, disabled, and confirmation states were checked in both themes.
8. **Acceptance criteria:** Equivalent actions use the same label and visual priority; primary and destructive actions never compete; focus and pressed states remain visible; disabled and loading controls cannot submit; no reviewed screen introduces a one-off control size or theme-incompatible surface.

## Journey replay results

- **First-time user:** Signed-out onboarding, account entry, login, password help, and successful Dashboard arrival passed on a compact Android emulator and in web browser checks.
- **Returning user:** Encrypted session restore, cached offline shell, concurrent summaries, logout, and relogin passed automated tests.
- **Mistake paths:** Invalid URLs, password mismatch, closed payment view, denied location, failed directory detail, duplicate submissions, and destructive-action cancellation have explicit outcomes and recovery.
- **Core tasks:** Deal discovery, voucher browsing, store search, branch detail, Near Me, compare retailer selection, saved items, basket, subscription changes, and profile updates were replayed through tests or browser checks.
- **Navigation:** Drawer navigation, system back, browser back, supported app links, and signed-out deferred app links passed.
- **Responsive and accessible states:** Compact phone, landscape layout rules, 150 to 200 percent text, light mode, dark mode, reduced motion, logical headings, named controls, and target sizes passed the reviewed checks.

## Verification boundary

Android release output was built and exercised on the available Android emulator. iOS source settings and Flutter behavior were checked from Windows, where an iOS archive and physical VoiceOver run cannot be produced. Store distribution checks that require Apple signing, Play Console access, live payment credentials, or production notification delivery remain release-channel checks rather than code defects.
