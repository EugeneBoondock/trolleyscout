# Trolley Scout 1.14.0 (build 34)

**Artifact:** `mobile/build/app/outputs/bundle/release/app-release.aab` — 62.1 MB, signed with the upload key.

**This upload carries two builds' work.** 1.13.0+33 was built but never
released, so everything in it reaches users for the first time here, together
with 1.14.0. The last build your users actually have is **1.12.1+32**. Everything
below is new to them.

The app changes below came in 1.13.0; the server changes came in both. 1.14.0
added no app code of its own — its work is entirely server-side, and the app
already renders it, because deal prices are formatted on the server and arrive
as text.

---

## New shops and countries

**The big American chains.** Walmart, Costco, Target, Sam's Club, ALDI, Kroger,
Publix, H-E-B, Meijer, Albertsons, Safeway, Lidl, Sprouts, BJ's, Stop & Shop,
Fred Meyer, Hy-Vee, Food Lion and Winn-Dixie. None of them has a catalogue that
can be read directly — each site is a store locator wrapped around a circular the
browser assembles — so their weekly ads come from Flipp, keyed by postal code,
because a US weekly ad is a local document. The Kroger ad in Atlanta is not the
Kroger ad in Detroit.

**Argentina**, with 25 shops: the supermarkets Jumbo, Disco, Vea, Dia and
Masonline, plus Farmacity, Easy, Portsaid, Colorshop, Legacy and the rest.

**Paraguay**, with 9: Shopping China, Casa Rica, Areté, González Giménez and
others. Paraguay's online retail is genuinely small — this is close to what is
reachable, not a shortfall.

**Makro's real catalogue.** Makro was showing 34 rows while running hundreds of
markdowns; it had moved to Flipkart's platform and its storefront became a shell
that assembles itself in the browser. Twelve departments now come back whole —
776 products with 406 markdowns when first read.

**Roots Butchery and Boxer leaflets.** Roots runs 175 stores off one national
month-end leaflet; Boxer publishes one per province plus eSwatini. Both were
reachable and neither was being read. Nothing is published without a date window
that could be read and has not closed — a shopper drives out for a leaflet, so an
expired one costs them a trip.

**Mr Price, which had never once shown a deal.** Its markdowns were being read
from the wrong half of the payload, so a dress on the shelf at R200 that was
R299.99 looked like a full-price dress. Both kinds of Mr Price offer now come
through: 186 markdowns across every department, and 66 multibuy items — "take 2
for R130" — carried at the real shelf price with the offer in Mr Price's own
words, because that saving happens at the till rather than on the shelf.

**Every shop's whole catalogue, not just the front.** New World showed 5 deals
while running well over a hundred, because its discounts are scattered through
the catalogue rather than gathered at the front. The same six requests now reach
1500 products instead of 300; New World went from 5 discounts to 92.

---

## Prices you can trust

**Prices in your own country's money.** A deal now records the country it belongs
to and the currency it is written in, and shoppers see only their own country's
deals. Before this, every deal was South African by assumption and every price
rendered as rands — a Walmart price would have reached Cape Town as R7.00 when it
meant $7.00.

**No more "was R0.00".** Woolworths writes "no previous price" as a zero rather
than leaving the field out, and all its multibuy lines are priced that way. Taken
literally, that zero was stored as the previous price on all 1765 Woolworths
deals on record. A previous price now has to be above the price paid to count as
one. The deal is kept — a real price with a real promotion behind it is still
worth showing — only the false claim of a saving is dropped.

**A deal with no price is no longer shown.** Catalogue pages whose price could
not be read were arriving as R0.00, which reaches a shopper as a picture of a
product and nothing to compare.

**Deals that have closed are swept up** rather than sitting in the feed.

These three rules now live in one place rather than in fourteen parsers across
four countries — and in whichever one is written next.

**Sold-out badge.** Shopify keeps a sold-out item in its feed and says so; we
were not carrying the answer through. A product is marked gone only when every
way of buying it says so — a feed that never mentions stock leaves it unsaid,
because "we do not know" and "you cannot have it" are different things to put in
front of someone. The badge rides the share card too, where it takes the badge
slot outright: a discount on something nobody can buy is not the news.

---

## App changes

**Tapping a deal opens that deal.** Every card in Today's savings ran the same
action as "See all deals", so tapping a particular jacket landed you on the deals
list with the jacket nowhere in sight. Raised by a shopper in the Netherlands.
The deep link was stored correctly all along and simply never used.

**Find deals is now the Marketplace**, and sits second in the bar, right below
the dashboard.

**The stores page shows shops you could actually reach** — nearest first, from
the address you last saved on Near me, rather than every shop in the country. By
distance rather than province: it does not stop at a border you do not care
about, and it still means something in the Netherlands and the United States.

**A chain's branch no longer reports "no deals"** while the chain has hundreds.
A Shoprite branch read "no deals" on the same day the deals page showed 843 for
Shoprite. A branch is now credited with what its chain published as well as what
was found at its own door, and the two are reported separately.

**The retailer picker lists every shop we scout**, not just the ones with deals
on screen — a quiet shop now says it is quiet instead of vanishing.

**Window shopping**: the arrows are gone from the image carousel, leaving the
dots; comment counts show on deals; the song indicator is tappable through to the
artist.

**Links out to shops carry `?utm_source=trolleyscout.co.za`**, so a retailer
reading their own analytics can see the visit came from here.

---

## Store listing text

> Trolley Scout now finds deals at the big American supermarkets — Walmart,
> Costco, Target, Kroger, Publix, ALDI, H-E-B and a dozen more — and shows every
> price in your own country's money. Mr Price deals are here at last, along with
> Makro's full catalogue, Roots and Boxer leaflets, and new shops in Argentina
> and Paraguay. Tap a deal and it opens that deal. Sold-out items now say so.

---

## Known limits, stated plainly

- **Wegmans, Trader Joe's and Whole Foods are not included.** Flipp does not
  carry them — checked across sixteen metros — and there is no other route to
  their prices. Rather than add sources that always return nothing and read as
  broken shops, they are left out.
- **US deals carry no "was" price.** The weekly ads publish a rounded percentage
  off, not the original amount. That percentage is shown as the shop stated it;
  no previous price is reconstructed from it, because 36% off $10.98
  back-computes to $10.94, and that number would be invented.
- **US shoppers are not asked which metro they are in.** Each chain's deals are
  drawn from up to four cities and the deal records which, but nothing yet
  filters to a shopper's nearest.
- **No user-facing country picker.** Country is detected, with an admin override.
  A shopper detected wrongly cannot fix it themselves.
- **Shoprite and Checkers have ~739 live deals pinned to single store IDs** and
  invisible to shoppers. Still open — it needs a decision between publishing them
  chain-wide with the branch named, or resolving per-branch store codes.

---

## Before promoting the build

Migration `0034_deal_item_country.sql` **must be applied before the server
deploy**, or writes fail on the missing column. Already applied to production;
the 11 031 existing rows backfilled correctly as ZA/ZAR.

---

## Verification

- 1222 automated tests pass; typecheck and lint clean.
- The Flipp adapter, run against the live API, returned 2955 deals across all 19
  chains with sane prices ($0.50 pencils, $2.99 dish soap, no tenfold errors).
- The South African feed was checked in production after the currency change:
  6610 deals, all still priced in rands.
- **Not yet verified:** the production cron writing US rows. At the time of
  writing no Flipp source had run in production — the feed lane fires every third
  hour. The adapter and the storage path are both proven; the scheduled run
  joining them is not.
