// Automatic "what does this item cost at each of these stores" comparison.
// The shopper picks stores we already hold deals for, types an item, and we
// search our own deal database for the cheapest match at each store — no
// typing prices in by hand. Honest about misses: a store with no match is
// reported as "not found", never as free or zero.
// Mirrors src/services/priceCompare.ts on the web.

import 'api_models.dart';

// Two stores by default because "here or there?" is the common question; the
// shopper can pick a third and beyond.
const int kDefaultStoreCount = 2;

class StoreOption {
  const StoreOption({required this.id, required this.name});
  final String id;
  final String name;
}

class StorePriceMatch {
  const StorePriceMatch({
    required this.retailerId,
    required this.retailerName,
    this.deal,
    this.priceCents,
    this.isCheapest = false,
  });

  final String retailerId;
  final String retailerName;
  final Deal? deal;
  final int? priceCents;
  final bool isCheapest;

  StorePriceMatch copyWith({bool? isCheapest}) => StorePriceMatch(
        deal: deal,
        isCheapest: isCheapest ?? this.isCheapest,
        priceCents: priceCents,
        retailerId: retailerId,
        retailerName: retailerName,
      );
}

class AutoComparison {
  const AutoComparison({
    required this.query,
    required this.matches,
    required this.savingsCents,
    required this.foundCount,
    required this.missingCount,
    this.cheapestRetailerId,
  });

  final String query;
  final List<StorePriceMatch> matches;
  final String? cheapestRetailerId;
  final int savingsCents;
  final int foundCount;
  final int missingCount;
}

/// Pulls the first rand amount out of free text: "R24.99", "R 24,99 each",
/// "Now R19" all yield cents. Returns null when there is no price.
int? extractPriceCents(String? text) {
  if (text == null || text.isEmpty) return null;

  final match = RegExp(r'R\s*(\d+(?:[.,]\d{1,2})?)', caseSensitive: false).firstMatch(text) ??
      RegExp(r'(\d+[.,]\d{2})').firstMatch(text);
  if (match == null) return null;

  final rands = double.tryParse(match.group(1)!.replaceAll(',', '.'));
  if (rands == null || rands <= 0) return null;
  return (rands * 100).round();
}

List<String> _queryTokens(String query) => query
    .toLowerCase()
    .split(RegExp(r'[^a-z0-9]+'))
    .where((token) => token.length > 1)
    .toList();

/// A deal matches when its title carries every meaningful word of the query, so
/// "white bread" does not match "bread rolls" but does match "White Bread 700g".
bool dealMatchesQuery(Deal deal, String query) {
  final tokens = _queryTokens(query);
  if (tokens.isEmpty) return false;

  final haystack = '${deal.title} ${deal.evidenceText}'.toLowerCase();
  return tokens.every(haystack.contains);
}

/// The cheapest priced deal for this query at this retailer, if we hold one.
StorePriceMatch? findBestDealForQuery(
  List<Deal> deals,
  String query,
  StoreOption retailer,
) {
  Deal? bestDeal;
  int? bestCents;

  for (final deal in deals) {
    if (deal.retailerId != retailer.id || !dealMatchesQuery(deal, query)) continue;

    final cents = extractPriceCents(deal.priceText);
    if (cents == null) continue;

    if (bestCents == null || cents < bestCents) {
      bestCents = cents;
      bestDeal = deal;
    }
  }

  if (bestDeal == null || bestCents == null) return null;
  return StorePriceMatch(
    deal: bestDeal,
    priceCents: bestCents,
    retailerId: retailer.id,
    retailerName: retailer.name,
  );
}

/// Only stores we can actually price against right now, named and sorted.
List<StoreOption> storeOptionsFromDeals(List<Deal> deals) {
  final byId = <String, String>{};
  for (final deal in deals) {
    if (deal.retailerId.isEmpty) continue;
    byId.putIfAbsent(deal.retailerId, () => deal.retailerName);
  }

  final options = byId.entries.map((e) => StoreOption(id: e.key, name: e.value)).toList()
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return options;
}

List<String> defaultStoreIds(List<Deal> deals) =>
    storeOptionsFromDeals(deals).take(kDefaultStoreCount).map((s) => s.id).toList();

AutoComparison autoComparePrices(
  List<Deal> deals,
  String query,
  List<StoreOption> retailers,
) {
  final matches = retailers
      .map((retailer) =>
          findBestDealForQuery(deals, query, retailer) ??
          StorePriceMatch(retailerId: retailer.id, retailerName: retailer.name))
      .toList();

  final priced = matches.where((m) => m.priceCents != null).toList();

  if (priced.isEmpty) {
    return AutoComparison(
      foundCount: 0,
      matches: matches,
      missingCount: matches.length,
      query: query,
      savingsCents: 0,
    );
  }

  final cheapestCents =
      priced.map((m) => m.priceCents!).reduce((a, b) => a < b ? a : b);
  final dearestCents =
      priced.map((m) => m.priceCents!).reduce((a, b) => a > b ? a : b);
  final cheapest = priced.firstWhere((m) => m.priceCents == cheapestCents);

  return AutoComparison(
    cheapestRetailerId: cheapest.retailerId,
    foundCount: priced.length,
    // A tie for cheapest flags both stores.
    matches: matches
        .map((m) => m.copyWith(isCheapest: m.priceCents != null && m.priceCents == cheapestCents))
        .toList(),
    missingCount: matches.length - priced.length,
    query: query,
    savingsCents: dearestCents - cheapestCents,
  );
}

String formatCents(int cents) => 'R${(cents / 100).toStringAsFixed(2)}';
