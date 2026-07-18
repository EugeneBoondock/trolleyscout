# DNS for AI Discovery (DNS-AID) — records to publish

DNS-AID advertises agent entry points as SVCB/HTTPS records under
`_agents.<domain>`. This **cannot be done from this repository** — it is a DNS
zone change on `trolleyscout.co.za` (managed in Cloudflare DNS). Below are the
records to add and the DNSSEC step. Refs:
draft-mozleywilliams-dnsop-dnsaid, RFC 9460 (SVCB/HTTPS), and the skill at
https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md

## 1. Add SVCB records (ServiceMode, priority ≥ 1)

Point the well-known agent entry points at the site's HTTPS host. `alpn` lists
the supported protocols; `port` is 443. The `_index` entry is the general
discovery entrypoint; `_a2a` and `_mcp` name specific agent protocols.

```dns
; General discovery entrypoint
_index._agents.trolleyscout.co.za.  3600  IN  SVCB  1 trolleyscout.co.za. (
    alpn="h2,h3" port=443 )

; MCP server entrypoint (Streamable HTTP at https://trolleyscout.co.za/mcp)
_mcp._agents.trolleyscout.co.za.    3600  IN  SVCB  1 trolleyscout.co.za. (
    alpn="h2,h3" port=443 )

; A2A entrypoint (reserve now; enable if/when an A2A endpoint is added)
_a2a._agents.trolleyscout.co.za.    3600  IN  SVCB  1 trolleyscout.co.za. (
    alpn="h2,h3" port=443 )
```

> Note: the DNS-AID draft is evolving; if it finalizes a dedicated SvcParamKey
> for the agent endpoint path, add it (e.g. an `endpoint=/mcp` style param) per
> the then-current draft. The records above are valid RFC 9460 SVCB ServiceMode
> records today and resolve to the correct host/port.

### How to add in Cloudflare

- Dashboard: **DNS → Records → Add record → Type: SVCB** (or HTTPS), Name
  `_mcp._agents` (Cloudflare appends the zone), Target/Value as above.
- Or via API (needs a token with `Zone.DNS:Edit` for the zone):

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  -H "Authorization: Bearer <CF_API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "SVCB",
    "name": "_mcp._agents.trolleyscout.co.za",
    "data": { "priority": 1, "target": "trolleyscout.co.za", "value": "alpn=\"h2,h3\" port=443" },
    "ttl": 3600
  }'
```

## 2. Enable DNSSEC (authenticated discovery)

Validating resolvers must be able to authenticate the records:

- Cloudflare: **DNS → Settings → DNSSEC → Enable DNSSEC**, then add the
  generated **DS record** at your domain registrar. Once the registrar publishes
  the DS record and it propagates, the `_agents` zone data is signed and
  authenticated.

## Verify

```bash
dig SVCB _mcp._agents.trolleyscout.co.za +dnssec
```

Expect the SVCB answer plus an RRSIG (proof it is DNSSEC-signed).
