import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/nearby_history_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('stores and restores the last successful nearby result', () async {
    final store = NearbyHistoryStore();
    const result = NearbyResult(stores: [
      NearbyStore(
        placeId: 'store-1',
        name: 'Local Market',
        lat: -26.1,
        lon: 28.05,
        logoUrl: 'https://market.test/favicon.ico',
        deals: [
          Deal(
            title: 'Rice 2kg',
            retailerName: 'Local Market',
            imageUrl: 'https://market.test/rice.jpg',
          ),
        ],
      ),
    ]);
    final capturedAt = DateTime.parse('2026-07-16T10:00:00.000Z');

    await store.save(result, capturedAt);
    final restored = await store.load();

    expect(restored?.capturedAt, capturedAt);
    expect(restored?.result.stores.single.name, 'Local Market');
    expect(restored?.result.stores.single.deals.single.imageUrl,
        'https://market.test/rice.jpg');
  });

  test('returns no history for damaged local data', () async {
    SharedPreferences.setMockInitialValues({'nearby_history_v1': 'not-json'});

    expect(await NearbyHistoryStore().load(), isNull);
  });
}
