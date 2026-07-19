import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'member_state_sync.dart';

/// On-device list of homes a shopper favourited in Properties Scout. Each entry
/// is the full listing snapshot (so the Saved view keeps working after the deal
/// leaves the portals) plus when it was saved. Mirrored to the account via
/// MemberStateSync so favourites follow the shopper across devices and reinstalls.
class SavedPropertiesStore {
  static const _key = MemberStateSync.savedPropertiesKey;
  static const _maxEntries = 120;

  static String keyOf(PropertyListing listing) =>
      '${listing.portal}:${listing.id}';

  Future<List<PropertyListing>> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_key);
      if (raw == null || raw.isEmpty) return const [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((item) => PropertyListing.fromJson(Map<String, dynamic>.from(item)))
          .where((listing) => listing.id.isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Adds the listing to the front if new, or removes it if already saved.
  /// Returns the new list so the caller can update state immutably.
  Future<List<PropertyListing>> toggle(PropertyListing listing) async {
    final existing = await load();
    final key = keyOf(listing);
    final already = existing.any((entry) => keyOf(entry) == key);
    final next = already
        ? existing.where((entry) => keyOf(entry) != key).toList()
        : <PropertyListing>[listing, ...existing].take(_maxEntries).toList();
    await _persist(next);
    return next;
  }

  Future<void> _persist(List<PropertyListing> entries) async {
    final data = entries.map((entry) => entry.toJson()).toList();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_key, jsonEncode(data));
    } catch (_) {
      // Best-effort persistence.
    }
    MemberStateSync.instance.push(_key, data);
  }
}
