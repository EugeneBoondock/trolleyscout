import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/ad_pricing.dart';
import 'package:trolley_scout/widgets/common.dart';

void main() {
  group('formatRand (always two decimals)', () {
    test('always shows two decimals, even for a whole amount', () {
      expect(formatRand(5000), 'R50.00');
      expect(formatRand(5050), 'R50.50');
    });

    test('stays rand however the app is configured', () {
      expect(formatRand(123456), 'R1 234.56');
    });
  });

  group('formatRandFromCents (advertising, billed in rand)', () {
    test('drops decimals for a whole rand amount', () {
      expect(formatRandFromCents(200000), 'R2 000');
    });

    test('keeps two decimals when there are cents', () {
      expect(formatRandFromCents(10050), 'R100.50');
    });
  });

  group('validUntilInfo', () {
    test('returns null when there is no date', () {
      expect(validUntilInfo(null), isNull);
      expect(validUntilInfo(''), isNull);
    });

    test('labels a future date as "Until <date>"', () {
      final future =
          DateTime.now().add(const Duration(days: 30)).toIso8601String();
      final info = validUntilInfo(future);
      expect(info, isNotNull);
      expect(info!.isExpired, isFalse);
      expect(info.label, startsWith('Until '));
    });

    test('labels a past date as "Expired"', () {
      final past =
          DateTime.now().subtract(const Duration(days: 1)).toIso8601String();
      final info = validUntilInfo(past);
      expect(info, isNotNull);
      expect(info!.isExpired, isTrue);
      expect(info.label, 'Expired');
    });

    test('keeps a date current through the end of its final day', () {
      final now = DateTime.now();
      final today = '${now.year.toString().padLeft(4, '0')}-'
          '${now.month.toString().padLeft(2, '0')}-'
          '${now.day.toString().padLeft(2, '0')}';

      final info = validUntilInfo(today);

      expect(info, isNotNull);
      expect(info!.isExpired, isFalse);
      expect(info.label, 'Expiring today');
    });
  });
}
