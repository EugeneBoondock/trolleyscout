import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/basket_screen.dart';

void main() {
  testWidgets('shows a store stop and a usable shopping checklist',
      (tester) async {
    final api = _SlowBasketApi();
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData.light(),
      darkTheme: ThemeData.dark(),
      home: Scaffold(body: BasketScreen(api: api)),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Store stops'), findsOneWidget);
    expect(find.text('Price coverage'), findsOneWidget);
    expect(find.text('1/1'), findsOneWidget);
    expect(find.text('STORE STOP 1'), findsOneWidget);
    expect(find.text('Example Market'), findsOneWidget);
    expect(find.textContaining('0 of 1 products'), findsOneWidget);

    final check = find.byKey(const ValueKey('basket-check-basket-1'));
    await tester.ensureVisible(check);
    await tester.pumpAndSettle();
    await tester.tap(check);
    await tester.pump();

    expect(find.text('In trolley'), findsOneWidget);
    expect(find.textContaining('1 of 1 products'), findsOneWidget);
  });

  testWidgets('shares the complete shopping list from the basket',
      (tester) async {
    String? sharedText;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: BasketScreen(
          api: _SlowBasketApi(),
          shareBasket: (text) async => sharedText = text,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Share shopping list'));
    await tester.pumpAndSettle();

    expect(sharedText, contains('Trolley Scout shopping list'));
    expect(sharedText, contains('Example Market'));
    expect(sharedText, contains('Example maize meal'));
    expect(sharedText, contains('Known total: R123.45'));
  });

  testWidgets(
      'increasing quantity updates the count optimistically before the API call resolves',
      (tester) async {
    final api = _SlowBasketApi();
    await tester
        .pumpWidget(MaterialApp(home: Scaffold(body: BasketScreen(api: api))));
    await tester.pumpAndSettle();

    final quantity = find.byKey(const ValueKey('basket-quantity-basket-1'));
    expect(tester.widget<Text>(quantity).data, '1');

    final increase = find.byTooltip('Increase quantity');
    await tester.drag(find.byType(ListView), const Offset(0, -350));
    await tester.pumpAndSettle();
    await tester.tap(increase);
    // A single pump — the update's Completer is still unresolved at this
    // point, so if the quantity has already changed it can only be because
    // the UI updated optimistically, not because the server responded.
    await tester.pump();

    expect(tester.widget<Text>(quantity).data, '2');
    expect(api.pendingQuantity, 2);
    expect(api.resolved, isFalse);

    api.resolve();
    await tester.pumpAndSettle();
    expect(tester.widget<Text>(quantity).data, '2');
  });

  testWidgets('a failed quantity update reverts the optimistic change',
      (tester) async {
    final api = _SlowBasketApi(failNext: true);
    await tester
        .pumpWidget(MaterialApp(home: Scaffold(body: BasketScreen(api: api))));
    await tester.pumpAndSettle();

    final increase = find.byTooltip('Increase quantity');
    await tester.drag(find.byType(ListView), const Offset(0, -350));
    await tester.pumpAndSettle();
    await tester.tap(increase);
    await tester.pump();
    final quantity = find.byKey(const ValueKey('basket-quantity-basket-1'));
    expect(tester.widget<Text>(quantity).data, '2');

    api.resolve();
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(quantity).data, '1');
    expect(find.text('Could not update quantity.'), findsOneWidget);
  });

  testWidgets('removing an item takes it out of the list immediately',
      (tester) async {
    final api = _SlowBasketApi();
    await tester
        .pumpWidget(MaterialApp(home: Scaffold(body: BasketScreen(api: api))));
    await tester.pumpAndSettle();

    expect(find.text('Example maize meal'), findsOneWidget);

    final remove = find.byTooltip('Remove basket item');
    await tester.drag(find.byType(ListView), const Offset(0, -350));
    await tester.pumpAndSettle();
    await tester.tap(remove);
    await tester.pump();

    // The optimistic removal happens before the (still-pending) delete call
    // resolves, and the empty state — plus the Undo snackbar — is shown
    // right away.
    expect(find.text('Example maize meal'), findsNothing);
    expect(find.text('Your basket is empty.'), findsOneWidget);
    expect(find.text('Undo'), findsOneWidget);

    api.resolve();
    await tester.pumpAndSettle();
  });
}

class _SlowBasketApi extends Api {
  _SlowBasketApi({this.failNext = false})
      : super(baseUrl: 'https://example.test');

  final bool failNext;
  int? pendingQuantity;
  bool resolved = false;
  Completer<Basket>? _completer;
  Basket _basket = _initialBasket;

  @override
  Future<Basket> basket() async => _basket;

  @override
  Future<Basket> updateBasketItem(String id, int quantity) {
    pendingQuantity = quantity;
    final completer = Completer<Basket>();
    _completer = completer;
    return completer.future;
  }

  @override
  Future<Basket> deleteBasketItem(String id) {
    final completer = Completer<Basket>();
    _completer = completer;
    return completer.future;
  }

  @override
  Future<Basket> addBasketItem(String savedDealId, {int quantity = 1}) async {
    _basket = _initialBasket;
    return _basket;
  }

  void resolve() {
    resolved = true;
    final completer = _completer;
    if (completer == null || completer.isCompleted) return;
    if (failNext) {
      completer.completeError(const ApiException('Could not update quantity.'));
      return;
    }
    final quantity = pendingQuantity;
    _basket = quantity == null
        ? const Basket.empty()
        : Basket(
            items: [
              BasketItem(
                id: 'basket-1',
                savedDealId: 'saved-1',
                quantity: quantity,
                deal: _savedDeal,
              ),
            ],
            summary: BasketSummary(
              itemCount: quantity,
              knownPriceItemCount: quantity,
              totalCents: 12345 * quantity,
              savingsCents: 1000 * quantity,
            ),
          );
    completer.complete(_basket);
  }
}

const _savedDeal = SavedDeal(
  id: 'saved-1',
  retailerId: 'pick-n-pay',
  retailerName: 'Example Market',
  sourceLabel: 'Weekly specials',
  sourceUrl: 'https://example.test/specials',
  productUrl: 'https://example.test/maize',
  title: 'Example maize meal',
  capturedAt: '2026-07-15T10:00:00.000Z',
  evidenceText: 'Example maize meal R123.45',
  priceText: 'R123.45',
  savedAt: '2026-07-15T10:00:00.000Z',
);

const _initialBasket = Basket(
  items: [
    BasketItem(
      id: 'basket-1',
      savedDealId: 'saved-1',
      quantity: 1,
      deal: _savedDeal,
      linePriceCents: 12345,
      lineSavingCents: 1000,
    ),
  ],
  summary: BasketSummary(
    itemCount: 1,
    knownPriceItemCount: 1,
    totalCents: 12345,
    savingsCents: 1000,
  ),
);
