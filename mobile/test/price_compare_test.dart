import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/price_compare.dart';

Deal deal(String retailerId, String retailerName, String title, {String? priceText}) => Deal(
      evidenceText: '',
      priceText: priceText,
      retailerId: retailerId,
      retailerName: retailerName,
      title: title,
    );

const retailers = [
  StoreOption(id: 'checkers', name: 'Checkers'),
  StoreOption(id: 'shoprite', name: 'Shoprite'),
  StoreOption(id: 'woolworths', name: 'Woolworths'),
];

void main() {
  group('extractPriceCents', () {
    test('reads rand amounts out of free text', () {
      expect(extractPriceCents('R24.99'), 2499);
      expect(extractPriceCents('R 24,99 each'), 2499);
      expect(extractPriceCents('Now R19'), 1900);
      expect(extractPriceCents('19.50'), 1950);
    });

    test('returns null when there is no usable price', () {
      expect(extractPriceCents(null), isNull);
      expect(extractPriceCents('Buy one get one free'), isNull);
      expect(extractPriceCents('R0'), isNull);
    });
  });

  group('dealMatchesQuery', () {
    test('requires every meaningful word of the query', () {
      final white = deal('checkers', 'Checkers', 'Albany White Bread 700g');
      expect(dealMatchesQuery(white, 'white bread'), isTrue);
      expect(dealMatchesQuery(white, 'brown bread'), isFalse);
    });

    test('an empty query matches nothing', () {
      expect(dealMatchesQuery(deal('checkers', 'Checkers', 'Bread'), '  '), isFalse);
    });
  });

  group('store options', () {
    final deals = [
      deal('woolworths', 'Woolworths', 'Bread'),
      deal('checkers', 'Checkers', 'Bread'),
      deal('checkers', 'Checkers', 'Milk'),
      deal('boxer', 'Boxer', 'Rice'),
    ];

    test('lists each store once, sorted by name', () {
      expect(storeOptionsFromDeals(deals).map((s) => s.id).toList(),
          ['boxer', 'checkers', 'woolworths']);
    });

    test('defaults to the first two stores', () {
      expect(defaultStoreIds(deals), ['boxer', 'checkers']);
    });

    test('has no defaults when we hold no deals', () {
      expect(defaultStoreIds(const []), isEmpty);
    });
  });

  group('autoComparePrices', () {
    final deals = [
      deal('checkers', 'Checkers', 'White Bread 700g', priceText: 'R21.99'),
      deal('shoprite', 'Shoprite', 'White Bread 700g', priceText: 'R17.99'),
      deal('woolworths', 'Woolworths', 'White Bread 700g', priceText: 'R25.99'),
    ];

    test('compares three or more stores and flags the cheapest', () {
      final result = autoComparePrices(deals, 'white bread', retailers);

      expect(result.foundCount, 3);
      expect(result.cheapestRetailerId, 'shoprite');
      expect(result.savingsCents, 800);
      expect(result.matches.firstWhere((m) => m.retailerId == 'shoprite').isCheapest, isTrue);
      expect(result.matches.firstWhere((m) => m.retailerId == 'checkers').isCheapest, isFalse);
    });

    test('reports a store with no match as missing, never as free', () {
      final result = autoComparePrices(deals, 'white bread', [
        ...retailers,
        const StoreOption(id: 'boxer', name: 'Boxer'),
      ]);
      final boxer = result.matches.firstWhere((m) => m.retailerId == 'boxer');

      expect(boxer.priceCents, isNull);
      expect(boxer.deal, isNull);
      expect(result.missingCount, 1);
      expect(result.foundCount, 3);
    });

    test('defaults gracefully when nothing matches anywhere', () {
      final result = autoComparePrices(deals, 'caviar', retailers);

      expect(result.foundCount, 0);
      expect(result.cheapestRetailerId, isNull);
      expect(result.savingsCents, 0);
    });
  });
}
