import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'member_state_sync.dart';

class FavouriteStore {
  const FavouriteStore({
    required this.id,
    required this.displayName,
    required this.savedAt,
  });

  final String id;
  final String displayName;
  final int savedAt;

  factory FavouriteStore.fromJson(Map<String, dynamic> json) => FavouriteStore(
        id: json['id'] is String ? json['id'] as String : '',
        displayName:
            json['displayName'] is String ? json['displayName'] as String : '',
        savedAt: json['savedAt'] is num ? (json['savedAt'] as num).round() : 0,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'displayName': displayName,
        'savedAt': savedAt,
      };

  @override
  bool operator ==(Object other) =>
      other is FavouriteStore &&
      other.id == id &&
      other.displayName == displayName &&
      other.savedAt == savedAt;

  @override
  int get hashCode => Object.hash(id, displayName, savedAt);
}

class FavouriteStoresStore {
  static const _key = MemberStateSync.favouriteStoresKey;
  static const _maxEntries = 100;

  Future<List<FavouriteStore>> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final decoded = jsonDecode(preferences.getString(_key) ?? '[]');
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((item) =>
              FavouriteStore.fromJson(Map<String, dynamic>.from(item)))
          .where((item) => item.id.isNotEmpty && item.displayName.isNotEmpty)
          .take(_maxEntries)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<FavouriteStore>> toggle(FavouriteStore favourite) async {
    final current = await load();
    final exists = current.any((item) => item.id == favourite.id);
    final next = exists
        ? current.where((item) => item.id != favourite.id).toList()
        : <FavouriteStore>[favourite, ...current].take(_maxEntries).toList();
    await _persist(next);
    return next;
  }

  Future<void> _persist(List<FavouriteStore> favourites) async {
    final data = favourites.map((item) => item.toJson()).toList();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_key, jsonEncode(data));
    } catch (_) {
      // The in-memory UI remains usable if device storage is unavailable.
    }
    MemberStateSync.instance.push(_key, data);
  }
}
