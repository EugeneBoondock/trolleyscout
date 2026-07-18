import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_models.dart';

/// One past Near-me search, labelled with where it ran.
class NearbyHistoryEntry {
  const NearbyHistoryEntry({
    required this.locationLabel,
    required this.capturedAt,
    required this.result,
  });

  final String locationLabel;
  final DateTime capturedAt;
  final NearbyResult result;

  String get id => capturedAt.toUtc().toIso8601String();
}

/// Kept for the single-latest callers (screen restore, tests).
class NearbyHistory {
  const NearbyHistory({required this.result, required this.capturedAt});
  final NearbyResult result;
  final DateTime capturedAt;
}

/// On-device history of Near-me searches so the page is never blank and each
/// past search is labelled with its location. Stored as a JSON list under the
/// original key; old single-object data is migrated on read.
class NearbyHistoryStore {
  static const _key = 'nearby_history_v1';
  static const _maxEntries = 8;

  Future<List<NearbyHistoryEntry>> loadEntries() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_key);
    if (raw == null || raw.isEmpty) return const [];

    try {
      final decoded = jsonDecode(raw);
      final list = decoded is List
          ? decoded
          : decoded is Map
              ? [decoded] // migrate a single old-format entry
              : const [];
      return list
          .whereType<Map>()
          .map((item) => _entryFromJson(Map<String, dynamic>.from(item)))
          .whereType<NearbyHistoryEntry>()
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Newest search, for callers that only restore the last result.
  Future<NearbyHistory?> load() async {
    final entries = await loadEntries();
    if (entries.isEmpty) return null;
    return NearbyHistory(
        result: entries.first.result, capturedAt: entries.first.capturedAt);
  }

  Future<List<NearbyHistoryEntry>> save(
    NearbyResult result,
    DateTime capturedAt, {
    double? lat,
    double? lon,
    String? label,
  }) async {
    if (result.stores.isEmpty) return loadEntries();

    final entry = NearbyHistoryEntry(
      capturedAt: capturedAt,
      // A typed-address search passes its own label; a GPS search derives one
      // from the nearest store's suburb.
      locationLabel: label != null && label.trim().isNotEmpty
          ? label.trim()
          : deriveLocationLabel(result.stores, lat, lon),
      result: result,
    );

    final existing = await loadEntries();
    final deduped = existing.where((candidate) {
      if (lat == null || lon == null) return true;
      // Collapse repeat searches from essentially the same spot.
      final s = candidate.result.stores.isNotEmpty
          ? candidate.result.stores.first
          : null;
      if (s == null) return true;
      return !((s.lat - lat).abs() < 0.01 && (s.lon - lon).abs() < 0.01);
    });

    final next = [entry, ...deduped].take(_maxEntries).toList();
    await _persist(next);
    return next;
  }

  Future<List<NearbyHistoryEntry>> removeEntry(String id) async {
    final next = (await loadEntries()).where((e) => e.id != id).toList();
    await _persist(next);
    return next;
  }

  Future<void> _persist(List<NearbyHistoryEntry> entries) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _key,
      jsonEncode(entries
          .map((e) => {
                'locationLabel': e.locationLabel,
                'capturedAt': e.capturedAt.toUtc().toIso8601String(),
                'result': e.result.toJson(),
              })
          .toList()),
    );
  }

  NearbyHistoryEntry? _entryFromJson(Map<String, dynamic> json) {
    final capturedAt = DateTime.tryParse(json['capturedAt']?.toString() ?? '');
    final result = json['result'];
    if (capturedAt == null || result is! Map) return null;
    final parsed = NearbyResult.fromJson(Map<String, dynamic>.from(result));
    return NearbyHistoryEntry(
      capturedAt: capturedAt,
      locationLabel: json['locationLabel']?.toString().isNotEmpty == true
          ? json['locationLabel'].toString()
          : deriveLocationLabel(parsed.stores, null, null),
      result: parsed,
    );
  }
}

/// A human label for where a search happened, from the nearest store's suburb.
String deriveLocationLabel(List<NearbyStore> stores, double? lat, double? lon) {
  final withDistance = [...stores]
      .where((s) => s.distanceM != null)
      .toList()
    ..sort((a, b) => (a.distanceM ?? double.infinity)
        .compareTo(b.distanceM ?? double.infinity));
  final nearest = withDistance.isNotEmpty
      ? withDistance.first
      : (stores.isNotEmpty ? stores.first : null);
  final suburb =
      nearest?.address != null ? _suburbFromAddress(nearest!.address!) : null;
  if (suburb != null) return suburb;
  if (lat != null && lon != null) {
    return '${lat.toStringAsFixed(3)}, ${lon.toStringAsFixed(3)}';
  }
  return 'Recent search';
}

String? _suburbFromAddress(String address) {
  final parts =
      address.split(',').map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
  if (parts.length < 2) return null;
  final candidates = parts
      .skip(1)
      .where((p) =>
          !RegExp(r'^\d+$').hasMatch(p) &&
          !RegExp(r'south africa', caseSensitive: false).hasMatch(p) &&
          !RegExp(r'^\d+\s').hasMatch(p))
      .toList();
  if (candidates.length > 1) return candidates[1];
  if (candidates.isNotEmpty) return candidates[0];
  return parts.length > 1 ? parts[1] : null;
}
