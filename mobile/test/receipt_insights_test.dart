import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/receipt_insights.dart';
import 'package:trolley_scout/receipt_vault.dart';
import 'package:trolley_scout/session_cookie_store.dart';

void main() {
  test('parses common receipt total formats without guessing a currency', () {
    expect(parseReceiptMoney('R 1 234,50')?.amount, 1234.50);
    expect(parseReceiptMoney('R 1 234,50')?.currency, 'R');
    expect(parseReceiptMoney(r'$1,234.50')?.amount, 1234.50);
    expect(parseReceiptMoney('P 500')?.amount, 500);
    expect(parseReceiptMoney('not available'), isNull);
  });

  test('builds monthly insights and excludes another currency', () {
    final receipts = [
      _receipt('1', 'Shoprite', '2026-08-01', 'R 480.00'),
      _receipt('2', 'Shoprite', '2026-08-02', 'R 220.00'),
      _receipt('3', 'Checkers', '2026-08-03', 'R 300.00'),
      _receipt('4', 'Checkers', '2026-08-04', r'$20.00'),
      _receipt('5', 'Pick n Pay', '2026-08-05', null),
      _receipt('6', 'Shoprite', '2026-07-20', 'R 800.00'),
    ];

    final insights = buildReceiptSpendInsights(
      receipts,
      now: DateTime(2026, 8, 10),
      budget: const ReceiptBudget(amount: 2000, currency: 'R'),
    );

    expect(insights.currentMonthTotal, 1000);
    expect(insights.previousMonthTotal, 800);
    expect(insights.averageReceipt, closeTo(333.33, 0.01));
    expect(insights.topRetailer, 'Shoprite');
    expect(insights.missingTotalCount, 1);
    expect(insights.excludedCurrencyCount, 1);
    expect(insights.monthlyTotals.map((month) => month.total), [0, 800, 1000]);
  });

  test('budget persists in secure storage and can be cleared', () async {
    final secrets = MemorySessionSecretBackend();
    final store = ReceiptBudgetStore(secrets: secrets);

    final budget = await store.save(amountText: '5 000,00', currency: 'R');
    expect(budget.amount, 5000);
    expect((await store.load())?.currency, 'R');

    await store.clear();
    expect(await store.load(), isNull);
  });

  test('keeps the newest paid price for each read item', () {
    final receipts = [
      _receipt(
        'new',
        'Checkers',
        '2026-08-03',
        'R 80.00',
        items: const [
          ReceiptLineItem(title: 'Fresh milk 2L', priceText: 'R 34.99'),
          ReceiptLineItem(title: 'Brown bread', priceText: 'R 18.49'),
        ],
      ),
      _receipt(
        'old',
        'Shoprite',
        '2026-07-20',
        'R 70.00',
        items: const [
          ReceiptLineItem(title: 'Fresh milk 2L', priceText: 'R 31.99'),
        ],
      ),
    ];

    final memory = buildReceiptSpendInsights(receipts).priceMemory;

    expect(memory, hasLength(2));
    expect(memory.first.title, 'Fresh milk 2L');
    expect(memory.first.priceText, 'R 34.99');
    expect(memory.first.retailerName, 'Checkers');
  });
}

ReceiptRecord _receipt(String id, String retailer, String date, String? total,
        {List<ReceiptLineItem> items = const []}) =>
    ReceiptRecord(
      id: id,
      retailerName: retailer,
      purchaseDate: date,
      imagePath: '/saved/$id.jpg',
      createdAt: '${date}T12:00:00.000Z',
      totalText: total,
      items: items,
    );
