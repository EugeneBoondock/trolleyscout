import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'api_models.dart';

class CachedDiscovery {
  const CachedDiscovery({required this.result, required this.fetchedAt});

  final DiscoveryResult result;
  final DateTime fetchedAt;

  Set<String> get dealIds =>
      result.deals.map((deal) => deal.id).where((id) => id.isNotEmpty).toSet();

  bool isFresh(
    DateTime now, {
    Duration maxAge = const Duration(hours: 3),
  }) {
    final age = now.toUtc().difference(fetchedAt.toUtc());
    return !age.isNegative && age <= maxAge;
  }
}

/// Last successful Find-deals payload, kept on-device so reopening the screen
/// is instant and does not repeat a server read inside the three-hour window.
class DiscoveryCache {
  DiscoveryCache({
    DateTime Function()? clock,
    Future<Directory> Function()? cacheDirectory,
  })  : _clock = clock ?? DateTime.now,
        _cacheDirectory = cacheDirectory ?? getApplicationCacheDirectory;

  static const _keyPrefix = 'discovery_cache_v5';
  static const _maxCachedDeals = 500;
  static const _maxCacheBytes = 8 * 1024 * 1024;
  static const _maxDecodedBytes = 8 * 1024 * 1024;
  final DateTime Function() _clock;
  final Future<Directory> Function() _cacheDirectory;

  Future<CachedDiscovery?> load([
    String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async {
    try {
      final file = await _fileFor(countryCode, accessScope);
      if (!await file.exists()) return null;
      final size = await file.length();
      if (size <= 0 || size > _maxCacheBytes) {
        await _delete(file);
        return null;
      }
      final compressed = await file.readAsBytes();
      final decodedBytes = gzip.decode(compressed);
      if (decodedBytes.length > _maxDecodedBytes) {
        await _delete(file);
        return null;
      }
      final raw = utf8.decode(decodedBytes);
      if (raw.isEmpty) return null;

      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final data = Map<String, dynamic>.from(decoded);
      final fetchedAt = DateTime.tryParse(data['fetchedAt']?.toString() ?? '');
      final result = data['result'];
      if (fetchedAt == null || result is! Map) return null;

      return CachedDiscovery(
        fetchedAt: fetchedAt,
        result: _withoutExpiredCatalogues(
          DiscoveryResult.fromJson(Map<String, dynamic>.from(result)),
          _clock(),
        ),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> save(
    DiscoveryResult result,
    DateTime fetchedAt, [
    String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async {
    if (result.deals.isEmpty && result.catalogues.isEmpty) return;
    try {
      final cacheResult = _boundedPreview(result);
      final encoded = utf8.encode(jsonEncode({
        'fetchedAt': fetchedAt.toUtc().toIso8601String(),
        'result': cacheResult.toJson(),
      }));
      final file = await _fileFor(countryCode, accessScope);
      if (encoded.length > _maxDecodedBytes) {
        await _delete(file);
        return;
      }
      final compressed = gzip.encode(encoded);
      if (compressed.length > _maxCacheBytes) {
        await _delete(file);
        return;
      }
      await file.parent.create(recursive: true);
      await file.writeAsBytes(compressed, flush: true);
    } catch (_) {
      // Cache is best-effort.
    }
  }

  Future<File> _fileFor(String countryCode, String accessScope) async {
    final directory = await _cacheDirectory();
    return File('${directory.path}${Platform.pathSeparator}'
        '${_keyFor(countryCode, accessScope)}.json');
  }

  static Future<void> _delete(File file) async {
    try {
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Cache cleanup is best-effort.
    }
  }

  static String _keyFor(String countryCode, String accessScope) {
    final normalized = countryCode.trim().toUpperCase();
    final safeCode =
        RegExp(r'^[A-Z]{2}$').hasMatch(normalized) ? normalized : 'ZA';
    final normalizedScope = accessScope.trim().toLowerCase();
    final safeScope = RegExp(r'^[a-z0-9_-]{1,32}$').hasMatch(normalizedScope)
        ? normalizedScope
        : 'free';
    return '${_keyPrefix}_${safeCode}_$safeScope';
  }

  static DiscoveryResult _withoutExpiredCatalogues(
    DiscoveryResult result,
    DateTime now,
  ) {
    final today = DateTime.utc(now.year, now.month, now.day);
    final catalogues = result.catalogues.where((catalogue) {
      final value = catalogue.validTo;
      if (value == null) return true;
      final date = value.length >= 10 ? value.substring(0, 10) : value;
      final end = DateTime.tryParse(date);
      if (end == null) return true;
      return !DateTime.utc(end.year, end.month, end.day).isBefore(today);
    }).toList(growable: false);
    if (catalogues.length == result.catalogues.length) return result;
    return DiscoveryResult(
      deals: result.deals,
      foundDealCount: result.foundDealCount,
      checkedSourceCount: result.checkedSourceCount,
      unavailableSourceCount: result.unavailableSourceCount,
      leafletCount: catalogues.length,
      catalogues: catalogues,
      businessStories: result.businessStories,
      access: result.access,
      refreshedAt: result.refreshedAt,
    );
  }

  static DiscoveryResult _boundedPreview(DiscoveryResult result) {
    if (result.deals.length <= _maxCachedDeals) return result;
    return DiscoveryResult(
      deals: result.deals.take(_maxCachedDeals).toList(growable: false),
      foundDealCount: result.foundDealCount,
      checkedSourceCount: result.checkedSourceCount,
      unavailableSourceCount: result.unavailableSourceCount,
      leafletCount: result.leafletCount,
      catalogues: result.catalogues,
      businessStories: result.businessStories,
      access: result.access,
      refreshedAt: result.refreshedAt,
    );
  }
}
