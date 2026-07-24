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
      if (!value) await preferences.remove(_dealAlertCursorKey);
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
      await preferences.setString(_lastAlertKey, value.toUtc().toIso8601String());
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

  Future<void> clear() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove(_optInKey);
      await preferences.remove(_lastAlertKey);
      await preferences.remove(_dealAlertCursorKey);
      await preferences.remove(_lastExpiryWarningKey);
    } catch (_) {
      // The next session sync retries the cleanup.
    }
  }
}
