import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/discovery_cache.dart';

void main() {
  late Directory cacheDirectory;

  setUp(() async {
    cacheDirectory = await Directory.systemTemp.createTemp('discovery-cache');
  });

  tearDown(() async {
    if (await cacheDirectory.exists()) {
      await cacheDirectory.delete(recursive: true);
    }
  });

  DiscoveryCache cache({DateTime Function()? clock}) => DiscoveryCache(
        clock: clock,
        cacheDirectory: () async => cacheDirectory,
      );

  test('catalogue-only discovery feeds are cached for stories', () async {
    final fetchedAt = DateTime.utc(2026, 7, 27, 8);
    const result = DiscoveryResult(
      deals: [],
      foundDealCount: 0,
      checkedSourceCount: 1,
      unavailableSourceCount: 0,
      leafletCount: 1,
      catalogues: [
        Catalogue(
          name: 'Weekly catalogue',
          url: 'https://example.test/catalogue',
        ),
      ],
    );

    await cache().save(result, fetchedAt, 'ZA');
    final cached = await cache().load('ZA');

    expect(cached, isNotNull);
    expect(cached!.result.catalogues.single.name, 'Weekly catalogue');
    expect(
      cached.isFresh(fetchedAt.add(const Duration(hours: 2))),
      isTrue,
    );
    expect(
      cached.isFresh(fetchedAt.add(const Duration(hours: 4))),
      isFalse,
    );
    final files = cacheDirectory.listSync().whereType<File>().toList();
    expect(files, hasLength(1));
    final bytes = await files.single.readAsBytes();
    expect(bytes.take(2), [0x1f, 0x8b]);
  });

  test('admin and free catalogue caches never share a plan-limited result',
      () async {
    const result = DiscoveryResult(
      deals: [],
      foundDealCount: 0,
      checkedSourceCount: 1,
      unavailableSourceCount: 0,
      leafletCount: 1,
      catalogues: [
        Catalogue(name: 'Free catalogue', url: 'https://example.test/free'),
      ],
    );
    final storage = cache();
    await storage.save(result, DateTime.now(), 'ZA', 'free');
    expect(await storage.load('ZA', 'free'), isNotNull);
    expect(await storage.load('ZA', 'admin'), isNull);
  });

  test('expired catalogues are removed when a cache crosses midnight',
      () async {
    final storage = cache(clock: () => DateTime.utc(2026, 8, 2, 8));
    await storage.save(
      const DiscoveryResult(
        deals: [],
        foundDealCount: 0,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 2,
        catalogues: [
          Catalogue(
            name: 'Expired catalogue',
            url: 'https://example.test/expired',
            validTo: '2026-08-01',
          ),
          Catalogue(
            name: 'Current catalogue',
            url: 'https://example.test/current',
            validTo: '2026-08-02',
          ),
        ],
      ),
      DateTime.utc(2026, 8, 1, 23),
    );
    final cached = await storage.load();
    expect(cached!.result.catalogues.single.name, 'Current catalogue');
    expect(cached.result.leafletCount, 1);
  });

  test('large administrator feeds are cached as a bounded preview', () async {
    final deals = List<Deal>.generate(
      12000,
      (index) => Deal(
        id: 'deal-$index',
        retailerName: 'Store ${index % 80}',
        title: 'Product $index',
        sourceUrl: 'https://example.test/deals/$index',
      ),
      growable: false,
    );
    const access = DiscoveryAccess(
      availableCatalogueCount: 209,
      availableDealCount: 12000,
      catalogueLimit: 2147483647,
      dealLimit: 2147483647,
      planId: 'admin',
    );

    await cache().save(
      DiscoveryResult(
        deals: deals,
        foundDealCount: deals.length,
        checkedSourceCount: 80,
        unavailableSourceCount: 0,
        leafletCount: 0,
        access: access,
      ),
      DateTime.utc(2026, 8, 3, 10),
      'ZA',
      'admin',
    );
    final cached = await cache().load('ZA', 'admin');

    expect(cached, isNotNull);
    expect(cached!.result.deals.length, lessThanOrEqualTo(500));
    expect(cached.result.foundDealCount, 12000);
    expect(cached.result.access?.availableDealCount, 12000);
  });
}
