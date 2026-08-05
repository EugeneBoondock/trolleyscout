import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/shopper_calculator.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/shopper_calculator.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('shopper maths handles discounts, unit prices, and trolley totals', () {
    expect(parseShopperMoneyToCents('R 49,99'), 4999);
    expect(discountedShopperPrice(4999, 20), 3999);
    expect(shopperUnitPrice(3999, 6), 667);

    final store = ShopperCalculatorStore();
    store.addLine(label: 'Milk', priceCents: 2499, quantity: 2);
    store.addLine(label: 'Bread', priceCents: 1899, quantity: 1);
    store.setBudgetCents(10000);

    expect(store.totalCents, 6897);
    expect(store.itemCount, 3);
    expect(store.remainingBudgetCents, 3103);
  });

  test('VAT maths handles inclusive, exclusive, and zero-rated products', () {
    expect(shopperVatFromInclusive(11500), 1500);
    expect(shopperVatOnExclusive(10000), 1500);
    expect(isLikelyZeroRatedShopperItem('2L full cream milk'), isTrue);
    expect(isLikelyZeroRatedShopperItem('Milk chocolate slab'), isFalse);
    expect(isLikelyZeroRatedShopperItem('Extra virgin olive oil'), isFalse);
    expect(isLikelyZeroRatedShopperItem('Brown bread loaf'), isTrue);
  });

  test('calculator setting and trolley survive a new app session', () async {
    final first = ShopperCalculatorStore();
    await first.setEnabled(true);
    await first.setBudgetCents(12500);
    await first.addLine(
      label: 'Coffee',
      priceCents: 7999,
      quantity: 1,
    );

    final restored = ShopperCalculatorStore();
    await restored.load();

    expect(restored.enabled, isTrue);
    expect(restored.budgetCents, 12500);
    expect(restored.lines.single.label, 'Coffee');
    expect(restored.totalCents, 7999);
  });

  test('removing a trolley line can be undone', () {
    final store = ShopperCalculatorStore();
    store.addLine(label: 'Rice', priceCents: 5000, quantity: 1);
    final id = store.lines.single.id;

    store.removeLine(id);
    expect(store.lines, isEmpty);
    expect(store.canUndo, isTrue);

    store.undo();
    expect(store.lines.single.label, 'Rice');
  });

  testWidgets('floating calculator adds a discounted multi-pack item',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = ShopperCalculatorStore();
    await store.setEnabled(true);
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        floatingActionButton: ShopperCalculatorButton(store: store),
      ),
    ));

    await tester.tap(find.byTooltip('Open shopper calculator'));
    await tester.pumpAndSettle();
    expect(find.text('Shopper calculator'), findsOneWidget);
    expect(
      tester.widget<CheckboxListTile>(
        find.byKey(const Key('calculator-include-vat')),
      ).value,
      isTrue,
    );

    await tester.enterText(
      find.byKey(const Key('calculator-item-label')),
      'Yoghurt pack',
    );
    await tester.enterText(
      find.byKey(const Key('calculator-item-price')),
      '60.00',
    );
    await tester.enterText(
      find.byKey(const Key('calculator-item-quantity')),
      '2',
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('calculator-discount-20')),
    );
    await tester.tap(find.byKey(const Key('calculator-discount-20')));
    await tester.pump();
    expect(find.text('Pay R48.00 each'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('calculator-add-item')));
    await tester.tap(find.byKey(const Key('calculator-add-item')));
    await tester.pumpAndSettle();

    expect(store.lines.single.label, 'Yoghurt pack');
    expect(store.lines.single.priceCents, 4800);
    expect(store.lines.single.quantity, 2);
    expect(find.text('R96.00'), findsWidgets);
  });

  testWidgets('unticking Include VAT adds 15 percent to a standard item',
      (tester) async {
    final store = ShopperCalculatorStore();
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(body: Builder(
        builder: (context) => TextButton(
          onPressed: () => showShopperCalculator(context, store),
          child: const Text('Open'),
        ),
      )),
    ));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('calculator-item-label')),
      'Dishwashing liquid',
    );
    await tester.enterText(
      find.byKey(const Key('calculator-item-price')),
      '100.00',
    );
    await tester.ensureVisible(
      find.byKey(const Key('calculator-include-vat')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('calculator-include-vat')));
    await tester.pump();
    expect(find.text('Adds R15.00 VAT at 15%'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('calculator-add-item')));
    tester
        .widget<FilledButton>(find.byKey(const Key('calculator-add-item')))
        .onPressed!();
    await tester.pumpAndSettle();
    expect(store.lines.single.priceCents, 11500);
    expect(store.lines.single.vatAdded, isTrue);
  });
}
