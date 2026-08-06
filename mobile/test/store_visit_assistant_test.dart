import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/store_visit_assistant.dart';
import 'package:trolley_scout/screens/store_visit_history_screen.dart';
import 'package:trolley_scout/taste_profile.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('uses offer retailer id when a detected place has no retailer id', () {
    final event = StorePresenceEvent(
      type: StorePresenceEventType.entered,
      store: const NearbyStore(
        placeId: 'unlinked-place',
        name: 'Boxer Johannesburg',
        address: '1 Main Street, Johannesburg',
      ),
      visit: StoreVisitRecord(
        id: 'visit-1',
        placeId: 'unlinked-place',
        storeName: 'Boxer Johannesburg',
        arrivedAt: DateTime.utc(2026, 8, 2, 8),
      ),
      deals: const [_boxerDeal],
    );

    expect(event.retailerId, 'boxer');
  });

  test('records one in-store arrival with matching Marketplace offers',
      () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    final api = _VisitApi();
    var now = DateTime.parse('2026-08-02T09:00:00.000Z');
    final assistant = StoreVisitAssistant(
      api: api,
      preferences: preferences,
      readLocation: () async => const ShopperLocation(-26.2, 28.04),
      now: () => now,
    );

    // One sighting is a passer-by. The claim needs the same shop three times
    // over four settled minutes.
    expect(await assistant.check(), isNull);
    now = now.add(const Duration(minutes: 2));
    expect(await assistant.check(), isNull);
    now = now.add(const Duration(minutes: 2));
    final entered = await assistant.check();

    expect(entered?.type, StorePresenceEventType.entered);
    expect(entered?.store.name, 'Boxer Johannesburg');
    expect(entered?.deals.map((deal) => deal.title), contains('Rice 10 kg'));
    expect(preferences.visits, hasLength(1));
    expect(preferences.frequentStores.single.visitCount, 1);

    now = now.add(const Duration(minutes: 5));
    expect(await assistant.check(), isNull);
    expect(preferences.visits, hasLength(1));
  });

  test('will not name a shop when the mall puts two inside the same circle',
      () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    final api = _VisitApi()
      ..nearby = const NearbyResult(stores: [_boxer, _neighbouringClicks]);
    var now = DateTime.parse('2026-08-02T09:00:00.000Z');
    final assistant = StoreVisitAssistant(
      api: api,
      preferences: preferences,
      readLocation: () async => const ShopperLocation(-26.2, 28.04),
      now: () => now,
    );

    for (var check = 0; check < 4; check += 1) {
      expect(await assistant.check(), isNull);
      now = now.add(const Duration(minutes: 2));
    }
    expect(preferences.visits, isEmpty);
  });

  test('will not claim a shop the fix is only accurate enough to be near',
      () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    var now = DateTime.parse('2026-08-02T09:00:00.000Z');
    // 30m from the door with a 10m fix: the shopper could be on the pavement.
    final assistant = StoreVisitAssistant(
      api: _VisitApi(),
      preferences: preferences,
      readLocation: () async =>
          const ShopperLocation(-26.20027, 28.04, accuracyM: 10),
      now: () => now,
    );

    for (var check = 0; check < 4; check += 1) {
      expect(await assistant.check(), isNull);
      now = now.add(const Duration(minutes: 2));
    }
    expect(preferences.visits, isEmpty);
  });

  test('a shopper driving past never stays long enough to arrive', () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    var now = DateTime.parse('2026-08-02T09:00:00.000Z');
    var atTheShop = true;
    final assistant = StoreVisitAssistant(
      api: _VisitApi(),
      preferences: preferences,
      // Underfoot on one check, a block away on the next: a road past the
      // door, not an aisle.
      readLocation: () async => atTheShop
          ? const ShopperLocation(-26.2, 28.04)
          : const ShopperLocation(-26.209, 28.04),
      now: () => now,
    );

    for (var check = 0; check < 6; check += 1) {
      expect(await assistant.check(), isNull);
      atTheShop = !atTheShop;
      now = now.add(const Duration(minutes: 2));
    }
    expect(preferences.visits, isEmpty);
  });

  test('detects departure and keeps completed visit history', () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    final api = _VisitApi();
    var location = const ShopperLocation(-26.2, 28.04);
    var now = DateTime.parse('2026-08-02T09:00:00.000Z');
    final assistant = StoreVisitAssistant(
      api: api,
      preferences: preferences,
      readLocation: () async => location,
      now: () => now,
    );

    for (var check = 0; check < 3; check += 1) {
      await assistant.check();
      now = now.add(const Duration(minutes: 2));
    }
    expect(preferences.activeVisit, isNotNull);

    location = const ShopperLocation(-25.9, 28.4);
    api.nearby = const NearbyResult(stores: []);
    now = now.add(const Duration(hours: 1));

    // One quiet check could be a bad fix; leaving takes two.
    expect(await assistant.check(), isNull);
    final exited = await assistant.check();

    expect(exited?.type, StorePresenceEventType.exited);
    expect(exited?.visit.leftAt, now);
    expect(preferences.activeVisit, isNull);

    final restored = StoreVisitPreferences();
    await restored.load();
    expect(restored.visits.single.leftAt, now);
  });

  test('disabled assistant does not read shopper location', () async {
    var locationReads = 0;
    final assistant = StoreVisitAssistant(
      api: _VisitApi(),
      preferences: StoreVisitPreferences(),
      readLocation: () async {
        locationReads += 1;
        return const ShopperLocation(-26.2, 28.04);
      },
    );

    expect(await assistant.check(), isNull);
    expect(locationReads, 0);
  });

  test('a store visit becomes a private retailer recommendation signal',
      () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    var now = DateTime.parse('2026-08-02T09:00:00.000Z');
    final assistant = StoreVisitAssistant(
      api: _VisitApi(),
      preferences: preferences,
      readLocation: () async => const ShopperLocation(-26.2, 28.04),
      now: () => now,
    );

    for (var check = 0; check < 3; check += 1) {
      await assistant.check();
      now = now.add(const Duration(minutes: 2));
    }
    final taste = await TasteStore().load();

    expect(taste.score('Weekly special', category: 'Boxer'), greaterThan(0));
  });

  test('rejects one-off and low-accuracy store fixes', () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    var location = const ShopperLocation(
      -26.2,
      28.04,
      accuracyM: 85,
    );
    var now = DateTime.parse('2026-08-02T09:00:00.000Z');
    final assistant = StoreVisitAssistant(
      api: _VisitApi(),
      preferences: preferences,
      readLocation: () async => location,
      now: () => now,
    );

    expect(await assistant.check(), isNull);
    expect(preferences.visits, isEmpty);

    location = const ShopperLocation(-26.2, 28.04, accuracyM: 8);
    for (var check = 0; check < 2; check += 1) {
      now = now.add(const Duration(minutes: 2));
      expect(await assistant.check(), isNull);
      expect(preferences.visits, isEmpty);
    }

    now = now.add(const Duration(minutes: 2));
    final entered = await assistant.check();
    expect(entered?.type, StorePresenceEventType.entered);
    expect(preferences.visits, hasLength(1));
  });

  test('rejects mock locations used by emulators and fake GPS apps', () async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    final assistant = StoreVisitAssistant(
      api: _VisitApi(),
      preferences: preferences,
      readLocation: () async => const ShopperLocation(
        -26.2,
        28.04,
        accuracyM: 5,
        isMocked: true,
      ),
    );

    expect(await assistant.check(), isNull);
    expect(await assistant.check(), isNull);
    expect(preferences.visits, isEmpty);
  });

  testWidgets('visit history shows regular stores in light and dark themes',
      (tester) async {
    final preferences = StoreVisitPreferences();
    await preferences.setEnabled(true);
    await preferences.recordArrival(
      _boxer,
      DateTime.parse('2026-08-02T09:00:00.000Z'),
    );

    for (final theme in [TS.lightTheme(), TS.darkTheme()]) {
      await tester.pumpWidget(MaterialApp(
        theme: theme,
        home: StoreVisitHistoryScreen(preferences: preferences),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Your shopping visits'), findsOneWidget);
      expect(find.text('Your regular stores'), findsOneWidget);
      expect(find.text('Boxer Johannesburg'), findsWidgets);
      expect(find.textContaining('At this store now'), findsOneWidget);
    }
  });
}

class _VisitApi extends Api {
  _VisitApi() : super(baseUrl: 'https://example.test');

  NearbyResult nearby = const NearbyResult(stores: [_boxer]);

  @override
  Future<NearbyResult> nearbyStores(double lat, double lon) async => nearby;

  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [_boxerDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      );
}

const _boxer = NearbyStore(
  placeId: 'boxer-jhb',
  name: 'Boxer Johannesburg',
  address: '1 Main Street, Johannesburg',
  retailerId: 'boxer',
  lat: -26.2,
  lon: 28.04,
  distanceM: 42,
);

/// A different chain a few metres away, the way a shopping centre lists them.
const _neighbouringClicks = NearbyStore(
  placeId: 'clicks-jhb',
  name: 'Clicks Johannesburg',
  address: '1 Main Street, Johannesburg',
  retailerId: 'clicks',
  lat: -26.20009,
  lon: 28.04,
  distanceM: 10,
);

const _boxerDeal = Deal(
  id: 'boxer-rice',
  retailerId: 'boxer',
  retailerName: 'Boxer',
  title: 'Rice 10 kg',
  priceText: 'R129.99',
);
