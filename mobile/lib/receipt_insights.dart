import 'dart:convert';
import 'dart:math';

import 'receipt_vault.dart';
import 'session_cookie_store.dart';

class ReceiptMoney {
  const ReceiptMoney({required this.amount, required this.currency});

  final double amount;
  final String currency;
}

class ReceiptBudget {
  const ReceiptBudget({required this.amount, required this.currency});

  factory ReceiptBudget.fromJson(Map<String, dynamic> json) => ReceiptBudget(
        amount: json['amount'] is num ? (json['amount'] as num).toDouble() : 0,
        currency: json['currency'] is String ? json['currency'] as String : '',
      );

  final double amount;
  final String currency;

  Map<String, dynamic> toJson() => {
        'amount': amount,
        'currency': currency,
      };
}

class ReceiptBudgetStore {
  ReceiptBudgetStore({SessionSecretBackend? secrets})
      : _secrets = secrets ?? FlutterSessionSecretBackend();

  static const _key = 'trolley_scout_receipt_budget_v1';
  final SessionSecretBackend _secrets;

  Future<ReceiptBudget?> load() async {
    final raw = await _secrets.read(_key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final budget = ReceiptBudget.fromJson(Map<String, dynamic>.from(decoded));
      if (budget.amount <= 0 || budget.currency.isEmpty) return null;
      return budget;
    } catch (_) {
      return null;
    }
  }

  Future<ReceiptBudget> save({
    required String amountText,
    required String currency,
  }) async {
    final amount = parseReceiptMoney(amountText)?.amount;
    final cleanCurrency = _cleanCurrency(currency);
    if (amount == null || amount <= 0 || cleanCurrency.isEmpty) {
      throw const FormatException('Add a currency and a valid budget amount.');
    }
    final budget = ReceiptBudget(amount: amount, currency: cleanCurrency);
    await _secrets.write(_key, jsonEncode(budget.toJson()));
    return budget;
  }

  Future<void> clear() => _secrets.delete(_key);
}

class ReceiptMonthTotal {
  const ReceiptMonthTotal({required this.month, required this.total});

  final DateTime month;
  final double total;
}

class ReceiptPriceMemory {
  const ReceiptPriceMemory({
    required this.title,
    required this.priceText,
    required this.retailerName,
    required this.purchaseDate,
  });

  final String title;
  final String priceText;
  final String retailerName;
  final String purchaseDate;
}

class ReceiptSpendInsights {
  const ReceiptSpendInsights({
    required this.currency,
    required this.currentMonthTotal,
    required this.previousMonthTotal,
    required this.currentReceiptCount,
    required this.missingTotalCount,
    required this.excludedCurrencyCount,
    required this.monthlyTotals,
    required this.priceMemory,
    this.topRetailer,
  });

  final String currency;
  final double currentMonthTotal;
  final double previousMonthTotal;
  final int currentReceiptCount;
  final int missingTotalCount;
  final int excludedCurrencyCount;
  final List<ReceiptMonthTotal> monthlyTotals;
  final List<ReceiptPriceMemory> priceMemory;
  final String? topRetailer;

  double get averageReceipt =>
      currentReceiptCount == 0 ? 0 : currentMonthTotal / currentReceiptCount;
}

ReceiptSpendInsights buildReceiptSpendInsights(
  List<ReceiptRecord> receipts, {
  DateTime? now,
  ReceiptBudget? budget,
}) {
  final today = now ?? DateTime.now();
  final currentMonth = DateTime(today.year, today.month);
  final previousMonth = DateTime(today.year, today.month - 1);
  final parsed = <({ReceiptRecord receipt, ReceiptMoney money})>[];
  for (final receipt in receipts) {
    final money = parseReceiptMoney(receipt.totalText);
    if (money != null) parsed.add((receipt: receipt, money: money));
  }

  final currency = budget?.currency ?? _dominantCurrency(parsed);
  bool usable(ReceiptMoney money) =>
      currency.isEmpty ||
      money.currency.isEmpty ||
      money.currency.toLowerCase() == currency.toLowerCase();
  bool inMonth(ReceiptRecord receipt, DateTime month) {
    final date = DateTime.tryParse(receipt.purchaseDate);
    return date != null && date.year == month.year && date.month == month.month;
  }

  final current = parsed
      .where((entry) =>
          inMonth(entry.receipt, currentMonth) && usable(entry.money))
      .toList();
  final previous = parsed
      .where((entry) =>
          inMonth(entry.receipt, previousMonth) && usable(entry.money))
      .toList();
  final retailerTotals = <String, double>{};
  for (final entry in current) {
    retailerTotals.update(
      entry.receipt.retailerName,
      (value) => value + entry.money.amount,
      ifAbsent: () => entry.money.amount,
    );
  }
  final topRetailer = retailerTotals.entries.isEmpty
      ? null
      : (retailerTotals.entries.toList()
            ..sort((left, right) => right.value.compareTo(left.value)))
          .first
          .key;

  final monthlyTotals = List.generate(3, (index) {
    final month = DateTime(today.year, today.month - 2 + index);
    final total = parsed
        .where((entry) => inMonth(entry.receipt, month) && usable(entry.money))
        .fold<double>(0, (sum, entry) => sum + entry.money.amount);
    return ReceiptMonthTotal(month: month, total: total);
  });
  final currentReceipts =
      receipts.where((receipt) => inMonth(receipt, currentMonth)).toList();
  final priceMemory = _buildPriceMemory(receipts);

  return ReceiptSpendInsights(
    currency: currency,
    currentMonthTotal:
        current.fold(0, (sum, entry) => sum + entry.money.amount),
    previousMonthTotal:
        previous.fold(0, (sum, entry) => sum + entry.money.amount),
    currentReceiptCount: current.length,
    missingTotalCount: currentReceipts
        .where((receipt) => parseReceiptMoney(receipt.totalText) == null)
        .length,
    excludedCurrencyCount: parsed
        .where((entry) =>
            inMonth(entry.receipt, currentMonth) && !usable(entry.money))
        .length,
    topRetailer: topRetailer,
    monthlyTotals: List.unmodifiable(monthlyTotals),
    priceMemory: priceMemory,
  );
}

List<ReceiptPriceMemory> _buildPriceMemory(List<ReceiptRecord> receipts) {
  final newestFirst = [...receipts]
    ..sort((left, right) => right.purchaseDate.compareTo(left.purchaseDate));
  final seen = <String>{};
  final memory = <ReceiptPriceMemory>[];
  for (final receipt in newestFirst) {
    for (final item in receipt.items) {
      if (memory.length >= 8) return List.unmodifiable(memory);
      final price = item.priceText?.trim();
      if (price == null || price.isEmpty || parseReceiptMoney(price) == null) {
        continue;
      }
      final key = item.title
          .toLowerCase()
          .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
          .trim();
      if (key.length < 2 || !seen.add(key)) continue;
      memory.add(
        ReceiptPriceMemory(
          title: item.title,
          priceText: price,
          retailerName: receipt.retailerName,
          purchaseDate: receipt.purchaseDate,
        ),
      );
    }
  }
  return List.unmodifiable(memory);
}

ReceiptMoney? parseReceiptMoney(String? value) {
  if (value == null) return null;
  final clean = value.trim();
  if (clean.isEmpty) return null;
  final match = RegExp(r'-?\d[\d\s.,]*').firstMatch(clean);
  if (match == null) return null;
  var number = match.group(0)!.replaceAll(RegExp(r'\s+'), '');
  final comma = number.lastIndexOf(',');
  final dot = number.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      number = number.replaceAll('.', '').replaceFirst(',', '.');
    } else {
      number = number.replaceAll(',', '');
    }
  } else if (comma >= 0) {
    final decimalDigits = number.length - comma - 1;
    number = decimalDigits == 2
        ? number.replaceFirst(',', '.')
        : number.replaceAll(',', '');
  } else if (dot >= 0) {
    final decimalDigits = number.length - dot - 1;
    if (decimalDigits != 2) number = number.replaceAll('.', '');
  }
  final amount = double.tryParse(number);
  if (amount == null || !amount.isFinite || amount < 0) return null;
  final currency =
      _cleanCurrency(clean.replaceRange(match.start, match.end, ''));
  return ReceiptMoney(amount: amount, currency: currency);
}

String formatReceiptMoney(double amount, String currency) {
  final prefix = _cleanCurrency(currency);
  final formatted = amount.toStringAsFixed(2);
  return prefix.isEmpty ? formatted : '$prefix $formatted';
}

String _dominantCurrency(
  List<({ReceiptRecord receipt, ReceiptMoney money})> parsed,
) {
  final counts = <String, int>{};
  for (final entry in parsed) {
    if (entry.money.currency.isEmpty) continue;
    counts.update(entry.money.currency, (value) => value + 1,
        ifAbsent: () => 1);
  }
  if (counts.isEmpty) return '';
  final ranked = counts.entries.toList()
    ..sort((left, right) {
      final count = right.value.compareTo(left.value);
      return count != 0 ? count : left.key.compareTo(right.key);
    });
  return ranked.first.key;
}

String _cleanCurrency(String value) {
  final clean =
      value.replaceAll(RegExp(r'[^A-Za-z$€£¥₹₦₱₵₭₲₴₸₺₼₽₾₿]'), '').trim();
  return clean.substring(0, min(clean.length, 8));
}
