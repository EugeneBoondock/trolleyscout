// Dart port of src/services/shopCompare.ts — pure "which shop is cheapest for
// my list" logic. Kept in lockstep with the web tool.

class CompareItemDraft {
  const CompareItemDraft({required this.id, required this.name, required this.priceCents});
  final String id;
  final String name;
  final List<int?> priceCents; // aligned to shops; null = not priced there
}

class ShopTotal {
  const ShopTotal({
    required this.shopIndex,
    required this.totalCents,
    required this.pricedItemCount,
    required this.missingItemCount,
  });
  final int shopIndex;
  final int totalCents;
  final int pricedItemCount;
  final int missingItemCount;
}

class ShopComparison {
  const ShopComparison({
    required this.shopTotals,
    required this.savingsCents,
    required this.cheapestShopByItem,
    required this.hasCompleteShop,
    this.cheapestShopIndex,
  });
  final List<ShopTotal> shopTotals;
  final int? cheapestShopIndex;
  final int savingsCents;
  final List<int?> cheapestShopByItem;
  final bool hasCompleteShop;
}

ShopComparison compareShops(List<CompareItemDraft> items, int shopCount) {
  final priced =
      items.where((item) => item.priceCents.any((cents) => cents != null)).toList();

  final shopTotals = List<ShopTotal>.generate(shopCount, (shopIndex) {
    var totalCents = 0;
    var pricedItemCount = 0;
    for (final item in priced) {
      final cents = shopIndex < item.priceCents.length ? item.priceCents[shopIndex] : null;
      if (cents != null) {
        totalCents += cents;
        pricedItemCount += 1;
      }
    }
    return ShopTotal(
      shopIndex: shopIndex,
      totalCents: totalCents,
      pricedItemCount: pricedItemCount,
      missingItemCount: priced.length - pricedItemCount,
    );
  });

  final cheapestShopByItem =
      priced.map((item) => _cheapestIndex(item.priceCents)).toList();

  final completeShops = shopTotals
      .where((shop) => priced.isNotEmpty && shop.missingItemCount == 0)
      .toList();
  final hasCompleteShop = completeShops.isNotEmpty;
  final candidates = hasCompleteShop
      ? completeShops
      : shopTotals.where((shop) => shop.pricedItemCount > 0).toList();

  if (candidates.isEmpty) {
    return ShopComparison(
      shopTotals: shopTotals,
      savingsCents: 0,
      cheapestShopByItem: cheapestShopByItem,
      hasCompleteShop: false,
    );
  }

  final cheapest =
      candidates.reduce((best, shop) => shop.totalCents < best.totalCents ? shop : best);
  final dearest =
      candidates.reduce((worst, shop) => shop.totalCents > worst.totalCents ? shop : worst);

  return ShopComparison(
    shopTotals: shopTotals,
    cheapestShopIndex: cheapest.shopIndex,
    savingsCents: dearest.totalCents - cheapest.totalCents,
    cheapestShopByItem: cheapestShopByItem,
    hasCompleteShop: hasCompleteShop,
  );
}

int? _cheapestIndex(List<int?> prices) {
  int? bestIndex;
  var bestValue = 1 << 62;
  var tie = false;
  for (var i = 0; i < prices.length; i++) {
    final cents = prices[i];
    if (cents == null) continue;
    if (cents < bestValue) {
      bestValue = cents;
      bestIndex = i;
      tie = false;
    } else if (cents == bestValue) {
      tie = true;
    }
  }
  return tie ? null : bestIndex;
}

int? parsePriceInput(String text) {
  final cleaned = text.replaceAll(RegExp(r'[rR\s]'), '').replaceAll(',', '.').trim();
  if (cleaned.isEmpty || !RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(cleaned)) {
    return null;
  }
  final rands = double.tryParse(cleaned);
  return rands != null && rands > 0 ? (rands * 100).round() : null;
}

String formatCents(int cents) => 'R${(cents / 100).toStringAsFixed(2)}';
