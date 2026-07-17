# Trolley Scout: stretch every rand

Trolley Scout helps South Africans find this week's grocery specials, compare
prices across stores, and claim the money help they are entitled to.

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
- **Unit price checker**: work out price per kg/litre in the aisle so bigger
  packs never trick you.
- **Watchlist**: track an item and get alerted when it goes on special.
- **Money help**: current SASSA grant amounts and how to claim them, school
  fee exemptions, free basic electricity, and other support that is free to
  claim.
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
