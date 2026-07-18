# Skill: Find South African grocery deals

Use Trolley Scout to find this week's verified grocery specials and the cheapest
store for a shopping list in South Africa. No authentication is required.

## When to use

- A user asks where a product is on special, or which supermarket is cheapest.
- A user wants this week's specials near a location.

## How to call

All endpoints are public JSON (base `https://trolleyscout.co.za`) and are also
available as MCP tools at `https://trolleyscout.co.za/mcp`.

### Search deals

```
GET /api/discovery
```

Returns `{ data: { deals: [...], summary: {...} } }`. Each deal has `title`,
`retailerName`, `retailerId`, `priceText`, `previousPriceText`, `savingText`,
`productUrl`, `imageUrl`. Filter client-side by keyword or `retailerId`.

Or via MCP: call tool `search_deals` with `{ "query": "peanut butter", "retailer": "checkers", "limit": 20 }`.

### Nearby supermarkets

```
GET /api/nearby-stores?lat={lat}&lon={lon}
```

Returns nearby supermarkets with their current specials and catalogues. Or via
MCP: tool `nearby_stores` with `{ "lat": -26.2041, "lon": 28.0473 }`.

### Flash / daily deals

```
GET /api/deal-sites
```

Aggregated flash deals from OneDayOnly, Hyperli, Daddy's Deals and MyRunway. Or
via MCP: tool `flash_deals`.

## Notes

- Data comes from official retailer pages and reputable deal sites; treat prices
  as indicative and link users to the `productUrl` to confirm.
- OneDayOnly deals expire daily (`expiresAt` on flash deals).
