import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/receipt_scan.dart';

void main() {
  test('reads retailer, date, total and priced items from a grocery receipt',
      () {
    final result = parseReceiptScanText('''
CHECKERS HYPER
Sandton City
TAX INVOICE
DATE 02/08/2026 14:31
MILK FULL CREAM 2L       R34.99
BROWN BREAD 700G         R18.49
2 X BANANAS              R24.00
SUBTOTAL                 R77.48
VAT                      R7.36
GRAND TOTAL              R77.48
CASH                     R100.00
CHANGE                   R22.52
''');

    expect(result.retailerName, 'Checkers Hyper');
    expect(result.purchaseDate, '2026-08-02');
    expect(result.totalText, 'R77.48');
    expect(result.items.map((item) => item.title), [
      'Milk full cream 2l',
      'Brown bread 700g',
      'Bananas',
    ]);
    expect(result.items.map((item) => item.priceText), [
      'R34.99',
      'R18.49',
      'R24.00',
    ]);
  });

  test('supports ISO dates and a known retailer without a total', () {
    final result = parseReceiptScanText('''
FOOD LOVERS MARKET
PURCHASE 2026-07-29
AVOCADOS 4 PACK 39.99
APPLES 1.5KG 44.95
''');

    expect(result.retailerName, 'Food Lover’s Market');
    expect(result.purchaseDate, '2026-07-29');
    expect(result.totalText, isNull);
    expect(result.items, hasLength(2));
  });

  test('editable item lines keep products without prices', () {
    final items = parseEditableReceiptItems('''
Milk 2L  R 34.99
Eggs large 18 pack
TOTAL R 34.99
''');

    expect(items, hasLength(2));
    expect(items.first.title, 'Milk 2L');
    expect(items.first.priceText, 'R 34.99');
    expect(items.last.title, 'Eggs large 18 pack');
    expect(items.last.priceText, isNull);
  });

  test('invalid calendar dates are ignored', () {
    final result = parseReceiptScanText('''
SHOPRITE
31/02/2026
MAIZE MEAL 10KG R99.99
TOTAL R99.99
''');

    expect(result.purchaseDate, isNull);
  });
}
