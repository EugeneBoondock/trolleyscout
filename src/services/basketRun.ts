import type { Basket, BasketItem } from "../types";

export interface BasketStoreStop {
  itemCount: number;
  items: BasketItem[];
  knownPriceItemCount: number;
  retailerId: string;
  retailerName: string;
  savingsCents: number;
  totalCents: number;
}

/**
 * Turns the saved-deal basket into the order a shopper can use in store.
 * Prices remain source-backed: an unpriced row never contributes zero as if
 * the whole stop were known.
 */
export function buildBasketStoreStops(basket: Basket): BasketStoreStop[] {
  const groups = new Map<string, BasketStoreStop>();

  for (const item of basket.items) {
    const key = item.deal.retailerId || item.deal.retailerName;
    const current = groups.get(key) ?? {
      itemCount: 0,
      items: [],
      knownPriceItemCount: 0,
      retailerId: item.deal.retailerId,
      retailerName: item.deal.retailerName,
      savingsCents: 0,
      totalCents: 0,
    };

    current.items.push(item);
    current.itemCount += item.quantity;
    current.knownPriceItemCount +=
      item.linePriceCents === undefined ? 0 : item.quantity;
    current.savingsCents += item.lineSavingCents ?? 0;
    current.totalCents += item.linePriceCents ?? 0;
    groups.set(key, current);
  }

  return [...groups.values()].sort((left, right) =>
    left.retailerName.localeCompare(right.retailerName),
  );
}

/**
 * Produces a portable list for WhatsApp, Messages, email, and notes apps.
 * Unknown prices stay explicit so sharing never turns a missing price into a
 * zero-cost item.
 */
export function formatBasketShareText(
  basket: Basket,
  formatMoney: (cents: number) => string,
): string {
  const lines = ['Trolley Scout shopping list', '']

  buildBasketStoreStops(basket).forEach((stop, stopIndex) => {
    const subtotal = stop.knownPriceItemCount === 0
      ? 'price not found'
      : `${formatMoney(stop.totalCents)} known subtotal`
    lines.push(`${stopIndex + 1}. ${stop.retailerName} (${subtotal})`)
    stop.items.forEach((item) => {
      const price = item.linePriceCents === undefined
        ? item.deal.priceText ?? 'price not found'
        : formatMoney(item.linePriceCents)
      lines.push(`• ${item.quantity} × ${item.deal.title}: ${price}`)
      if (item.deal.productUrl) lines.push(`  ${item.deal.productUrl}`)
    })
    lines.push('')
  })

  lines.push(
    `Known total: ${formatMoney(basket.summary.totalCents)}`,
    `Savings found: ${formatMoney(basket.summary.savingsCents)}`,
    'Prices can change. Check retailer links before shopping.',
  )
  return lines.join('\n')
}
