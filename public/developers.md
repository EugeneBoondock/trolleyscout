# Trolley Scout Developers

The Developers subscription provides a scoped REST API and an OAuth-protected
MCP server for shopping discovery, trends, and a developer’s own campaigns.

## Base URLs

- REST API: `https://trolleyscout.co.za/api/developer/v1`
- MCP: `https://trolleyscout.co.za/mcp`

## REST API

Send an API key in the Bearer authorization header.

```bash
curl -H "Authorization: Bearer $TROLLEY_SCOUT_API_KEY" \
  "https://trolleyscout.co.za/api/developer/v1/deals?q=coffee&limit=20"
```

Read routes:

- `GET /deals?q=&retailer=&limit=`
- `GET /catalogues?retailer=&limit=`
- `GET /stores/nearby?lat=&lon=`
- `GET /stories`
- `GET /trends?period=day|week|month`

Owned campaign routes:

- `GET /campaigns`
- `POST /campaigns`
- `GET /campaigns/{id}`
- `PATCH /campaigns/{id}`
- `POST /campaigns/{id}/submit`
- `POST /campaigns/{id}/pause`
- `POST /campaigns/{id}/resume`
- `GET /campaigns/{id}/results?days=1|7|30`

Campaign drafts accept `destinations` containing one or more of `marketplace`,
`window`, and `stories`. Submitting sends the draft to Trolley Scout for review.
Campaign access is restricted to the connected account’s own business.

## MCP tools

The MCP server advertises tools allowed by the OAuth token scopes:

- `search_deals`, `list_catalogues`, `nearby_stores`, `list_stories`
- `get_trends`
- `list_campaigns`, `get_campaign`, `create_campaign_draft`
- `update_campaign_draft`, `submit_campaign`, `pause_campaign`
- `resume_campaign`, `get_campaign_results`

## Limits and errors

The Developers plan includes 25,000 requests per calendar month and 120 requests
per minute. A REST request or MCP tool call consumes one request. HTTP `429`
reports a rate or monthly allowance error. Every REST response carries
`X-Request-Id`.

Keep API keys and OAuth tokens out of client-side source code and logs. Revoke a
key from the profile panel when it is no longer needed.
