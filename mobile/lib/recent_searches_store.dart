import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'member_state_sync.dart';

/// Recent Properties Scout text searches, newest first. Powers the
/// recognition-over-recall suggestion chips under the search field so a shopper
/// can tap where they left off instead of retyping. On-device only (small and
/// device-specific), deduped case-insensitively and capped so chips stay glanceable.
class RecentPropertySearchesStore {
  static const _key = MemberStateSync.recentPropertySearchesKey;
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
    MemberStateSync.instance.push(_key, next);
    return next;
  }

  Future<List<String>> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {
      // ignore
    }
    MemberStateSync.instance.push(_key, const <String>[]);
    return const [];
  }
}

/// Curated metros for the markets we know well enough to name places in.
/// Countries are added here only when we actually know their metros — a guessed
/// list is worse than none.
const Map<String, List<String>> _popularLocationsByCountry = {
  'ZA': [
    'Cape Town',
    'Johannesburg',
    'Pretoria',
    'Durban',
    'Sandton',
    'Centurion',
    'Port Elizabeth',
    'Bloemfontein',
  ],
};

/// Starter chips shown when there are no recent searches yet — somewhere to
/// begin, not a blank page. Curated metros where we have them, otherwise the
/// shopper's own capital city, which the server sends with their country. A
/// shopper in the United States is offered Washington, D.C., never Johannesburg;
/// with no capital to offer, no chips rather than the wrong country's.
List<String> popularPropertyLocations(String countryCode, {String? capital}) {
  final curated = _popularLocationsByCountry[countryCode.trim().toUpperCase()];
  if (curated != null) return curated;
  final fallback = capital?.trim() ?? '';
  return fallback.isEmpty ? const [] : [fallback];
}
