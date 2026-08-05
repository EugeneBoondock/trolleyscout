import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/basket_run.dart';

void main() {
  test('groups quantities and source-backed totals by retailer', () {
    final basket = Basket(
      items: [
        _item('bread', 'shoprite', 'Shoprite', 2, 4000, 600),
        _item('milk', 'checkers', 'Checkers', 1, 2300, 200),
        _item('eggs', 'shoprite', 'Shoprite', 1, null, null),
      ],
      summary: const BasketSummary(
        itemCount: 4,
        knownPriceItemCount: 3,
        savingsCents: 800,
        totalCents: 6300,
      ),
    );

    final stops = buildBasketStoreStops(basket);
    expect(stops, hasLength(2));
    expect(stops.first.retailerId, 'checkers');
    expect(stops.first.totalCents, 2300);
    expect(stops.last.retailerId, 'shoprite');
    expect(stops.last.itemCount, 3);
    expect(stops.last.knownPriceItemCount, 2);
    expect(stops.last.totalCents, 4000);
    expect(stops.last.savingsCents, 600);
  });

  test('formats a shareable list with store stops, links, and honest totals',
      () {
    final basket = Basket(
      items: [
        _item('bread', 'shoprite', 'Shoprite', 2, 4000, 600),
        _item('eggs', 'shoprite', 'Shoprite', 1, null, null),
      ],
      summary: const BasketSummary(
        itemCount: 3,
        knownPriceItemCount: 2,
        savingsCents: 600,
        totalCents: 4000,
      ),
    );

    final text = formatBasketShareText(
      basket,
      formatMoney: (cents) => 'R${(cents / 100).toStringAsFixed(2)}',
    );

    expect(text, contains('1. Shoprite (R40.00 known subtotal)'));
    expect(text, contains('• 2 × bread: R40.00'));
    expect(text, contains('https://example.test/bread'));
    expect(text, contains('• 1 × eggs: price not found'));
    expect(text, contains('Savings found: R6.00'));
  });
}

BasketItem _item(
  String id,
  String retailerId,
  String retailerName,
  int quantity,
  int? linePriceCents,
  int? lineSavingCents,
) =>
    BasketItem(
      id: id,
      savedDealId: 'saved-$id',
      quantity: quantity,
      deal: SavedDeal(
        id: 'deal-$id',
        retailerId: retailerId,
        retailerName: retailerName,
        sourceLabel: 'Weekly offers',
        sourceUrl: 'https://example.test/$retailerId',
        productUrl: 'https://example.test/$id',
        title: id,
        capturedAt: '2026-08-01T10:00:00.000Z',
        evidenceText: id,
        savedAt: '2026-08-01T10:00:00.000Z',
      ),
      linePriceCents: linePriceCents,
      lineSavingCents: lineSavingCents,
    );
