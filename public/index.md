# Trolley Scout: stretch every rand

Trolley Scout helps shoppers find grocery specials, compare prices across
stores, locate nearby retailers, and search property platforms.

## What you can do here

- **Find deals**: live specials from Woolworths, Checkers, Shoprite, Pick n
  Pay, Clicks, Dis-Chem, Boxer, OK Foods, SPAR, Usave, Game, Makro and
  independent local stores, with images, prices, and expiry dates. Filter by
  retailer, category, or expiry.
- **Near me**: find the supermarkets around you and see each store's current
  deals and catalogues, including small independent shops that bigger apps
  skip.
- **Compare shops**: enter your shopping list with prices from two or more
  stores and see which store is cheapest overall, including buy-2-for and
  multibuy maths.
- **Product and store comparison**: search selected retailers for one product
  or compare a full list side by side.
- **Watchlist**: track an item and get alerted when it goes on special.
- **Catalogues**: page through the latest store leaflets without hunting
  across retailer sites.

## For developers and agents

Public read-only JSON endpoints (no key needed):

| Endpoint | What it returns |
| --- | --- |
| `/api/discovery` | Current deals and catalogues across all retailers |
| `/api/retailers` | Retailer registry (slugs and display names) |
| `/api/nearby-stores?lat=&lon=` | Supermarkets near a coordinate with their deals |
| `/api/offers` | Community-submitted local offers |
| `/api/vouchers` | Current voucher deals |
| `/api/health` | Service liveness |

See `/.well-known/api-catalog` for the machine-readable catalog and
`/llms.txt` for an agent-friendly overview.

## Android app

A native Android app with the same features is available from the
[GitHub releases page](https://github.com/EugeneBoondock/trolleyscout/releases).
