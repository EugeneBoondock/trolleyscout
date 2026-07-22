# Trolley Scout

Stretch every budget with product comparison, grocery deal tracking, nearby store discovery,
and property search across multiple platforms.

Suggested domain: `trolleyscout.co.za`

## For households (no sign-in needed)

- **Product and store comparison**: search selected retailers for one product or compare a full list.
- **Data-light by design**: a service worker for flaky connections (`public/sw.js`) and an
  installable web manifest.

## What is here

- React, Vite, TypeScript, Tailwind v4, and Phosphor icons.
- Cloudflare Pages config through `wrangler.toml` and typed Pages Functions.
- Cloudflare D1 store for verified offer rows.
- D1-backed member sessions, saved source lists, saved deal lists, basket items, and subscription state.
- Official retailer source directory for Pick n Pay, Checkers, Shoprite, Woolworths, SPAR, Boxer, Food Lovers Market, Makro, Dis-Chem, Clicks, Usave, OK Foods, Takealot, Amazon South Africa, Game, Builders, and Yuppiechef.
- Source-backed deal discovery for approved official pages that expose static rows, official listing JSON, or embedded product JSON: Clicks (Hybris promotions results JSON), Takealot (public search API), Amazon South Africa, Dis-Chem, and Yuppiechef. Shoprite, Checkers, Pick n Pay, and Woolworths render products client-side only (verified July 2026) and are reported as checked without rows.
- Design language: the South African specials insert with newsprint cream, ink rules, specials-red prices, marker-yellow highlights, hard cut-paper shadows, and Anton price-card display type.
- Generated Trolley Scout brand mark and grocery hero image in `public/assets`.

## API routes

- `GET /api/health`: service status.
- `GET /api/summary`: retailer, source, and verified-offer counts.
- `GET /api/retailers`: official retailer sources, with optional `q` and `kind` query params.
- `GET /api/country`: detected or account country plus display currency and the current rand rate.
- `GET /api/offers`: verified offers from D1, or an empty local board when D1 is unavailable.
- `GET /api/discovery`: checks approved official deal pages and returns extracted source-backed rows plus source status.
- `POST /api/offers`: validates and saves one source-backed offer draft to D1.
- `DELETE /api/offers?id=...`: removes one verified offer row from D1.
- `POST /api/offer-validator`: validates a draft offer and returns field errors or a normalized row preview.
- `GET /api/member-session`: reads the current member session cookie.
- `POST /api/member-session`: starts a D1-backed member session.
- `DELETE /api/member-session`: clears the member session cookie.
- `GET /api/saved-sources`: lists member-saved retailer source links.
- `POST /api/saved-sources`: saves one official source link for the current member.
- `DELETE /api/saved-sources?id=...`: removes one saved source link.
- `GET /api/saved-deals`: lists member-saved discovery rows.
- `POST /api/saved-deals`: saves one source-backed discovery row for the current member.
- `DELETE /api/saved-deals?id=...`: removes one saved deal.
- `GET /api/basket-items`: lists basket items built from saved deals.
- `POST /api/basket-items`: adds one saved deal to the current member basket.
- `PATCH /api/basket-items`: changes basket item quantity.
- `DELETE /api/basket-items?id=...`: removes one basket item.
- `GET /api/subscription`: returns plan state and billing readiness.
- `POST /api/subscription`: starts Stripe Checkout when billing keys are configured.
- `POST /api/stripe-webhook`: verifies Stripe events and updates member plan state.

## Data policy

`src/data/verifiedOffers.ts` starts empty. The UI does not show offer rows, prices, savings, or voucher claims until a real offer is captured from an official retailer source or saved in D1.

Each offer row must have:

- Official source URL
- Capture date
- Retailer and source type
- Price text from source
- Valid dates
- Terms and loyalty rules

The scanner accepts a draft only when its source URL belongs to the selected retailer source list. A passing scan can then be saved to D1 from the app.

The discovery endpoint never seeds offer rows. It fetches approved official sources, extracts only supported static product cards, official listing JSON, and embedded product JSON, and reports unsupported rendered pages as checked without copying product rows.

Basket rows can be created only from saved deal IDs. Basket totals use extracted rand price text from the retailer page. Rows without parsed prices stay visible and are excluded from the rand total.

## Run locally

```bash
npm install
npm run dev
```

Run with Cloudflare Pages Functions and local D1:

```bash
npm run build
npx wrangler d1 migrations apply trolley-scout --local
npx wrangler pages dev dist --port 8792 --ip 127.0.0.1
```

Member and support email addresses require `EMAIL_ENCRYPTION_KEY`, a URL-safe base64 value
that decodes to exactly 32 random bytes. Keep the same key for the life of the stored data.
For local Pages development, place it in an ignored `.dev.vars` file. For production, set it
with Wrangler:

```bash
npx wrangler pages secret put EMAIL_ENCRYPTION_KEY --project-name trolley-scout
```

Paid subscription checkout expects these Cloudflare environment variables:

- `APP_URL`
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_MODE`
- `PAYFAST_NOTIFY_ORIGIN`
- `PAYFAST_PASSPHRASE`

If the live PayFast values are missing, the app uses the public PayFast sandbox configuration.

## Verify

```bash
npm run test
npm run build
npm run typecheck:functions
```

Full check:

```bash
npm run verify
```

## Cloudflare Pages

Build command:

```bash
npm run build
```

Build output:

```bash
dist
```

CLI deploy:

```bash
npm run build
npm run cf:deploy
```

## Retailer sources

- Pick n Pay: https://www.pnp.co.za/smart-shopper, https://www.pnp.co.za/catalogues, https://www.pnp.co.za/online-specials
- Checkers: https://www.checkers.co.za/merchandised-page/on-promotion.html, https://www.checkers.co.za/product/xtra-savings-rewards-card-10686038EA
- Shoprite: https://www.shoprite.co.za/store-directory-and-leaflets, https://www.shoprite.co.za/product/xtra-savings-rewards-card-10686038EA
- Woolworths: https://www.woolworths.co.za/content/article/wrewards-inspirational-videos/wrewards-instant-savings/_/A-cmp210372
- SPAR: https://www.spar.co.za/SPAR-Rewards, https://www.spar.co.za/specials, https://www.spar.co.za/rewards-app
- Boxer: https://www.boxer.co.za/promotions, https://www.boxer.co.za/news/the-boxer-rewards-club-is-here, https://www.boxer.co.za/money-kiosk/boxer-ecoupons
- Food Lovers Market: https://foodloversmarket.co.za/
- Makro: https://business.makro.co.za/mRewardsdeals
- Dis-Chem: https://www.dischem.co.za/better-reward, https://www.dischem.co.za/on-promotion
- Clicks: https://clicks.co.za/clubcard, https://clicks.co.za/Myclubcard-deals
- Usave: https://www.usave.co.za/specials.html
- OK Foods: https://www.okfoods.co.za/specials.html
- Takealot: https://www.takealot.com/deals, https://www.takealot.com/deals?filter=Type:34, https://www.takealot.com/deals--promotions, https://www.takealot.com/takealotmore
- Amazon South Africa: https://www.amazon.co.za/deals, https://www.amazon.co.za/coupons, https://www.amazon.co.za/amazonprime
- Game: https://www.game.co.za/on-promotion
- Builders: https://www.builders.co.za/promotions
- Yuppiechef: https://www.yuppiechef.com/specials.htm

## Music credits

The mobile app's Window Shopping playlist uses royalty-free tracks by
Kevin MacLeod (https://incompetech.com), licensed under
[Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/):
"Funkorama", "Deuces", "Bossa Antigua", "Funky Chunk", "Cool Vibes",
"Life of Riley", "Sidewalk Shade", and "Vibe Ace". The app credits the artist
on screen while music plays. UI feedback sounds are original, synthesized
in-house.
