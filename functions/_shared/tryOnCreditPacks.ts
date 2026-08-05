// Priced against what a render actually costs (roughly R1.40 at current
// provider rates) with the margin thinning as the pack grows, so buying more
// always feels like the better deal without ever pricing a single fitting out
// of reach.
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
    amountCents: 2900,
    credits: 10,
    id: 'fittings-10',
    label: '10 fittings',
    perFittingCents: 290,
  },
  {
    amountCents: 6900,
    credits: 30,
    id: 'fittings-30',
    label: '30 fittings',
    perFittingCents: 230,
  },
  {
    amountCents: 14900,
    credits: 80,
    id: 'fittings-80',
    label: '80 fittings',
    perFittingCents: 186,
  },
]

export function findTryOnCreditPack(id: string): TryOnCreditPack | undefined {
  return TRY_ON_CREDIT_PACKS.find((pack) => pack.id === id)
}
