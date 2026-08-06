import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One thing Mr Scout put into a shop's own cart.
@immutable
class StoreCartLine {
  const StoreCartLine({
    required this.title,
    required this.productUrl,
    required this.quantity,
    required this.addedAt,
    this.priceText,
  });

  factory StoreCartLine.fromJson(Map<String, dynamic> json) => StoreCartLine(
        title: json['title']?.toString() ?? '',
        productUrl: json['productUrl']?.toString() ?? '',
        quantity:
            json['quantity'] is num ? (json['quantity'] as num).toInt() : 1,
        addedAt: DateTime.tryParse(json['addedAt']?.toString() ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
        priceText: json['priceText']?.toString(),
      );

  final String title;
  final String productUrl;
  final int quantity;
  final DateTime addedAt;
  final String? priceText;

  Map<String, dynamic> toJson() => {
        'title': title,
        'productUrl': productUrl,
        'quantity': quantity,
        'addedAt': addedAt.toUtc().toIso8601String(),
        if (priceText != null) 'priceText': priceText,
      };
}

/// What Mr Scout has put in one shop's cart.
@immutable
class StoreCart {
  const StoreCart({
    required this.storeId,
    required this.storeName,
    required this.lines,
  });

  final String storeId;
  final String storeName;
  final List<StoreCartLine> lines;

  int get itemCount => lines.fold(0, (total, line) => total + line.quantity);

  DateTime? get lastAddedAt => lines.isEmpty
      ? null
      : lines
          .map((line) => line.addedAt)
          .reduce((left, right) => left.isAfter(right) ? left : right);
}

/// The record of what Mr Scout put where.
///
/// This is deliberately a record of the agent's own actions, not a mirror of
/// the shop's cart: most shops give no way to read a cart from outside their
/// page, and a list that silently drifts from the real cart would be worse
/// than no list. Every store row links straight to that shop's own cart page,
/// which is the authority.
class StoreCartStore extends ChangeNotifier {
  StoreCartStore({SharedPreferences? preferences}) : _injected = preferences;

  static final StoreCartStore instance = StoreCartStore();
  static const _key = 'store_carts_v1';
  static const _maxLinesPerStore = 60;

  final SharedPreferences? _injected;
  Map<String, StoreCart> _carts = {};
  bool _loaded = false;

  bool get loaded => _loaded;

  /// Busiest cart first, so the shop the shopper is working in leads.
  List<StoreCart> get carts {
    final all = _carts.values.where((cart) => cart.lines.isNotEmpty).toList()
      ..sort((left, right) {
        final leftAt = left.lastAddedAt;
        final rightAt = right.lastAddedAt;
        if (leftAt == null || rightAt == null) return 0;
        return rightAt.compareTo(leftAt);
      });
    return List.unmodifiable(all);
  }

  int get totalItemCount =>
      carts.fold(0, (total, cart) => total + cart.itemCount);

  StoreCart? cartFor(String storeId) => _carts[storeId];

  Future<void> load() async {
    if (_loaded) return;
    try {
      final preferences = _injected ?? await SharedPreferences.getInstance();
      _carts = _decode(preferences.getString(_key));
    } catch (_) {
      _carts = {};
    }
    _loaded = true;
    notifyListeners();
  }

  /// Records an add. The same product added twice becomes one line with a
  /// bigger quantity, the way the shop's own cart would show it.
  Future<void> record(
    String storeId,
    String storeName,
    StoreCartLine line,
  ) async {
    await load();
    final existing = _carts[storeId];
    final lines = [...(existing?.lines ?? const <StoreCartLine>[])];
    final index = lines.indexWhere((row) => row.productUrl == line.productUrl);
    if (index >= 0) {
      final current = lines[index];
      lines[index] = StoreCartLine(
        title: current.title,
        productUrl: current.productUrl,
        quantity: current.quantity + line.quantity,
        addedAt: line.addedAt,
        priceText: line.priceText ?? current.priceText,
      );
    } else {
      lines.insert(0, line);
    }
    _carts = {
      ..._carts,
      storeId: StoreCart(
        storeId: storeId,
        storeName: storeName,
        lines: lines.take(_maxLinesPerStore).toList(growable: false),
      ),
    };
    notifyListeners();
    await _persist();
  }

  Future<void> removeLine(String storeId, String productUrl) async {
    await load();
    final cart = _carts[storeId];
    if (cart == null) return;
    final lines = cart.lines
        .where((line) => line.productUrl != productUrl)
        .toList(growable: false);
    _carts = {..._carts};
    if (lines.isEmpty) {
      _carts.remove(storeId);
    } else {
      _carts[storeId] =
          StoreCart(storeId: storeId, storeName: cart.storeName, lines: lines);
    }
    notifyListeners();
    await _persist();
  }

  Future<void> clearStore(String storeId) async {
    await load();
    if (!_carts.containsKey(storeId)) return;
    _carts = {..._carts}..remove(storeId);
    notifyListeners();
    await _persist();
  }

  Future<void> clearAll() async {
    _carts = {};
    _loaded = true;
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    try {
      final preferences = _injected ?? await SharedPreferences.getInstance();
      await preferences.setString(
        _key,
        jsonEncode(_carts.map((id, cart) => MapEntry(id, {
              'storeId': cart.storeId,
              'storeName': cart.storeName,
              'lines': cart.lines.map((line) => line.toJson()).toList(),
            }))),
      );
    } catch (_) {
      // The shop's own cart is the authority; losing this note is cosmetic.
    }
  }

  static Map<String, StoreCart> _decode(String? raw) {
    if (raw == null || raw.isEmpty) return {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return {};
      final out = <String, StoreCart>{};
      for (final entry in decoded.entries) {
        final value = entry.value;
        if (value is! Map) continue;
        final lines = (value['lines'] is List ? value['lines'] as List : [])
            .whereType<Map>()
            .map(
                (row) => StoreCartLine.fromJson(Map<String, dynamic>.from(row)))
            .where(
                (line) => line.title.isNotEmpty && line.productUrl.isNotEmpty)
            .toList(growable: false);
        if (lines.isEmpty) continue;
        final storeId = value['storeId']?.toString() ?? entry.key.toString();
        out[storeId] = StoreCart(
          storeId: storeId,
          storeName: value['storeName']?.toString() ?? storeId,
          lines: lines,
        );
      }
      return out;
    } catch (_) {
      return {};
    }
  }
}
