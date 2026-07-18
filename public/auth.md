# Trolley Scout — authentication for agents

This document describes how software agents authenticate with Trolley Scout's
APIs. It is intentionally honest about what exists today: Trolley Scout does
**not** run an OAuth 2.0 / OpenID Connect authorization server, and it does not
offer programmatic agent/client registration. Most of what agents want is
available with **no authentication at all**.

## Public, no-auth endpoints (recommended for agents)

These return JSON and require no credentials. They are the intended surface for
autonomous agents:

- `GET /api/discovery` — this week's verified grocery specials.
- `GET /api/nearby-stores?lat={lat}&lon={lon}` — nearby supermarkets and their specials.
- `GET /api/retailers` — the official retailer/source directory.
- `GET /api/vouchers` — verified retailer vouchers.
- `GET /api/deal-sites` — aggregated flash/daily deals (OneDayOnly, Hyperli, Daddy's Deals, MyRunway).
- `GET /api/public-ads?placement={feed|near_me}` — live sponsored listings.
- `GET /api/geocode?q={address}` — geocode a South African address to coordinates.

An MCP server exposes the same read capabilities as tools:

- Streamable HTTP endpoint: `https://trolleyscout.co.za/mcp`
- Server Card: `https://trolleyscout.co.za/.well-known/mcp/server-card.json`

See also the machine-readable catalog at
`https://trolleyscout.co.za/.well-known/api-catalog` and
`https://trolleyscout.co.za/llms.txt`.

## Member (write) actions

Member features — saving deals, baskets, watches, submitting an advert — belong
to a **human-owned account** and use a first-party session cookie, not OAuth:

1. `POST /api/member-session` with a JSON body `{ "intent": "login", "email": "...", "password": "..." }`.
2. On success the server sets an `HttpOnly` cookie `ts_member_session`; send it on
   subsequent member requests.
3. `DELETE /api/member-session` ends the session.

There is currently **no client-credentials or dynamic client-registration flow**
for autonomous agents to obtain a member session on their own. An agent acting
for a person should use that person's browser session. If first-class agent
authentication is added in future, this document and a real
`/.well-known/oauth-protected-resource` will be published — they are
deliberately omitted today rather than pointing at endpoints that do not exist.

## Contact

Trolley Scout is a product of Boondock Labs (Pty) Ltd — https://boondocklabs.co.za
