import 'api_models.dart';

class BasketStoreStop {
  const BasketStoreStop({
    required this.itemCount,
    required this.items,
    required this.knownPriceItemCount,
    required this.retailerId,
    required this.retailerName,
    required this.savingsCents,
    required this.totalCents,
  });

  final int itemCount;
  final List<BasketItem> items;
  final int knownPriceItemCount;
  final String retailerId;
  final String retailerName;
  final int savingsCents;
  final int totalCents;
}

List<BasketStoreStop> buildBasketStoreStops(Basket basket) {
  final grouped = <String, List<BasketItem>>{};
  for (final item in basket.items) {
    final key = item.deal.retailerId.isNotEmpty
        ? item.deal.retailerId
        : item.deal.retailerName;
    grouped.putIfAbsent(key, () => []).add(item);
  }

  final stops = grouped.entries.map((entry) {
    final items = entry.value;
    return BasketStoreStop(
      itemCount: items.fold(0, (total, item) => total + item.quantity),
      items: List.unmodifiable(items),
      knownPriceItemCount: items.fold(
        0,
        (total, item) =>
            total + (item.linePriceCents == null ? 0 : item.quantity),
      ),
      retailerId: items.first.deal.retailerId,
      retailerName: items.first.deal.retailerName,
      savingsCents: items.fold(
        0,
        (total, item) => total + (item.lineSavingCents ?? 0),
      ),
      totalCents: items.fold(
        0,
        (total, item) => total + (item.linePriceCents ?? 0),
      ),
    );
  }).toList()
    ..sort((left, right) => left.retailerName.compareTo(right.retailerName));

  return List.unmodifiable(stops);
}

/// A plain-text shopping list that works in WhatsApp, Messages, email, and
/// notes apps. Prices remain labelled as known totals because an unpriced item
/// must never look free when the list leaves Trolley Scout.
String formatBasketShareText(
  Basket basket, {
  required String Function(int cents) formatMoney,
}) {
  final stops = buildBasketStoreStops(basket);
  final lines = <String>['Trolley Scout shopping list', ''];

  for (var stopIndex = 0; stopIndex < stops.length; stopIndex++) {
    final stop = stops[stopIndex];
    final subtotal = stop.knownPriceItemCount == 0
        ? 'price not found'
        : '${formatMoney(stop.totalCents)} known subtotal';
    lines.add('${stopIndex + 1}. ${stop.retailerName} ($subtotal)');
    for (final item in stop.items) {
      final price = item.linePriceCents == null
          ? item.deal.priceText ?? 'price not found'
          : formatMoney(item.linePriceCents!);
      lines.add('• ${item.quantity} × ${item.deal.title}: $price');
      final productUrl = item.deal.productUrl;
      if (productUrl?.isNotEmpty == true) {
        lines.add('  $productUrl');
      }
    }
    lines.add('');
  }

  lines
    ..add('Known total: ${formatMoney(basket.summary.totalCents)}')
    ..add('Savings found: ${formatMoney(basket.summary.savingsCents)}')
    ..add('Prices can change. Check retailer links before shopping.');
  return lines.join('\n');
}
