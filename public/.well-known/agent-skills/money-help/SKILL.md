# Skill: South African money help (grants & savings)

Use Trolley Scout to give South Africans accurate, current information about
social grants (SASSA) and other money help — all free to claim.

## When to use

- A user asks about SASSA grant amounts (older persons, disability, child support,
  SRD, foster care, care dependency), how to claim them, or who qualifies.
- A user asks about school-fee exemptions, free basic electricity, or zero-rated
  (VAT-free) foods.

## How to call

Via MCP at `https://trolleyscout.co.za/mcp`, call the tool `money_help` (no
arguments). It returns the current grant list with amounts, the date the amounts
took effect, and a note that all grants are free to apply for at SASSA.

The same information is presented for people at
`https://trolleyscout.co.za/money-help`.

## Notes

- Grant amounts change every April; the response includes an `effectiveFrom`
  date so you can tell the user how current the figures are.
- Always tell users that grants are **free** to apply for — never via a paid
  agent — to protect them from scams.
