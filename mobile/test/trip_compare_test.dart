import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/trip_compare.dart';

void main() {
  test('parses pasted list items and removes bullets and duplicates', () {
    expect(
      parseTripQueries('1. Milk 2L\n- Bread 700g\nâ€¢ milk 2l\nEggs 18',
          limit: 3),
      ['Milk 2L', 'Bread 700g', 'Eggs 18'],
    );
  });

  test('compares split trip against the cheapest complete store', () {
    final comparison = buildTripComparison([
      _result('Milk 2L',
          [_match('a', 'Store A', 3000), _match('b', 'Store B', 2500)]),
      _result('Bread 700g',
          [_match('a', 'Store A', 1500), _match('b', 'Store B', 2000)]),
    ]);

    expect(comparison.isComplete, isTrue);
    expect(comparison.splitTotalCents, 4000);
    expect(comparison.splitStoreCount, 2);
    expect(comparison.bestOneStore?.retailerId, 'a');
    expect(comparison.bestOneStore?.totalCents, 4500);
    expect(comparison.convenienceCostCents, 500);
  });

  test('missing prices do not become zero-price complete totals', () {
    final comparison = buildTripComparison([
      _result('Milk 2L',
          [_match('a', 'Store A', 3000), _match('b', 'Store B', 2500)]),
      _result(
          'Bread 700g', [_match('a', 'Store A'), _match('b', 'Store B', 2000)]),
      _result('Eggs 18', [_match('a', 'Store A'), _match('b', 'Store B')]),
    ]);

    expect(comparison.isComplete, isFalse);
    expect(comparison.pricedItemCount, 2);
    expect(comparison.splitTotalCents, 4500);
    expect(comparison.bestOneStore, isNull);
    expect(comparison.convenienceCostCents, isNull);
    final storeA =
        comparison.stores.firstWhere((store) => store.retailerId == 'a');
    expect(storeA.missingQueries, ['Bread 700g', 'Eggs 18']);
    expect(storeA.totalCents, 3000);
  });
}

RetailerProductSearchMatch _match(String id, String name, [int? price]) =>
    RetailerProductSearchMatch(
      retailerId: id,
      retailerName: name,
      status: price == null ? 'unavailable' : 'priced',
      priceCents: price,
    );

ProductComparisonResult _result(
  String query,
  List<RetailerProductSearchMatch> matches,
) =>
    ProductComparisonResult(
      checkedAt: '2026-08-02T12:00:00.000Z',
      country: const CountryOption(
        code: 'ZA',
        currencyCode: 'ZAR',
        flag: 'ZA',
        name: 'South Africa',
      ),
      foundCount:
          matches.where((match) => match.status != 'unavailable').length,
      matches: matches,
      pricedCount: matches.where((match) => match.priceCents != null).length,
      query: query,
      savingsCents: 0,
      unavailableCount:
          matches.where((match) => match.status == 'unavailable').length,
    );
