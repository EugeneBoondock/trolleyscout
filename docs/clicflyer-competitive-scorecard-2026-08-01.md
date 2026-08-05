# Trolley Scout and ClicFlyer product scorecard

Date checked: 2 August 2026

Evidence: the current ClicFlyer Android app was installed from Google Play, opened in an Android 16 emulator, and reviewed in an authenticated Johannesburg account. The public [Google Play listing](https://play.google.com/store/apps/details?id=main.ClicFlyer) was used for public scale claims.

This scorecard separates verified product wins from open business gaps. Trolley Scout should make specific feature claims backed by the current build.

| Shopper job | ClicFlyer observed product | Trolley Scout current build | Result |
| --- | --- | --- | --- |
| Find current offers | Search, trending, retailer, category, public coupon and flyer screens | Search, category, retailer and source filters, sold-out and auction controls, recent deals, personal ranking | Trolley Scout has more decision controls |
| Try the product before creating an account | The reviewed session was authenticated, so fresh-install guest access was not measured | “Explore first” opens Home, Marketplace, Stores, Near Me, Window shopping, vouchers, comparisons and coverage; account-only destinations still show the login prompt | Trolley Scout now shows value before asking for account details |
| Understand an offer | Image-led card, expiry count, save and detail actions | In-app detail view with retailer, source label, price, validity, stock state, official source and similar offers | Trolley Scout win |
| Know where a price came from | Flyer or coupon presentation | Retailer source link, product link, capture time, validity details and source-backed wording | Trolley Scout win |
| Compare prices | Price comparison from offer details | Similar cross-store deals plus whole-list comparison across selected stores | Trolley Scout win |
| Plan a shopping trip | Flat shopping list | Store-by-store run with stop order, store totals, known-price coverage, savings and trolley checklist | Trolley Scout win |
| Correct a bad offer | Report offers | Reasoned shopper report tied to the exact source, market and product, with admin review on web and Android | Trolley Scout win |
| Browse flyers | Interactive flyers, sharing and notifications | Current catalogue selection, page browsing, sharing paths and deal alerts | Parity, monitor usability |
| Catalogue breadth in South Africa | The measured Johannesburg retailer directory exposed 46 retailer cards with 108 flyer-count entries; two cards had malformed names | Production exposes 213 current catalogues across 76 retailers after the 2 August source-retention repair; competitor-only retailer gaps also resolve to verified retailer-owned sources | Trolley Scout leads the measured catalogue count and retailer breadth |
| Find a nearby store and get there | Johannesburg map and list, range control, store details and external directions | GPS or address search, recent and saved addresses, country-scoped results, distance, deals and catalogues per store, an in-app route preview, external turn-by-turn navigation, and light or dark map tiles | Trolley Scout gives shoppers more ways to start and more value before the trip |
| Favourite retailers | Hearts on retailer and coupon cards, with new-flyer alerts | Favourite-store feed, saved sources and new-deal alerts | Parity with a stronger deal feed |
| Loyalty cards | On-device card area with expiry, front and back photos, and a searchable template screen | Secure device storage, expiry status, front and barcode-side photos, masked card numbers, offline retailer quick picks, and a high-contrast scannable checkout barcode with photo fallback | Trolley Scout checkout-speed, privacy and reliability win |
| Receipts | Account-gated form with store, date, photos and notes; camera is the first capture path; the reviewed wallet showed receipt storage without spending analysis | Local-only receipt vault with camera or gallery choice, on-device text reading that pre-fills reviewable store, date, total and bought items, zoom and delete, plus monthly budget progress, average receipt, top retailer, three-month spending and a private latest-price memory | Trolley Scout privacy, speed and shopping-intelligence win |
| Personal coupons | Account-gated coupon form with retailer, code, dates, camera photo and notes | Secure local coupon vault with retailer, code, received date, expiry, terms, notes, two photo sides, camera or gallery choice, duplicate checks, expired state, copy action and scan-ready barcode | Trolley Scout win on privacy, recovery and checkout use |
| Public coupons | Brand directory leading to promotion cards; reviewed Ucook card had no reusable checkout code | Country-scoped community vouchers with eligibility rules, expiry, confidence, reports, moderation and optional approved feeds | Trolley Scout trust win |
| Data usage | Explicit Data Saver setting | Explicit Data Saver setting that disables Window Shopping preloading and extends deal-cache reuse from 3 to 12 hours | Trolley Scout behaviour is clearer and test-backed |
| Ads | Persistent banner ads; Premium screen advertises ad removal | No shopper banner ads by default | Trolley Scout win |
| Local store coverage | Listing says 3,000+ stores | 3,041 directly measured physical-store records across 26 active markets, including 2,082 in South Africa, plus a scheduled rotating coverage sweep | Measured count parity; branch-for-branch parity is not claimed |
| App scale | Listing says 5M+ downloads and 4.7 stars from 21.4K reviews | No comparable public adoption yet | Open gap: adoption |
| Stability | Product quality cannot be inferred from one emulator session | 1,801 passing web tests, 436 passing Android tests, and release-build emulator checks in this worktree | Strong engineering signal, not a public reliability claim |
| Android startup | Measured release cold-start median was 1,704 ms on the Android 16 emulator | Measured split-release cold-start median was 1,533 ms on the same emulator after install optimisation settled | Trolley Scout led this controlled five-run sample |

## Authenticated screen evidence

The review captured the ClicFlyer home, drawer, Premium, Settings, Loyalty Cards and Coupons, receipt form, coupon form, public coupon directory and a Ucook coupon card. The captures are stored outside the repository in the task’s visual audit folder.

Observed points:

- A fresh authenticated wallet check confirmed that receipts remain a storage section without budget progress or spending trends.
- Trolley Scout’s Android receipt reader was exercised through the native on-device text-recognition channel in both themes. Read fields remain editable, receipt photos stay on the phone, and reviewed line items feed private deal ranking and latest-price memory.
- The authenticated loyalty-card form supports expiry and front and back photos. Trolley Scout now matches those fields and adds a generated checkout barcode, expiry status, secure local photo storage and offline retailer picks.
- The authenticated coupon form supports purchase and expiry dates, a validity note, camera capture and notes. Trolley Scout now matches those jobs with clearer received-date wording, two photo sides, camera or gallery choice, secure local file cleanup, permission-denial recovery and a scan-ready checkout barcode.
- Premium promises “No Ads”; banner ads appear throughout the free experience.
- Settings include favourite-retailer flyer alerts, offer-expiry alerts and Data Saver.
- The receipt form requests camera permission from its photo action.
- The public coupon directory mixes broad merchant promotions with coupons. The sampled Ucook card presented a meal-kit promotion and a “See Details” action without exposing a reusable code.
- A full ClicFlyer retailer-grid sweep found legitimate gaps for ACDC Express, Chatz Connect, Cosmetic Connection, Liquor City and Rochester. Their retailer-owned public sources were added to Trolley Scout. Known display variants such as Boxer Superstores, Decofurn Furniture, Dis-Chem Pharmacies, Jet Mart and OK Liquor now resolve to existing canonical retailers.
- The Play-equivalent Trolley Scout build opened Food Lover’s Market as a 6-page reader and advanced to page 2. Frontline Hyper opened as an 8-page PDF and advanced to page 2. Neither path logged an app crash, ANR or out-of-memory failure.
- Twelve rapid Baby and Clothing category switches left Marketplace responsive with 1,172 Clothing matches and no crash or ANR. Stores rendered 32 groups backed by 2,082 South African locations in the measured session.
- Personal coupons and public coupon discovery are different jobs. Trolley Scout now keeps that distinction explicit.
- ClicFlyer’s store locator showed a Johannesburg map, list and range control. Trolley Scout now carries its existing route preview and external navigation into Near Me, where address search, search history, saved addresses, store distance, current deals and catalogues already give the shopper more trip context.

## Claim rule

Use claims such as “compares similar live deals across stores”, “turns your priced basket into a store-by-store run”, “keeps personal coupon codes on your device”, and “shows where an offer came from”. Do not claim blanket superiority until current independent measurements show stronger store coverage, crash-free use, search success, retention and shopper savings.

## Next benchmark targets

1. Track search success, price coverage, basket savings and report resolution time.
2. Track Android crash-free users, startup time and slow frames before each release.
3. Run task-based shopper testing against ClicFlyer for search-to-list time, comparison success and completed shopping runs.
4. Audit branch freshness and closure rates as the scheduled coverage sweep grows the store directory.
