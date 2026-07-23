import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_models.dart';

class CachedDiscovery {
  const CachedDiscovery({required this.result, required this.fetchedAt});

  final DiscoveryResult result;
  final DateTime fetchedAt;

  Set<String> get dealIds =>
      result.deals.map((deal) => deal.id).where((id) => id.isNotEmpty).toSet();
}

/// Last successful Find-deals payload, kept on-device so reopening the screen
/// is instant and does not repeat a server read inside the three-hour window.
class DiscoveryCache {
  static const _keyPrefix = 'discovery_cache_v2';

  Future<CachedDiscovery?> load([String countryCode = 'ZA']) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_keyFor(countryCode));
      if (raw == null || raw.isEmpty) return null;

      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final data = Map<String, dynamic>.from(decoded);
      final fetchedAt = DateTime.tryParse(data['fetchedAt']?.toString() ?? '');
      final result = data['result'];
      if (fetchedAt == null || result is! Map) return null;

      return CachedDiscovery(
        fetchedAt: fetchedAt,
        result: DiscoveryResult.fromJson(Map<String, dynamic>.from(result)),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> save(
    DiscoveryResult result,
    DateTime fetchedAt, [
    String countryCode = 'ZA',
  ]) async {
    if (result.deals.isEmpty) return;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _keyFor(countryCode),
        jsonEncode({
          'fetchedAt': fetchedAt.toUtc().toIso8601String(),
          'result': result.toJson(),
        }),
      );
    } catch (_) {
      // Cache is best-effort.
    }
  }

  static String _keyFor(String countryCode) {
    final normalized = countryCode.trim().toUpperCase();
    final safeCode =
        RegExp(r'^[A-Z]{2}$').hasMatch(normalized) ? normalized : 'ZA';
    return '${_keyPrefix}_$safeCode';
  }
}
