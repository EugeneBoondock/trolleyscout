import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/similar_deals.dart';

const _baseUrl = 'https://shop.test/product';

Deal _deal({
  required String id,
  required String retailerId,
  required String retailerName,
  required String title,
  bool soldOut = false,
}) =>
    Deal(
      id: id,
      retailerId: retailerId,
      retailerName: retailerName,
      sourceLabel: 'Weekly offers',
      sourceUrl: _baseUrl,
      evidenceText: 'Official source',
      productUrl: _baseUrl,
      title: title,
      soldOut: soldOut,
    );

void main() {
  test('ranks product alternatives ahead of broad category matches', () {
    final target = _deal(
      id: 'milk-one',
      retailerId: 'spar',
      retailerName: 'SPAR',
      title: 'Long life full cream milk 6 x 1L',
    );
    final results = findSimilarDeals(target, [
      _deal(
        id: 'bread',
        retailerId: 'spar',
        retailerName: 'SPAR',
        title: 'Brown bread loaf',
      ),
      _deal(
        id: 'milk-two',
        retailerId: 'shoprite',
        retailerName: 'Shoprite',
        title: 'Full cream long life milk 1L',
      ),
      _deal(
        id: 'milk-three',
        retailerId: 'pnp',
        retailerName: 'Pick n Pay',
        title: 'Fresh low fat milk 2L',
      ),
    ]);

    expect(results.map((deal) => deal.id), ['milk-two', 'milk-three']);
  });

  test('excludes the selected and sold-out deals', () {
    final target = _deal(
      id: 'rice-one',
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      title: 'Long grain rice 2kg',
    );

    expect(
      findSimilarDeals(target, [
        target,
        _deal(
          id: 'rice-two',
          retailerId: 'pnp',
          retailerName: 'Pick n Pay',
          title: 'Long grain rice 5kg',
          soldOut: true,
        ),
      ]),
      isEmpty,
    );
  });

  test('indexes a production-sized feed once for every visible page', () {
    final deals = List.generate(
      2000,
      (index) => _deal(
        id: 'deal-$index',
        retailerId: 'store-${index % 20}',
        retailerName: 'Store ${index % 20}',
        title: 'Full cream milk ${index % 12 + 1}L value pack',
      ),
    );
    final index = SimilarDealsIndex(deals);

    for (final deal in deals.take(24)) {
      expect(index.find(deal), hasLength(4));
    }

    expect(index.indexedDealCount, deals.length);
  });
}
