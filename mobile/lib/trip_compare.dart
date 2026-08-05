import 'api_models.dart';

const int kMaxTripItems = 8;

class TripItemPrice {
  const TripItemPrice({required this.query, this.match});

  final RetailerProductSearchMatch? match;
  final String query;
}

class TripStoreTotal {
  const TripStoreTotal({
    required this.missingQueries,
    required this.pricedItemCount,
    required this.retailerId,
    required this.retailerName,
    required this.totalCents,
  });

  final List<String> missingQueries;
  final int pricedItemCount;
  final String retailerId;
  final String retailerName;
  final int totalCents;
}

class TripComparison {
  const TripComparison({
    required this.isComplete,
    required this.items,
    required this.pricedItemCount,
    required this.splitStoreCount,
    required this.splitTotalCents,
    required this.stores,
    this.bestOneStore,
    this.convenienceCostCents,
    this.country,
  });

  final TripStoreTotal? bestOneStore;
  final int? convenienceCostCents;
  final CountryOption? country;
  final bool isComplete;
  final List<TripItemPrice> items;
  final int pricedItemCount;
  final int splitStoreCount;
  final int splitTotalCents;
  final List<TripStoreTotal> stores;
}

List<String> parseTripQueries(String value, {int limit = kMaxTripItems}) {
  final seen = <String>{};
  final queries = <String>[];
  for (final line in value.split(RegExp(r'\r?\n'))) {
    final query =
        line.trim().replaceFirst(RegExp(r'^[\s\-â€¢\d.)]+'), '').trim();
    final key = query.toLowerCase();
    if (query.length < 2 || !seen.add(key)) continue;
    queries.add(query);
    if (queries.length >= limit) break;
  }
  return queries;
}

TripComparison buildTripComparison(List<ProductComparisonResult> results) {
  final items = results
      .map((result) => TripItemPrice(
            query: result.query,
            match: _cheapestPricedMatch(result.matches),
          ))
      .toList();
  final storeIds = results
      .expand((result) => result.matches.map((match) => match.retailerId))
      .toSet();
  final stores = storeIds.map((retailerId) {
    final rows = results
        .map((result) => (
              query: result.query,
              match: result.matches
                  .where((candidate) => candidate.retailerId == retailerId)
                  .firstOrNull,
            ))
        .toList();
    final priced = rows.where((row) => row.match?.priceCents != null).toList();
    return TripStoreTotal(
      missingQueries: rows
          .where((row) => row.match?.priceCents == null)
          .map((row) => row.query)
          .toList(),
      pricedItemCount: priced.length,
      retailerId: retailerId,
      retailerName: rows
              .map((row) => row.match)
              .whereType<RetailerProductSearchMatch>()
              .firstOrNull
              ?.retailerName ??
          retailerId,
      totalCents:
          priced.fold(0, (total, row) => total + (row.match?.priceCents ?? 0)),
    );
  }).toList()
    ..sort((left, right) {
      if (left.pricedItemCount != right.pricedItemCount) {
        return right.pricedItemCount.compareTo(left.pricedItemCount);
      }
      if (left.totalCents != right.totalCents) {
        return left.totalCents.compareTo(right.totalCents);
      }
      return left.retailerName.compareTo(right.retailerName);
    });

  final completeStores = stores
      .where((store) =>
          results.isNotEmpty && store.pricedItemCount == results.length)
      .toList()
    ..sort((left, right) => left.totalCents.compareTo(right.totalCents));
  final bestOneStore = completeStores.firstOrNull;
  final pricedItemCount =
      items.where((item) => item.match?.priceCents != null).length;
  final splitTotalCents =
      items.fold(0, (total, item) => total + (item.match?.priceCents ?? 0));
  final splitStoreCount = items
      .map((item) => item.match?.retailerId)
      .whereType<String>()
      .toSet()
      .length;
  final isComplete = results.isNotEmpty && pricedItemCount == results.length;

  return TripComparison(
    bestOneStore: bestOneStore,
    convenienceCostCents: isComplete && bestOneStore != null
        ? (bestOneStore.totalCents - splitTotalCents).clamp(0, 1 << 31)
        : null,
    country: results.firstOrNull?.country,
    isComplete: isComplete,
    items: List.unmodifiable(items),
    pricedItemCount: pricedItemCount,
    splitStoreCount: splitStoreCount,
    splitTotalCents: splitTotalCents,
    stores: List.unmodifiable(stores),
  );
}

RetailerProductSearchMatch? _cheapestPricedMatch(
    List<RetailerProductSearchMatch> matches) {
  final priced = matches.where((match) => match.priceCents != null).toList()
    ..sort((left, right) => left.priceCents!.compareTo(right.priceCents!));
  return priced.firstOrNull;
}

extension<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
