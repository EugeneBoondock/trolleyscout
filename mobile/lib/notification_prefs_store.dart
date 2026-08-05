import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// On-device record of the shopper's new-deal alert opt-in. Kept locally so the
/// choice works before sign-in and offline; when signed in the app also syncs it
/// to the server (the durable subscriber list). Also remembers the newest deal
/// timestamp already alerted on, so the same batch is never announced twice.
class NotificationPrefsStore {
  static const _optInKey = 'notify_new_deals';
  static const _lastAlertKey = 'notify_last_alert_iso';
  static const _dealAlertCursorKey = 'notify_deal_alert_cursor';
  static const _lastExpiryWarningKey = 'notify_last_expiry_warning_iso';
  static const _lastPriceDropAlertKey = 'notify_last_price_drop_iso';
  static const _seenDealIdsKey = 'notify_seen_deal_ids_v1';
  // Keep this equal to functions/api/discovery.ts NORMALIZED_SAFETY_CAP. A
  // smaller baseline makes older deals beyond the cut look new after a batch.
  static const maximumSeenDealIds = 25000;

  /// Background isolates can retain an older SharedPreferences memory view.
  /// Reload before a worker reads the current opt-in and cursor.
  Future<void> reload() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.reload();
    } catch (_) {
      // The worker can still attempt to read its current view.
    }
  }

  Future<bool> loadOptIn() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      return preferences.getBool(_optInKey) ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<void> saveOptIn(bool value) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_optInKey, value);
      if (!value) {
        await preferences.remove(_dealAlertCursorKey);
        await preferences.remove(_seenDealIdsKey);
      }
    } catch (_) {
      // Preference persists next time.
    }
  }

  Future<int?> loadDealAlertCursor() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final value = preferences.getInt(_dealAlertCursorKey);
      return value != null && value >= 0 ? value : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveDealAlertCursor(int value) async {
    if (value < 0) return;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setInt(_dealAlertCursorKey, value);
    } catch (_) {
      // Best-effort.
    }
  }

  /// Null means this device has not established a discovery baseline yet.
  /// An empty set is a valid baseline for a feed that contained no deals.
  Future<Set<String>?> loadSeenDealIds() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_seenDealIdsKey);
      if (raw == null) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return null;
      return decoded
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toSet();
    } catch (_) {
      return null;
    }
  }

  Future<void> saveSeenDealIds(Iterable<String> values) async {
    try {
      final ids = values
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty && value.length <= 240)
          .toSet()
          .take(maximumSeenDealIds)
          .toList(growable: false)
        ..sort();
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_seenDealIdsKey, jsonEncode(ids));
    } catch (_) {
      // Best-effort. The next successful discovery can rebuild the baseline.
    }
  }

  Future<DateTime?> loadLastAlertAt() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_lastAlertKey);
      return raw == null ? null : DateTime.tryParse(raw);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveLastAlertAt(DateTime value) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
          _lastAlertKey, value.toUtc().toIso8601String());
    } catch (_) {
      // Best-effort.
    }
  }

  /// When the shopper was last warned that saved offers are closing. A deal
  /// stays "ending soon" across several polls, so this keeps the warning to
  /// once a day rather than every check.
  Future<DateTime?> loadLastExpiryWarningAt() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_lastExpiryWarningKey);
      return raw == null ? null : DateTime.tryParse(raw);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveLastExpiryWarningAt(DateTime value) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _lastExpiryWarningKey,
        value.toUtc().toIso8601String(),
      );
    } catch (_) {
      // Best-effort.
    }
  }

  /// When the shopper last heard a saved deal got cheaper. A drop persists
  /// across polls the same way an expiry does, so it gets the same daily cap.
  Future<DateTime?> loadLastPriceDropAlertAt() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_lastPriceDropAlertKey);
      return raw == null ? null : DateTime.tryParse(raw);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveLastPriceDropAlertAt(DateTime value) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _lastPriceDropAlertKey,
        value.toUtc().toIso8601String(),
      );
    } catch (_) {
      // Best-effort.
    }
  }

  Future<void> clear() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove(_optInKey);
      await preferences.remove(_lastAlertKey);
      await preferences.remove(_dealAlertCursorKey);
      await preferences.remove(_lastExpiryWarningKey);
      await preferences.remove(_lastPriceDropAlertKey);
      await preferences.remove(_seenDealIdsKey);
    } catch (_) {
      // The next session sync retries the cleanup.
    }
  }
}
