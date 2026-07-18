import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_models.dart';

/// Deals a shopper saved from Window Shopping. These are mostly external flash
/// deals (OneDayOnly, Hyperli, Daddy's Deals, MyRunway) that aren't official
/// retailer sources, so they can't go through the server-side saved-deals API —
/// they're kept on-device so the shopper can come back to them.
class WindowSavedStore {
  static const _key = 'window_saved_v1';
  static const _max = 200;

  Future<List<ScrollDeal>> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_key);
      if (raw == null || raw.isEmpty) return const [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((item) => ScrollDeal.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<ScrollDeal>> toggle(ScrollDeal deal) async {
    final current = await load();
    final exists = current.any((item) => item.id == deal.id);
    final next = exists
        ? current.where((item) => item.id != deal.id).toList()
        : [deal, ...current].take(_max).toList();
    await _persist(next);
    return next;
  }

  Future<List<ScrollDeal>> remove(String id) async {
    final next = (await load()).where((item) => item.id != id).toList();
    await _persist(next);
    return next;
  }

  Future<Set<String>> loadIds() async {
    return (await load()).map((deal) => deal.id).toSet();
  }

  Future<void> _persist(List<ScrollDeal> deals) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _key,
        jsonEncode(deals.map((deal) => deal.toJson()).toList()),
      );
    } catch (_) {
      // Best-effort persistence.
    }
  }
}
