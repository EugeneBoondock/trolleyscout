# Trolley Scout developer authentication

Trolley Scout has two developer authentication methods. Direct REST API calls
use API keys. MCP clients use OAuth 2.0 with Authorization Code and PKCE.
Both require an active Developers subscription.

## REST API keys

Create and revoke keys from the Developer access panel in your Trolley Scout
profile. The secret is shown once. Store it in a secret manager and send it as:

```http
Authorization: Bearer ts_dev_your_key
```

Keys are stored as SHA-256 hashes. A key can have an expiry date and any subset
of these scopes:

- `shopping:read`
- `trends:read`
- `campaigns:read`
- `campaigns:write`

The Developers plan includes 25,000 requests per calendar month and a
120 requests-per-minute limit. Responses include `X-Request-Id`. Error bodies
use a stable `error.code`, message, request ID, and optional validation issues.

## MCP OAuth

Use the Streamable HTTP endpoint at `https://trolleyscout.co.za/mcp`.
The server publishes:

- Authorization server metadata: `/.well-known/oauth-authorization-server`
- Protected resource metadata: `/.well-known/oauth-protected-resource`
- Dynamic client registration: `/oauth/register`
- Authorization endpoint: `/oauth/authorize`
- Token endpoint: `/oauth/token`
- Revocation endpoint: `/oauth/revoke`

Public MCP clients register a redirect URI, then use Authorization Code with
S256 PKCE. Authorization codes expire after 5 minutes and can be used once.
Access tokens expire after 1 hour. Refresh tokens expire after 30 days and
rotate whenever they are used.

The connected Trolley Scout account must have an active Developers subscription.
Campaign tools only access the connected account’s own approved business.

See [the developer guide](https://trolleyscout.co.za/developers.md) for routes,
tools, scopes, campaign destinations, and examples.
