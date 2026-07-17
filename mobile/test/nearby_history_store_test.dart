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

  NearbyResult resultAt(String name, double lat, double lon) => NearbyResult(
        stores: [
          NearbyStore(
            placeId: 'p-$name',
            name: name,
            address: '12 Main Rd, $name, South Africa',
            lat: lat,
            lon: lon,
            distanceM: 120,
            deals: const [
              Deal(title: 'Bread', retailerName: 'Shop'),
            ],
          ),
        ],
      );

  test('keeps distinct searches as separate labelled entries', () async {
    final store = NearbyHistoryStore();

    await store.save(resultAt('Edenvale', -26.14, 28.15),
        DateTime.parse('2026-07-16T09:00:00.000Z'),
        lat: -26.14, lon: 28.15);
    final entries = await store.save(resultAt('Sandton', -26.10, 28.05),
        DateTime.parse('2026-07-16T11:00:00.000Z'),
        lat: -26.10, lon: 28.05);

    expect(entries.length, 2);
    expect(entries.first.locationLabel, 'Sandton');
    expect(entries.last.locationLabel, 'Edenvale');
  });

  test('collapses repeat searches from essentially the same spot', () async {
    final store = NearbyHistoryStore();

    await store.save(resultAt('Edenvale', -26.14, 28.15),
        DateTime.parse('2026-07-16T09:00:00.000Z'),
        lat: -26.14, lon: 28.15);
    final entries = await store.save(resultAt('Edenvale', -26.141, 28.151),
        DateTime.parse('2026-07-16T09:05:00.000Z'),
        lat: -26.141, lon: 28.151);

    expect(entries.length, 1);
    expect(entries.single.capturedAt,
        DateTime.parse('2026-07-16T09:05:00.000Z'));
  });

  test('removeEntry drops the matching search by id', () async {
    final store = NearbyHistoryStore();
    await store.save(resultAt('Edenvale', -26.14, 28.15),
        DateTime.parse('2026-07-16T09:00:00.000Z'),
        lat: -26.14, lon: 28.15);
    final entries = await store.save(resultAt('Sandton', -26.10, 28.05),
        DateTime.parse('2026-07-16T11:00:00.000Z'),
        lat: -26.10, lon: 28.05);

    final remaining = await store.removeEntry(entries.first.id);

    expect(remaining.length, 1);
    expect(remaining.single.locationLabel, 'Edenvale');
  });

  test('deriveLocationLabel reads the suburb from the nearest address', () {
    final label = deriveLocationLabel(const [
      NearbyStore(
        placeId: 'p',
        name: 'Shop',
        address: '12 Main Rd, Bryanston, South Africa',
        distanceM: 90,
      ),
    ], null, null);

    expect(label, 'Bryanston');
  });
}
