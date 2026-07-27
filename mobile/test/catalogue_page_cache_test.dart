import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/catalogue_page_cache.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a fresh page list is reused without another request', () async {
    var now = DateTime.utc(2026, 7, 27, 8);
    var fetchCalls = 0;
    final cache = CataloguePageCache(clock: () => now);

    Future<List<CataloguePage>> fetcher(String _) async {
      fetchCalls += 1;
      return const [
        CataloguePage(
          pageNumber: 1,
          imageUrl: 'https://images.example.test/page-1.webp',
        ),
      ];
    }

    await cache.load(_pagesUrl, fetcher);
    now = now.add(const Duration(hours: 5));
    final second = await cache.load(_pagesUrl, fetcher);

    expect(fetchCalls, 1);
    expect(second.single.pageNumber, 1);
  });

  test('concurrent readers share one page-list request', () async {
    final gate = Completer<List<CataloguePage>>();
    var fetchCalls = 0;
    final cache = CataloguePageCache(
      clock: () => DateTime.utc(2026, 7, 27, 8),
    );

    Future<List<CataloguePage>> fetcher(String _) {
      fetchCalls += 1;
      return gate.future;
    }

    final first = cache.load(_pagesUrl, fetcher);
    final second = cache.load(_pagesUrl, fetcher);
    await Future<void>.delayed(Duration.zero);
    expect(fetchCalls, 1);

    gate.complete(const [
      CataloguePage(
        pageNumber: 2,
        imageUrl: 'https://images.example.test/page-2.webp',
      ),
      CataloguePage(
        pageNumber: 1,
        imageUrl: 'https://images.example.test/page-1.webp',
      ),
    ]);

    expect((await first).map((page) => page.pageNumber), [1, 2]);
    expect((await second).map((page) => page.pageNumber), [1, 2]);
  });

  test('a stale page list is used when its refresh fails', () async {
    var now = DateTime.utc(2026, 7, 27, 8);
    var fetchCalls = 0;
    final cache = CataloguePageCache(clock: () => now);

    await cache.load(_pagesUrl, (_) async {
      fetchCalls += 1;
      return const [
        CataloguePage(
          pageNumber: 1,
          imageUrl: 'https://images.example.test/page-1.webp',
        ),
      ];
    });
    now = now.add(const Duration(hours: 7));

    final pages = await cache.load(_pagesUrl, (_) async {
      fetchCalls += 1;
      throw StateError('offline');
    });

    expect(fetchCalls, 2);
    expect(pages.single.imageUrl, contains('page-1.webp'));
  });

  test('stored page metadata stays within its entry limit', () async {
    var now = DateTime.utc(2026, 7, 27, 8);
    final cache = CataloguePageCache(
      clock: () => now,
      maxEntries: 2,
    );

    for (var index = 1; index <= 3; index += 1) {
      final url = 'https://example.test/api/catalogue-pages?flyer=$index';
      await cache.load(
        url,
        (_) async => [
          CataloguePage(
            pageNumber: 1,
            imageUrl: 'https://images.example.test/$index.webp',
          ),
        ],
      );
      now = now.add(const Duration(minutes: 1));
    }

    final preferences = await SharedPreferences.getInstance();
    final payload = jsonDecode(
      preferences.getString(CataloguePageCache.storageKey)!,
    ) as Map<String, dynamic>;
    final entries = payload['entries'] as Map<String, dynamic>;

    expect(entries, hasLength(2));
    expect(entries.keys.any((key) => key.endsWith('flyer=1')), isFalse);
  });
}

const _pagesUrl =
    'https://example.test/api/catalogue-pages?flyer=3703321&store=boxer';
