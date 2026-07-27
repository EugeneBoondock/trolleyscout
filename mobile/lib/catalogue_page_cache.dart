import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_models.dart';

typedef CataloguePageFetcher = Future<List<CataloguePage>> Function(String url);
typedef CatalogueCacheClock = DateTime Function();

/// Keeps catalogue page metadata on-device so opening a story and then opening
/// the same catalogue reader does not repeat an upstream page-list request.
class CataloguePageCache {
  CataloguePageCache({
    CatalogueCacheClock? clock,
    this.freshFor = const Duration(hours: 6),
    this.retainFor = const Duration(days: 7),
    this.maxEntries = 24,
  }) : _clock = clock ?? DateTime.now;

  static const storageKey = 'catalogue_page_cache_v1';

  final Duration freshFor;
  final Duration retainFor;
  final int maxEntries;
  final CatalogueCacheClock _clock;
  final Map<String, Future<List<CataloguePage>>> _inFlight = {};
  Future<void> _writeTail = Future<void>.value();

  Future<List<CataloguePage>> load(
    String url,
    CataloguePageFetcher fetcher,
  ) async {
    final key = _cacheKey(url);
    final snapshot = await _readSnapshot();
    final cached = snapshot[key];
    final now = _clock().toUtc();
    if (cached != null && _isFresh(cached.fetchedAt, now)) {
      return List<CataloguePage>.unmodifiable(cached.pages);
    }

    final pending = _inFlight[key];
    if (pending != null) return pending;

    late final Future<List<CataloguePage>> request;
    request = _refresh(
      key: key,
      fetcher: fetcher,
      stale: cached,
    );
    _inFlight[key] = request;
    try {
      return await request;
    } finally {
      if (identical(_inFlight[key], request)) {
        _inFlight.remove(key);
      }
    }
  }

  Future<List<CataloguePage>> _refresh({
    required String key,
    required CataloguePageFetcher fetcher,
    required _CataloguePageCacheEntry? stale,
  }) async {
    try {
      final pages = _cleanPages(await fetcher(key));
      if (pages.isEmpty) {
        return stale == null
            ? const []
            : List<CataloguePage>.unmodifiable(stale.pages);
      }
      await _save(key, pages, _clock().toUtc());
      return List<CataloguePage>.unmodifiable(pages);
    } catch (_) {
      if (stale != null && stale.pages.isNotEmpty) {
        return List<CataloguePage>.unmodifiable(stale.pages);
      }
      rethrow;
    }
  }

  Future<Map<String, _CataloguePageCacheEntry>> _readSnapshot() async {
    await _writeTail;
    return _readSnapshotUnlocked();
  }

  Future<Map<String, _CataloguePageCacheEntry>> _readSnapshotUnlocked() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(storageKey);
      if (raw == null || raw.isEmpty) return {};
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return {};
      final entries = decoded['entries'];
      if (entries is! Map) return {};

      final now = _clock().toUtc();
      final result = <String, _CataloguePageCacheEntry>{};
      for (final item in entries.entries) {
        final key = item.key.toString();
        final value = item.value;
        if (value is! Map) continue;
        final entry = _CataloguePageCacheEntry.tryParse(
          Map<String, dynamic>.from(value),
        );
        if (entry == null || !_isRetained(entry.fetchedAt, now)) continue;
        result[key] = entry;
      }
      return result;
    } catch (_) {
      return {};
    }
  }

  Future<void> _save(
    String key,
    List<CataloguePage> pages,
    DateTime fetchedAt,
  ) {
    final previous = _writeTail;
    final completion = Completer<void>();
    _writeTail = completion.future;

    return () async {
      try {
        await previous;
        final entries = await _readSnapshotUnlocked();
        entries[key] = _CataloguePageCacheEntry(
          fetchedAt: fetchedAt,
          pages: pages,
        );
        final retained = entries.entries.toList()
          ..sort(
            (left, right) =>
                right.value.fetchedAt.compareTo(left.value.fetchedAt),
          );
        final entryLimit = maxEntries.clamp(1, 100).toInt();
        final bounded = retained.take(entryLimit).toList();
        final preferences = await SharedPreferences.getInstance();
        await preferences.setString(
          storageKey,
          jsonEncode({
            'entries': {
              for (final entry in bounded) entry.key: entry.value.toJson(),
            },
          }),
        );
      } catch (_) {
        // Page metadata caching is best-effort.
      } finally {
        completion.complete();
      }
    }();
  }

  bool _isFresh(DateTime fetchedAt, DateTime now) {
    final age = now.difference(fetchedAt);
    return !age.isNegative && age <= freshFor;
  }

  bool _isRetained(DateTime fetchedAt, DateTime now) {
    final age = now.difference(fetchedAt);
    return !age.isNegative && age <= retainFor;
  }

  static String _cacheKey(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
      throw const FormatException('Invalid catalogue page list URL');
    }
    return uri.replace(fragment: '').toString();
  }

  static List<CataloguePage> _cleanPages(List<CataloguePage> pages) {
    final byNumber = <int, CataloguePage>{};
    for (final page in pages) {
      if (page.pageNumber <= 0 || page.imageUrl.trim().isEmpty) continue;
      byNumber.putIfAbsent(page.pageNumber, () => page);
    }
    return byNumber.values.toList()
      ..sort((left, right) => left.pageNumber.compareTo(right.pageNumber));
  }
}

class _CataloguePageCacheEntry {
  const _CataloguePageCacheEntry({
    required this.fetchedAt,
    required this.pages,
  });

  final DateTime fetchedAt;
  final List<CataloguePage> pages;

  static _CataloguePageCacheEntry? tryParse(Map<String, dynamic> json) {
    try {
      final fetchedAt = DateTime.tryParse(json['fetchedAt']?.toString() ?? '');
      final rawPages = json['pages'];
      if (fetchedAt == null || rawPages is! List) return null;
      final pages = rawPages
          .whereType<Map>()
          .map(
              (page) => CataloguePage.fromJson(Map<String, dynamic>.from(page)))
          .where((page) => page.pageNumber > 0 && page.imageUrl.isNotEmpty)
          .toList()
        ..sort((left, right) => left.pageNumber.compareTo(right.pageNumber));
      if (pages.isEmpty) return null;
      return _CataloguePageCacheEntry(
        fetchedAt: fetchedAt.toUtc(),
        pages: pages,
      );
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> toJson() => {
        'fetchedAt': fetchedAt.toUtc().toIso8601String(),
        'pages': pages.map((page) => page.toJson()).toList(),
      };
}
