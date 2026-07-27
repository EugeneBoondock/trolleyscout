import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/favourite_stores_store.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('adds, persists, and removes a favourite store', () async {
    final store = FavouriteStoresStore();
    const favourite = FavouriteStore(
      id: 'retailer:pick-n-pay',
      displayName: 'Pick n Pay',
      savedAt: 100,
    );

    expect(await store.load(), isEmpty);
    expect(await store.toggle(favourite), [favourite]);
    expect(await store.load(), [favourite]);
    expect(await store.toggle(favourite), isEmpty);
    expect(await store.load(), isEmpty);
  });

  test('ignores malformed saved entries', () async {
    SharedPreferences.setMockInitialValues({
      'favourite_stores_v1':
          '[{"id":""},{"id":"retailer:spar","displayName":"SPAR","savedAt":20}]',
    });

    expect(await FavouriteStoresStore().load(), const [
      FavouriteStore(
        id: 'retailer:spar',
        displayName: 'SPAR',
        savedAt: 20,
      ),
    ]);
  });
}
