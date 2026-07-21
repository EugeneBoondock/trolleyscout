import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Recent Properties Scout text searches, newest first. Powers the
/// recognition-over-recall suggestion chips under the search field so a shopper
/// can tap where they left off instead of retyping. On-device only (small and
/// device-specific), deduped case-insensitively and capped so chips stay glanceable.
class RecentPropertySearchesStore {
  static const _key = 'recent_property_searches_v1';
  static const _maxEntries = 6;

  Future<List<String>> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return const [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded.whereType<String>().toList();
    } catch (_) {
      return const [];
    }
  }

  /// Adds a query to the front (deduped, case-insensitive) and returns the list.
  Future<List<String>> add(String query) async {
    final trimmed = query.trim();
    if (trimmed.length < 2) return load();
    final existing = await load();
    final lower = trimmed.toLowerCase();
    final next = <String>[
      trimmed,
      ...existing.where((q) => q.toLowerCase() != lower),
    ].take(_maxEntries).toList();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(next));
    } catch (_) {
      // Best-effort; chips simply won't persist this time.
    }
    return next;
  }

  Future<List<String>> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {
      // ignore
    }
    return const [];
  }
}

/// A short, curated set of popular South African metros shown as starter chips
/// when there are no recent searches yet — somewhere to begin, not a blank page.
const List<String> kPopularPropertyLocations = <String>[
  'Cape Town',
  'Johannesburg',
  'Pretoria',
  'Durban',
  'Sandton',
  'Centurion',
  'Port Elizabeth',
  'Bloemfontein',
];
