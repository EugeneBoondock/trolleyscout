import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/unit_price.dart';

void main() {
  group('parseRandsToCents', () {
    test('parses a rand string with the R prefix and comma decimal', () {
      expect(parseRandsToCents('R24,99'), 2499);
    });

    test('parses a plain decimal amount', () {
      expect(parseRandsToCents('12.50'), 1250);
    });

    test('returns null for non-numeric input', () {
      expect(parseRandsToCents('cheap'), isNull);
    });
  });

  group('parseQuantity', () {
    test('parses a comma decimal quantity', () {
      expect(parseQuantity('1,5'), 1.5);
    });

    test('rejects zero and negatives', () {
      expect(parseQuantity('0'), isNull);
      expect(parseQuantity('-2'), isNull);
    });
  });

  group('compareUnitPrices', () {
    test('flags the pack with the lowest price per kg as cheapest', () {
      final comparison = compareUnitPrices([
        const PackDraft(id: 'a', priceText: 'R20', quantityText: '500', unit: PackUnit.g),
        const PackDraft(id: 'b', priceText: 'R30', quantityText: '1', unit: PackUnit.kg),
      ]);

      // a: R20/500g = R40/kg; b: R30/1kg = R30/kg → b wins.
      expect(comparison.bestId, 'b');
      expect(comparison.hasMixedUnits, isFalse);
      final a = comparison.results.firstWhere((r) => r.id == 'a');
      expect(a.isBest, isFalse);
      expect(a.percentMoreThanBest, 33); // (4000-3000)/3000 ≈ 33%
    });

    test('does not pick a winner when base units are mixed', () {
      final comparison = compareUnitPrices([
        const PackDraft(id: 'a', priceText: 'R20', quantityText: '500', unit: PackUnit.g),
        const PackDraft(id: 'b', priceText: 'R30', quantityText: '1', unit: PackUnit.l),
      ]);

      expect(comparison.hasMixedUnits, isTrue);
      expect(comparison.bestId, isNull);
      expect(comparison.results.every((r) => !r.isBest), isTrue);
    });

    test('skips packs with unparseable price or size', () {
      final comparison = compareUnitPrices([
        const PackDraft(id: 'a', priceText: 'R20', quantityText: '500', unit: PackUnit.g),
        const PackDraft(id: 'b', priceText: '', quantityText: '1', unit: PackUnit.kg),
      ]);

      expect(comparison.results.length, 1);
      expect(comparison.results.single.id, 'a');
    });
  });

  group('formatUnitPrice', () {
    test('formats per-kg, per-litre and each', () {
      expect(formatUnitPrice(3000, BaseUnit.kg), 'R30.00 / kg');
      expect(formatUnitPrice(1550, BaseUnit.litre), 'R15.50 / L');
      expect(formatUnitPrice(999, BaseUnit.each), 'R9.99 each');
    });
  });
}
