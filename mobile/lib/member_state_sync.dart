import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

/// Bridges the app's on-device stores (SharedPreferences) with the server so a
/// shopper's data — near-me search history, saved addresses — follows their
/// account across devices and survives logout and reinstalls.
///
/// Stores push their JSON blob after each change; on login the app hydrates the
/// local prefs from the server (server wins when it has data), so the existing
/// store code keeps reading from prefs unchanged.
class MemberStateSync {
  MemberStateSync._();

  static final MemberStateSync instance = MemberStateSync._();

  /// Keys the app keeps in sync (must match the SharedPreferences keys the
  /// stores use and the /api/member-state key rule: ^[a-z0-9_]{2,40}$).
  static const nearbyHistoryKey = 'nearby_history_v1';
  static const savedAddressesKey = 'saved_addresses_v1';
  static const savedPropertiesKey = 'saved_properties_v1';
  static const syncedKeys = [
    nearbyHistoryKey,
    savedAddressesKey,
    savedPropertiesKey,
  ];

  Api? _api;

  void configure(Api? api) => _api = api;

  /// Best-effort push of a decoded JSON value for [key] to the account.
  Future<void> push(String key, Object? value) async {
    final api = _api;
    if (api == null) return;
    try {
      await api.setMemberState(key, value);
    } catch (_) {
      // Sync is best-effort; the local copy is still saved.
    }
  }

  /// Clears the synced keys from local prefs on sign-out so the next account on
  /// a shared device never sees the previous shopper's data.
  Future<void> clearLocal() async {
    _api = null;
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final key in syncedKeys) {
        await prefs.remove(key);
      }
    } catch (_) {
      // best-effort
    }
  }

  /// Pulls each key from the server into local prefs so the on-device stores
  /// read the synced data. Called on login/app start.
  Future<void> hydrate(List<String> keys) async {
    final api = _api;
    if (api == null) return;
    SharedPreferences prefs;
    try {
      prefs = await SharedPreferences.getInstance();
    } catch (_) {
      return;
    }
    for (final key in keys) {
      try {
        final value = await api.getMemberState(key);
        if (value == null) continue;
        await prefs.setString(key, jsonEncode(value));
      } catch (_) {
        // Skip a key that fails; the rest still hydrate.
      }
    }
  }
}
