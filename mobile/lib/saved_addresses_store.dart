import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'member_state_sync.dart';

/// One address a shopper saved to search Near me quickly — their home, a
/// parent's place, the office. Coordinates are stored so a saved address never
/// needs re-geocoding.
class SavedAddress {
  const SavedAddress({
    required this.id,
    required this.label,
    required this.lat,
    required this.lon,
    this.formattedAddress,
    required this.createdAt,
    this.countryCode = 'ZA',
  });

  final String id;
  final String label;
  final double lat;
  final double lon;
  final String? formattedAddress;
  final DateTime createdAt;
  final String countryCode;

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'lat': lat,
        'lon': lon,
        'formattedAddress': formattedAddress,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'countryCode': countryCode,
      };

  static SavedAddress? fromJson(Map<String, dynamic> json) {
    final lat = (json['lat'] as num?)?.toDouble();
    final lon = (json['lon'] as num?)?.toDouble();
    final label = json['label']?.toString();
    if (lat == null || lon == null || label == null || label.isEmpty) {
      return null;
    }
    return SavedAddress(
      id: json['id']?.toString() ?? DateTime.now().toUtc().toIso8601String(),
      label: label,
      lat: lat,
      lon: lon,
      formattedAddress: json['formattedAddress']?.toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      countryCode: (json['countryCode']?.toString() ?? 'ZA').toUpperCase(),
    );
  }
}

/// On-device list of saved addresses. Multiple addresses are supported and
/// stored as a JSON list, mirroring the immutable-return style of the nearby
/// history and discovery caches.
class SavedAddressesStore {
  static const _key = 'saved_addresses_v1';
  static const _maxEntries = 12;

  Future<List<SavedAddress>> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_key);
      if (raw == null || raw.isEmpty) return const [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((item) => SavedAddress.fromJson(Map<String, dynamic>.from(item)))
          .whereType<SavedAddress>()
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Adds an address, de-duping by a nearby coordinate (within ~1km) or an
  /// identical label, and returns the new list.
  Future<List<SavedAddress>> add(SavedAddress address) async {
    final existing = await load();
    final deduped = existing.where((candidate) {
      final sameCountry = candidate.countryCode == address.countryCode;
      final sameSpot = sameCountry &&
          (candidate.lat - address.lat).abs() < 0.01 &&
          (candidate.lon - address.lon).abs() < 0.01;
      final sameLabel = sameCountry &&
          candidate.label.toLowerCase() == address.label.toLowerCase();
      return !sameSpot && !sameLabel;
    }).toList();
    final next = [address, ...deduped].take(_maxEntries).toList();
    await _persist(next);
    return next;
  }

  Future<List<SavedAddress>> remove(String id) async {
    final next = (await load()).where((entry) => entry.id != id).toList();
    await _persist(next);
    return next;
  }

  Future<void> _persist(List<SavedAddress> entries) async {
    final data = entries.map((entry) => entry.toJson()).toList();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_key, jsonEncode(data));
    } catch (_) {
      // Best-effort persistence.
    }
    // Mirror to the account so saved addresses follow the shopper's login.
    MemberStateSync.instance.push(_key, data);
  }
}
