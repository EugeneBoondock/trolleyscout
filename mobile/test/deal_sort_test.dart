import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/deal_filters.dart';

Deal _deal({
  required String id,
  String? price,
  String? previous,
  String? saving,
  String capturedAt = '',
}) =>
    Deal(
      id: id,
      title: 'Item $id',
      retailerName: 'Store',
      priceText: price,
      previousPriceText: previous,
      savingText: saving,
      capturedAt: capturedAt,
    );

void main() {
  group('dealSavingCents', () {
    test('computes saving from previous minus current price', () {
      final deal = _deal(id: 'a', price: 'R20', previous: 'R30');
      expect(dealSavingCents(deal), 1000);
    });

    test('falls back to a rand amount in the saving text', () {
      final deal = _deal(id: 'b', saving: 'Save R8');
      expect(dealSavingCents(deal), 800);
    });

    test('is null when only a percentage is given', () {
      final deal = _deal(id: 'c', saving: '25% off');
      expect(dealSavingCents(deal), isNull);
    });
  });

  group('dealDiscountFraction', () {
    test('computes fraction from prices', () {
      final deal = _deal(id: 'a', price: 'R15', previous: 'R30');
      expect(dealDiscountFraction(deal), closeTo(0.5, 0.0001));
    });

    test('reads a percentage from the saving text', () {
      final deal = _deal(id: 'b', saving: '25% off');
      expect(dealDiscountFraction(deal), closeTo(0.25, 0.0001));
    });
  });

  group('sortDeals', () {
    test('store order is unchanged', () {
      final deals = [_deal(id: 'a'), _deal(id: 'b'), _deal(id: 'c')];
      final sorted = sortDeals(deals, DealSort.store);
      expect(sorted.map((d) => d.id), ['a', 'b', 'c']);
    });

    test('latest orders by capturedAt descending, empties last', () {
      final deals = [
        _deal(id: 'old', capturedAt: '2026-01-01T00:00:00Z'),
        _deal(id: 'none'),
        _deal(id: 'new', capturedAt: '2026-06-01T00:00:00Z'),
      ];
      final sorted = sortDeals(deals, DealSort.latest);
      expect(sorted.map((d) => d.id), ['new', 'old', 'none']);
    });

    test('most saved orders by saving descending, unparseable last', () {
      final deals = [
        _deal(id: 'small', price: 'R18', previous: 'R20'),
        _deal(id: 'none', saving: '10% off'),
        _deal(id: 'big', price: 'R10', previous: 'R30'),
      ];
      final sorted = sortDeals(deals, DealSort.mostSaved);
      expect(sorted.map((d) => d.id), ['big', 'small', 'none']);
    });

    test('price low to high orders ascending, priceless last', () {
      final deals = [
        _deal(id: 'mid', price: 'R20'),
        _deal(id: 'none'),
        _deal(id: 'cheap', price: 'R5'),
      ];
      final sorted = sortDeals(deals, DealSort.priceLowToHigh);
      expect(sorted.map((d) => d.id), ['cheap', 'mid', 'none']);
    });

    test('does not mutate the input list', () {
      final deals = [
        _deal(id: 'a', price: 'R30'),
        _deal(id: 'b', price: 'R10'),
      ];
      sortDeals(deals, DealSort.priceLowToHigh);
      expect(deals.map((d) => d.id), ['a', 'b']);
    });
  });
}
