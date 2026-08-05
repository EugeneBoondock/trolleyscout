import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'receipt_insights.dart';
import 'receipt_vault.dart';

typedef ReceiptImageScanner = Future<ReceiptScanResult?> Function(
  String imagePath,
);

class ReceiptScanResult {
  const ReceiptScanResult({
    this.retailerName,
    this.purchaseDate,
    this.totalText,
    this.items = const [],
  });

  final String? retailerName;
  final String? purchaseDate;
  final String? totalText;
  final List<ReceiptLineItem> items;

  bool get hasData =>
      retailerName != null ||
      purchaseDate != null ||
      totalText != null ||
      items.isNotEmpty;
}

const MethodChannel _receiptOcrChannel = MethodChannel(
  'za.co.trolleyscout/receipt_ocr',
);

Future<ReceiptScanResult?> scanReceiptImage(String imagePath) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;
  final text = await _receiptOcrChannel.invokeMethod<String>(
    'recognizeText',
    {'path': imagePath},
  );
  if (text == null || text.trim().isEmpty) return null;
  final result = parseReceiptScanText(text);
  return result.hasData ? result : null;
}

ReceiptScanResult parseReceiptScanText(String text) {
  final lines = text
      .split(RegExp(r'[\r\n]+'))
      .map(_cleanLine)
      .where((line) => line.isNotEmpty)
      .toList(growable: false);
  return ReceiptScanResult(
    retailerName: _findRetailer(lines),
    purchaseDate: _findDate(lines),
    totalText: _findTotal(lines),
    items: _findItems(lines),
  );
}

List<ReceiptLineItem> parseEditableReceiptItems(String text) => _findItems(
      text
          .split(RegExp(r'[\r\n]+'))
          .map(_cleanLine)
          .where((line) => line.isNotEmpty)
          .toList(growable: false),
      acceptPriceFreeLines: true,
    );

const _knownRetailers = <String, String>{
  'checkers hyper': 'Checkers Hyper',
  'checkers': 'Checkers',
  'shoprite': 'Shoprite',
  'pick n pay': 'Pick n Pay',
  'picknpay': 'Pick n Pay',
  'pnp': 'Pick n Pay',
  'woolworths': 'Woolworths',
  'food lovers market': 'Food Lover’s Market',
  'food lover s market': 'Food Lover’s Market',
  'boxer superstores': 'Boxer Superstores',
  'boxer': 'Boxer Superstores',
  'makro': 'Makro',
  'superspar': 'SUPERSPAR',
  'spar': 'SPAR',
  'frontline hyper': 'Frontline Hyper',
  'game': 'Game',
  'clicks': 'Clicks',
  'dis chem': 'Dis-Chem',
};

const _nonRetailerWords = <String>{
  'receipt',
  'tax invoice',
  'invoice',
  'cashier',
  'welcome',
  'thank you',
  'vat',
  'tel',
  'telephone',
  'date',
  'time',
  'customer copy',
};

String? _findRetailer(List<String> lines) {
  for (final line in lines.take(min(lines.length, 12))) {
    final comparable = _comparable(line);
    for (final entry in _knownRetailers.entries) {
      if (comparable.contains(entry.key)) return entry.value;
    }
  }
  for (final line in lines.take(min(lines.length, 8))) {
    final lower = line.toLowerCase();
    if (line.length < 3 || line.length > 70) continue;
    if (!RegExp(r'[a-zA-Z]{3}').hasMatch(line)) continue;
    if (_nonRetailerWords.any(lower.contains)) continue;
    if (RegExp(r'\d{3,}|www\.|@|street|road|avenue|mall|branch',
            caseSensitive: false)
        .hasMatch(line)) {
      continue;
    }
    return _titleCase(line);
  }
  return null;
}

String? _findDate(List<String> lines) {
  for (final line in lines) {
    final iso = RegExp(
            r'\b(20\d{2})[\-/.](0?[1-9]|1[0-2])[\-/.](0?[1-9]|[12]\d|3[01])\b')
        .firstMatch(line);
    if (iso != null) {
      return _validIsoDate(
        int.parse(iso.group(1)!),
        int.parse(iso.group(2)!),
        int.parse(iso.group(3)!),
      );
    }
    final local = RegExp(
            r'\b(0?[1-9]|[12]\d|3[01])[\-/.](0?[1-9]|1[0-2])[\-/.](20\d{2})\b')
        .firstMatch(line);
    if (local != null) {
      return _validIsoDate(
        int.parse(local.group(3)!),
        int.parse(local.group(2)!),
        int.parse(local.group(1)!),
      );
    }
  }
  return null;
}

String? _findTotal(List<String> lines) {
  final candidates = lines.where((line) {
    final lower = line.toLowerCase();
    return RegExp(r'\b(grand total|amount due|balance due|total due|total)\b')
            .hasMatch(lower) &&
        !lower.contains('subtotal') &&
        !lower.contains('total items') &&
        !lower.contains('total qty');
  }).toList(growable: false);
  for (final line in candidates.reversed) {
    final money = _lastMoney(line);
    if (money != null) return money;
  }
  return null;
}

const _itemStopWords = <String>{
  'subtotal',
  'total',
  'amount due',
  'balance',
  'cash',
  'change',
  'payment',
  'tender',
  'credit card',
  'debit card',
  'vat',
  'tax',
  'discount',
  'saving',
  'rounding',
  'receipt',
  'invoice',
  'cashier',
  'loyalty',
  'points',
  'date',
  'time',
  'tel',
  'phone',
};

List<ReceiptLineItem> _findItems(
  List<String> lines, {
  bool acceptPriceFreeLines = false,
}) {
  final items = <ReceiptLineItem>[];
  final seen = <String>{};
  for (final line in lines) {
    if (items.length >= 40) break;
    final lower = line.toLowerCase();
    if (_itemStopWords.any(lower.contains)) continue;
    if (RegExp(r'\b\d{4}[\-/.]\d{1,2}[\-/.]\d{1,2}\b').hasMatch(line)) {
      continue;
    }
    final amount = _trailingMoney(line);
    var title = amount == null ? line : line.substring(0, amount.start).trim();
    title = title
        .replaceFirst(RegExp(r'^\d+\s*[xX@]\s*'), '')
        .replaceFirst(RegExp(r'^\d{5,}\s+'), '')
        .trim();
    if (title.length < 2 || title.length > 100) continue;
    if (!RegExp(r'[A-Za-z]{2}').hasMatch(title)) continue;
    if (amount == null && !acceptPriceFreeLines) continue;
    if (amount == null && RegExp(r'\d{3,}|www\.|@').hasMatch(title)) continue;
    final key = _comparable(title);
    if (key.length < 2 || !seen.add(key)) continue;
    items.add(
      ReceiptLineItem(
        title: _sentenceCase(title),
        priceText: amount?.text,
      ),
    );
  }
  return List.unmodifiable(items);
}

({int start, String text})? _trailingMoney(String line) {
  final matches = RegExp(
    r'(?:\b(?:ZAR|NAD|BWP|MZN|SZL|LSL|ZMW|MWK|TZS|MUR|SCR|KMF|AOA|MGA|CDF|USD)\b\s*|[R$P] ?)?\d{1,6}(?:[ ,.]\d{3})*(?:[,.]\d{2})\s*$',
    caseSensitive: false,
  ).allMatches(line).toList();
  if (matches.isEmpty) return null;
  final match = matches.last;
  final raw = match.group(0)!.trim();
  final parsed = parseReceiptMoney(raw);
  if (parsed == null || parsed.amount <= 0) return null;
  return (start: match.start, text: raw);
}

String? _lastMoney(String line) {
  final amount = _trailingMoney(line);
  return amount?.text;
}

String? _validIsoDate(int year, int month, int day) {
  final value = DateTime(year, month, day);
  if (value.year != year || value.month != month || value.day != day) {
    return null;
  }
  return '${year.toString().padLeft(4, '0')}-'
      '${month.toString().padLeft(2, '0')}-'
      '${day.toString().padLeft(2, '0')}';
}

String _cleanLine(String value) => value
    .replaceAll(RegExp(r'[\t\u00a0]+'), ' ')
    .replaceAll(RegExp(r'\s{2,}'), ' ')
    .trim();

String _comparable(String value) => value
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

String _titleCase(String value) => value
    .toLowerCase()
    .split(' ')
    .where((word) => word.isNotEmpty)
    .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
    .join(' ');

String _sentenceCase(String value) {
  final clean = value.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (clean.isEmpty) return clean;
  if (RegExp(r'[a-z]').hasMatch(clean)) return clean;
  final lower = clean.toLowerCase();
  return '${lower[0].toUpperCase()}${lower.substring(1)}';
}
