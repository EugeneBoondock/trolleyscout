import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/top_savings.dart';

Deal _deal(String id, {String? price, String? was}) => Deal(
      id: id,
      retailerId: 'checkers',
      retailerName: 'Checkers',
      sourceLabel: 'Feed',
      sourceUrl: 'https://retailer.test/specials',
      title: id,
      capturedAt: '2026-07-22T08:00:00.000Z',
      evidenceText: '{}',
      priceText: price,
      previousPriceText: was,
    );

Deal _auction(String id) => Deal(
      id: id,
      retailerId: 'online-marketplace',
      retailerName: 'Bob Shop',
      sourceLabel: 'Online marketplace',
      sourceUrl: 'https://market.test/item/$id',
      productUrl: 'https://market.test/item/$id',
      title: '4.86ct Colombian Emerald & Diamond Ring',
      capturedAt: '2026-07-22T08:00:00.000Z',
      evidenceText: 'Retail value R15000',
      priceText: 'R10',
      previousPriceText: 'R15000',
    );

void main() {
  test('ranks by real rand saving and drops noise was-prices', () {
    final picks = topSavingsDeals([
      _deal('small', price: 'R90', was: 'R100'),
      _deal('none', price: 'R50'),
      _deal('zero-was', price: 'R10.99', was: 'R0.00'),
      _deal('big', price: 'R200', was: 'R350'),
      _deal('medium', price: 'R80', was: 'R130'),
    ]);

    expect(picks.map((deal) => deal.id).toList(), ['big', 'medium', 'small']);
  });

  test('is empty when nothing has a real saving', () {
    expect(topSavingsDeals([_deal('flat', price: 'R50')]), isEmpty);
  });

  test('does not present auction bids as shopper savings', () {
    final picks = topSavingsDeals([
      _auction('bid'),
      _deal('groceries', price: 'R80', was: 'R130'),
    ]);

    expect(picks.map((deal) => deal.id), ['groceries']);
  });
}
