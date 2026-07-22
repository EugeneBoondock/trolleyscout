// A "was" price only means something when it is a real number above the
// current price. Feeds sometimes emit R0.00 (their "no previous price"
// marker) and showing "R10.99, was R0.00" reads as a broken deal.
export function meaningfulWasPrice(
  wasText: string | undefined,
  priceText: string | undefined,
): string | undefined {
  const was = randToCents(wasText)
  if (was === undefined || was <= 0) {
    return undefined
  }
  const price = randToCents(priceText)
  return price !== undefined && was <= price ? undefined : wasText
}

function randToCents(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }
  const match = /(\d+(?:[.,]\d{1,2})?)/.exec(value.replace(/\s+/g, ''))
  if (!match) {
    return undefined
  }
  const amount = Number(match[1].replace(',', '.'))
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}
