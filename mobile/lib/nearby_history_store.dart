import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_models.dart';

class NearbyHistory {
  const NearbyHistory({required this.result, required this.capturedAt});

  final NearbyResult result;
  final DateTime capturedAt;
}

class NearbyHistoryStore {
  static const _key = 'nearby_history_v1';

  Future<NearbyHistory?> load() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_key);

    if (raw == null || raw.isEmpty) return null;

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final data = Map<String, dynamic>.from(decoded);
      final capturedAt =
          DateTime.tryParse(data['capturedAt']?.toString() ?? '');
      final result = data['result'];
      if (capturedAt == null || result is! Map) return null;
      return NearbyHistory(
        capturedAt: capturedAt,
        result: NearbyResult.fromJson(Map<String, dynamic>.from(result)),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> save(NearbyResult result, DateTime capturedAt) async {
    if (result.stores.isEmpty) return;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _key,
      jsonEncode({
        'capturedAt': capturedAt.toUtc().toIso8601String(),
        'result': result.toJson(),
      }),
    );
  }
}
