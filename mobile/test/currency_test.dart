import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/currency.dart';
import 'package:trolley_scout/recent_searches_store.dart';

void main() {
  group('Currency.format (always two decimals)', () {
    test('writes rand with a space between thousands', () {
      expect(Currency.of('ZAR').format(123456), 'R1 234.56');
      expect(Currency.of('ZAR').format(999), 'R9.99');
      expect(Currency.of('ZAR').format(500000), 'R5 000.00');
    });

    test('writes dollars with a comma between thousands', () {
      expect(Currency.of('USD').format(123456), r'$1,234.56');
      expect(Currency.of('USD').format(499), r'$4.99');
    });

    test('falls back to the code itself for a currency we have no symbol for',
        () {
      expect(Currency.of('PLN').format(123456), 'PLN 1234.56');
      expect(Currency.of('pln').format(999), 'PLN 9.99');
    });

    test('falls back to rand when there is no currency at all', () {
      expect(Currency.of(null).format(5000), 'R50.00');
      expect(Currency.of('  ').format(5000), 'R50.00');
    });

    test('keeps a word-like symbol clear of the number', () {
      expect(Currency.of('ZWG').format(123456), 'ZiG 1,234.56');
    });

    test('reads a negative amount sign-first', () {
      expect(Currency.of('ZAR').format(-1250), '-R12.50');
    });
  });

  group('Currency.formatShort (drops a bare .00)', () {
    test('drops the decimals on a whole amount only', () {
      expect(Currency.of('ZAR').formatShort(200000), 'R2 000');
      expect(Currency.of('ZAR').formatShort(10050), 'R100.50');
      expect(Currency.of('USD').formatShort(250000), r'$2,500');
    });
  });

  group('Currency.symbol (what prompts a price field)', () {
    test('is the shopper\'s own symbol, or their code when we have none', () {
      expect(Currency.of('ZAR').symbol, 'R');
      expect(Currency.of('USD').symbol, r'$');
      expect(Currency.of('PLN').symbol, 'PLN');
    });
  });

  group('popularPropertyLocations (starter chips)', () {
    test('offers South African metros to a South African shopper', () {
      expect(popularPropertyLocations('ZA'), contains('Johannesburg'));
    });

    test('never offers South African metros to a shopper in the United States',
        () {
      final chips =
          popularPropertyLocations('US', capital: 'Washington, D.C.');

      expect(chips, ['Washington, D.C.']);
      expect(chips, isNot(contains('Johannesburg')));
    });

    test('offers nothing rather than the wrong country when we know no places',
        () {
      expect(popularPropertyLocations('FR'), isEmpty);
      expect(popularPropertyLocations('FR', capital: '  '), isEmpty);
    });
  });
}
