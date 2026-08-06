// A render costs about R0.10-R0.20 through Pruna, so these packs are priced
// for convenience, not to recover a big cost.
//
// They must never look better than the plans that pay the bills. Scout is R50
// a month for 50 fittings AND the whole toolkit; Household is R80 for
// unlimited — only R30 more. So every pack stays well under that R30 gap:
// anyone who needs volume is better off upgrading, and the packs exist purely
// so a paying member can finish this month's shopping without changing plan.
// Free shoppers are never sold a pack — Scout is genuinely the better deal
// for them, and offering ten fittings for near the price of a month of Scout
// would be an insult dressed as an option.
export interface TryOnCreditPack {
  amountCents: number
  credits: number
  id: string
  label: string
  /// What the shopper effectively pays per fitting, for honest comparison.
  perFittingCents: number
}

export const TRY_ON_CREDIT_PACKS: TryOnCreditPack[] = [
  {
    amountCents: 900,
    credits: 20,
    id: 'fittings-20',
    label: '20 fittings',
    perFittingCents: 45,
  },
  {
    amountCents: 1900,
    credits: 60,
    id: 'fittings-60',
    label: '60 fittings',
    perFittingCents: 32,
  },
]

export function findTryOnCreditPack(id: string): TryOnCreditPack | undefined {
  return TRY_ON_CREDIT_PACKS.find((pack) => pack.id === id)
}
