import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/discovery_cache.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

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

    await DiscoveryCache().save(result, fetchedAt, 'ZA');
    final cached = await DiscoveryCache().load('ZA');

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
  });
}
