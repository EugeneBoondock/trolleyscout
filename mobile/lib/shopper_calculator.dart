import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

int? parseShopperMoneyToCents(String value) {
  var text = value.trim().replaceAll(RegExp(r'[^0-9,.-]'), '');
  if (text.isEmpty) return null;
  if (text.contains(',') && !text.contains('.')) {
    text = text.replaceFirst(',', '.');
  } else {
    text = text.replaceAll(',', '');
  }
  final amount = double.tryParse(text);
  if (amount == null || !amount.isFinite || amount < 0) return null;
  return (amount * 100).round();
}

int discountedShopperPrice(int priceCents, int percent) =>
    (priceCents * (100 - percent.clamp(0, 100)) / 100).round();

int? shopperUnitPrice(int priceCents, num units) =>
    units > 0 ? (priceCents / units).round() : null;

const int shopperVatPercent = 15;

int shopperVatFromInclusive(int cents) =>
    (cents * shopperVatPercent / (100 + shopperVatPercent)).round();

int shopperVatOnExclusive(int cents) =>
    (cents * shopperVatPercent / 100).round();

bool isLikelyZeroRatedShopperItem(String value) {
  final item = value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .trim();
  if (item.isEmpty) return false;
  if (RegExp(r'\b(?:flavoured|flavored|chocolate|yoghurt|yogurt|custard|formula)\b')
      .hasMatch(item)) {
    return false;
  }
  if (RegExp(r'\bolive oil\b').hasMatch(item)) return false;
  return RegExp(
    r'\b(?:brown bread|brown bread flour|cake wheat flour|white bread wheat flour|maize meal|super fine maize meal|samp|mealie rice|dried mealies|dried beans|rice|lentils|pilchards|sardinella|milk|milk powder|dairy powder|cultured milk|vegetable oil|cooking oil|hen eggs|hens eggs|chicken eggs|fresh fruit|frozen fruit|fresh vegetables|frozen vegetables|legumes|pulses|peas|peanuts|sanitary pads|sanitary towels|petrol|diesel|illuminating paraffin|kerosene)\b',
  ).hasMatch(item);
}

String formatShopperMoney(int cents) {
  final sign = cents < 0 ? '-' : '';
  return '${sign}R${(cents.abs() / 100).toStringAsFixed(2)}';
}

class ShopperCalculatorLine {
  const ShopperCalculatorLine({
    required this.id,
    required this.label,
    required this.priceCents,
    required this.quantity,
    this.vatCents = 0,
    this.vatAdded = false,
    this.zeroRated = false,
  });

  final String id;
  final String label;
  final int priceCents;
  final int quantity;
  final int vatCents;
  final bool vatAdded;
  final bool zeroRated;

  int get lineTotalCents => priceCents * quantity;

  factory ShopperCalculatorLine.fromJson(Map<String, dynamic> json) {
    final price = json['priceCents'];
    final quantity = json['quantity'];
    return ShopperCalculatorLine(
      id: json['id'] is String ? json['id'] as String : '',
      label: json['label'] is String ? json['label'] as String : 'Item',
      priceCents: price is num ? price.round().clamp(0, 999999999) : 0,
      quantity: quantity is num ? quantity.round().clamp(1, 99) : 1,
      vatCents: json['vatCents'] is num
          ? (json['vatCents'] as num).round().clamp(0, 999999999)
          : 0,
      vatAdded: json['vatAdded'] == true,
      zeroRated: json['zeroRated'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'priceCents': priceCents,
        'quantity': quantity,
        'vatCents': vatCents,
        'vatAdded': vatAdded,
        'zeroRated': zeroRated,
      };
}

class ShopperCalculatorStore extends ChangeNotifier {
  ShopperCalculatorStore();

  static final ShopperCalculatorStore instance = ShopperCalculatorStore();
  static const storageKey = 'shopper_calculator_state_v1';

  bool _enabled = false;
  bool _loaded = false;
  int? _budgetCents;
  List<ShopperCalculatorLine> _lines = [];
  _RemovedLine? _removed;
  int _nextId = 0;

  bool get enabled => _enabled;
  int? get budgetCents => _budgetCents;
  List<ShopperCalculatorLine> get lines => List.unmodifiable(_lines);
  bool get canUndo => _removed != null;
  int get itemCount => _lines.fold(0, (total, line) => total + line.quantity);
  int get totalCents =>
      _lines.fold(0, (total, line) => total + line.lineTotalCents);
  int? get remainingBudgetCents =>
      _budgetCents == null ? null : _budgetCents! - totalCents;

  Future<void> load() async {
    if (_loaded) return;
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getString(storageKey);
      if (stored != null && stored.isNotEmpty) {
        final decoded = jsonDecode(stored);
        if (decoded is Map) {
          final map = Map<String, dynamic>.from(decoded);
          _enabled = map['enabled'] == true;
          final budget = map['budgetCents'];
          _budgetCents = budget is num && budget >= 0 ? budget.round() : null;
          final rawLines = map['lines'];
          if (rawLines is List) {
            _lines = rawLines
                .whereType<Map>()
                .map((line) => ShopperCalculatorLine.fromJson(
                      Map<String, dynamic>.from(line),
                    ))
                .where((line) => line.id.isNotEmpty && line.priceCents > 0)
                .take(100)
                .toList(growable: true);
          }
        }
      }
    } catch (_) {
      _enabled = false;
      _budgetCents = null;
      _lines = [];
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }

  Future<void> setEnabled(bool value) async {
    _enabled = value;
    _loaded = true;
    notifyListeners();
    await _persist();
  }

  Future<void> setBudgetCents(int? value) async {
    _budgetCents = value?.clamp(0, 999999999);
    _loaded = true;
    notifyListeners();
    await _persist();
  }

  Future<void> addLine({
    required String label,
    required int priceCents,
    required int quantity,
    int vatCents = 0,
    bool vatAdded = false,
    bool zeroRated = false,
  }) async {
    if (priceCents <= 0) return;
    final cleanLabel = label.trim();
    _lines.add(ShopperCalculatorLine(
      id: '${DateTime.now().microsecondsSinceEpoch}-${_nextId++}',
      label: cleanLabel.isEmpty ? 'Item ${_lines.length + 1}' : cleanLabel,
      priceCents: priceCents.clamp(1, 999999999),
      quantity: quantity.clamp(1, 99),
      vatCents: vatCents.clamp(0, 999999999),
      vatAdded: vatAdded,
      zeroRated: zeroRated,
    ));
    _removed = null;
    _loaded = true;
    notifyListeners();
    await _persist();
  }

  Future<void> removeLine(String id) async {
    final index = _lines.indexWhere((line) => line.id == id);
    if (index < 0) return;
    _removed = _RemovedLine(index, _lines.removeAt(index));
    notifyListeners();
    await _persist();
  }

  Future<void> undo() async {
    final removed = _removed;
    if (removed == null) return;
    _lines.insert(removed.index.clamp(0, _lines.length), removed.line);
    _removed = null;
    notifyListeners();
    await _persist();
  }

  Future<void> clear() async {
    _lines = [];
    _removed = null;
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        storageKey,
        jsonEncode({
          'enabled': _enabled,
          if (_budgetCents != null) 'budgetCents': _budgetCents,
          'lines': _lines.map((line) => line.toJson()).toList(),
        }),
      );
    } catch (_) {
      // Current-session calculations still work if local storage is full.
    }
  }

  @visibleForTesting
  void resetForTest() {
    _enabled = false;
    _loaded = false;
    _budgetCents = null;
    _lines = [];
    _removed = null;
    _nextId = 0;
  }
}

class _RemovedLine {
  const _RemovedLine(this.index, this.line);

  final int index;
  final ShopperCalculatorLine line;
}
