import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/discovery_cache.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('reopening Find Deals reuses a fresh three-hour cache',
      (tester) async {
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_cachedDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now().subtract(const Duration(hours: 2)),
    );
    final api = _DealsApi();

    await tester.pumpWidget(_wrap(DealsScreen(api: api, cacheStore: cache)));
    await tester.pumpAndSettle();

    expect(find.text('Marketplace'), findsOneWidget);
    expect(find.text('Cached rice deal'), findsOneWidget);
    expect(api.discoveryCalls, 0);
  });

  testWidgets(
      'a signed-in shopper reuses a fresh cache instead of refetching',
      (tester) async {
    // This used to refetch the whole feed every time Marketplace opened, so
    // a shopper saw "refreshing" on every visit and the database paid for it.
    // The scout only gathers every three hours, so a fetch inside that window
    // cannot return anything new.
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_cachedDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now().subtract(const Duration(hours: 2)),
    );
    final api = _DealsApi();

    await tester.pumpWidget(_wrap(DealsScreen(
      api: api,
      cacheStore: cache,
      isAuthenticated: true,
    )));
    for (var attempt = 0; attempt < 20; attempt += 1) {
      await tester.pump(const Duration(milliseconds: 50));
      if (find.text('Cached rice deal').evaluate().isNotEmpty) break;
    }

    // The board the shopper already had, with no round trip behind it.
    expect(find.text('Cached rice deal'), findsOneWidget);
    expect(api.discoveryCalls, 0);
  });

  testWidgets('a cold marketplace paints a small preview before the full feed',
      (tester) async {
    final api = _StagedDealsApi();
    addTearDown(() {
      if (!api.fullResult.isCompleted) {
        api.fullResult.complete(const DiscoveryResult(
          deals: [_serverDeal],
          foundDealCount: 1,
          checkedSourceCount: 1,
          unavailableSourceCount: 0,
          leafletCount: 0,
        ));
      }
    });

    await tester.pumpWidget(_wrap(DealsScreen(
      api: api,
      cacheStore: _MemoryDiscoveryCache(),
    )));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));

    api.fullResult.complete(const DiscoveryResult(
      deals: [_serverDeal],
      foundDealCount: 1,
      checkedSourceCount: 1,
      unavailableSourceCount: 0,
      leafletCount: 0,
    ));
    expect(find.text('Preview coffee deal'), findsOneWidget);
    expect(api.summaryCalls, 1);
    expect(api.fullCalls, 1);

    await tester.pumpAndSettle();

    expect(find.text('Stored server deal'), findsOneWidget);
    expect(find.text('Preview coffee deal'), findsNothing);
  });

  testWidgets('a cache older than three hours re-reads stored server deals',
      (tester) async {
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_cachedDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now().subtract(const Duration(hours: 4)),
    );
    final api = _DealsApi();

    await tester.pumpWidget(_wrap(DealsScreen(api: api, cacheStore: cache)));
    await tester.pumpAndSettle();

    expect(find.text('Stored server deal'), findsOneWidget);
    expect(api.discoveryCalls, 1);
    expect(api.forceLiveCalls, [false]);
  });

  testWidgets(
      'a failed refresh reports the refresh failure without claiming the device is offline',
      (tester) async {
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_cachedDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now().subtract(const Duration(hours: 4)),
    );

    await tester.pumpWidget(_wrap(DealsScreen(
      api: _FailingDealsApi(),
      cacheStore: cache,
    )));
    await tester.pumpAndSettle();

    expect(find.textContaining('Couldn’t refresh'), findsOneWidget);
    expect(find.textContaining('Offline'), findsNothing);
    expect(find.text('Cached rice deal'), findsOneWidget);
  });

  testWidgets('tapping a marketplace image opens swipeable deal details',
      (tester) async {
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_galleryDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now(),
    );
    await tester.pumpWidget(_wrap(DealsScreen(
      api: _GalleryDealsApi(),
      cacheStore: cache,
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('deal-image-gallery-deal')));
    await tester.pumpAndSettle();

    expect(find.text('Deal details'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('marketplace-product-viewer')),
        matching: find.text('Gallery coffee deal'),
      ),
      findsOneWidget,
    );
    expect(find.text('1 of 2'), findsOneWidget);
    expect(find.text('View official source'), findsOneWidget);
    expect(find.text('Sold out'), findsWidgets);

    await tester.drag(
      find.byKey(const Key('marketplace-product-gallery')),
      const Offset(-350, 0),
    );
    await tester.pumpAndSettle();

    expect(find.text('2 of 2'), findsOneWidget);
  });

  testWidgets('country switch never reuses another country’s deal cache',
      (tester) async {
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_cachedDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now(),
      countryCode: 'ZA',
    );
    final api = _DealsApi(countryCode: 'ZW');

    await tester.pumpWidget(_wrap(DealsScreen(api: api, cacheStore: cache)));
    await tester.pumpAndSettle();

    expect(find.text('Stored server deal'), findsOneWidget);
    expect(find.text('Cached rice deal'), findsNothing);
    expect(api.discoveryCalls, 2);
    expect(api.dealSiteCalls, 0);
  });

  testWidgets('shopping calendar filters the live list by a selected season',
      (tester) async {
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_studentDeal, _regularDeal],
        foundDealCount: 2,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now(),
    );

    await tester.pumpWidget(_wrap(DealsScreen(
      api: _DealsApi(),
      cacheStore: cache,
    )));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('retail-season-calendar')));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(
      find.byKey(const Key('retail-season-student-offers')),
      find.byKey(const Key('retail-season-track')),
      const Offset(-300, 0),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retail-season-student-offers')));
    await tester.pumpAndSettle();

    expect(find.text('Student laptop deal'), findsOneWidget);
    expect(find.text('Ordinary kettle deal'), findsNothing);
    expect(find.byKey(const Key('clear-retail-season')), findsOneWidget);
  });

  testWidgets('shopping calendar collapses and remembers the shopper choice',
      (tester) async {
    final cache = _MemoryDiscoveryCache.withValue(
      const DiscoveryResult(
        deals: [_studentDeal, _regularDeal],
        foundDealCount: 2,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now(),
    );

    await tester.pumpWidget(_wrap(DealsScreen(
      api: _DealsApi(),
      cacheStore: cache,
    )));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('retail-season-calendar')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('retail-season-track')), findsOneWidget);
    await tester.tap(find.byKey(const Key('retail-season-calendar-toggle')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('retail-season-track')), findsNothing);
    expect(find.byKey(const Key('retail-season-calendar-summary')),
        findsOneWidget);
    expect(
      (await SharedPreferences.getInstance())
          .getBool('marketplace_season_calendar_expanded_v1'),
      isFalse,
    );

    await tester.tap(find.byKey(const Key('retail-season-calendar-summary')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('retail-season-track')), findsOneWidget);
  });
}

Widget _wrap(Widget child) => MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: child),
    );

class _DealsApi extends Api {
  _DealsApi({this.countryCode = 'ZA'}) : super(baseUrl: 'https://example.test');

  final String countryCode;
  int discoveryCalls = 0;
  int dealSiteCalls = 0;
  final List<bool> forceLiveCalls = [];

  @override
  String get effectiveCountryCode => countryCode;

  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    discoveryCalls += 1;
    forceLiveCalls.add(forceLive);
    return const DiscoveryResult(
      deals: [_serverDeal],
      foundDealCount: 1,
      checkedSourceCount: 1,
      unavailableSourceCount: 0,
      leafletCount: 0,
    );
  }

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async {
    dealSiteCalls += 1;
    return const [];
  }

  @override
  Future<List<PublicAd>> publicAds(String placement) async => const [];

  @override
  Future<List<RetailHoliday>> retailHolidays() async => const [];

  @override
  Future<RetailerCatalog> retailers(
          {String query = '',
          String kind = 'all',
          bool summary = false}) async =>
      const RetailerCatalog(retailers: [], sourceKinds: []);

  @override
  Future<NotificationPreferences> notificationPreferences() async =>
      const NotificationPreferences.off();
}

class _MemoryDiscoveryCache extends DiscoveryCache {
  _MemoryDiscoveryCache();

  _MemoryDiscoveryCache.withValue(
    DiscoveryResult result,
    DateTime fetchedAt, {
    String countryCode = 'ZA',
    String accessScope = 'free',
  }) {
    values['$countryCode:$accessScope'] =
        CachedDiscovery(result: result, fetchedAt: fetchedAt);
  }

  final values = <String, CachedDiscovery>{};

  @override
  Future<CachedDiscovery?> load(
          [String countryCode = 'ZA', String accessScope = 'free']) async =>
      values['$countryCode:$accessScope'];

  @override
  Future<void> save(DiscoveryResult result, DateTime fetchedAt,
      [String countryCode = 'ZA', String accessScope = 'free']) async {
    values['$countryCode:$accessScope'] =
        CachedDiscovery(result: result, fetchedAt: fetchedAt);
  }
}

class _FailingDealsApi extends _DealsApi {
  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    throw const ApiException('The request took too long. Try again.');
  }
}

class _StagedDealsApi extends _DealsApi {
  final fullResult = Completer<DiscoveryResult>();
  int summaryCalls = 0;
  int fullCalls = 0;

  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    if (summary) {
      summaryCalls += 1;
      return const DiscoveryResult(
        deals: [_previewDeal],
        foundDealCount: 11435,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 205,
      );
    }
    fullCalls += 1;
    return fullResult.future;
  }
}

class _GalleryDealsApi extends _DealsApi {
  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [_galleryDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      );
}

const _cachedDeal = Deal(
  id: 'cached-deal',
  retailerId: 'example',
  retailerName: 'Example Store',
  sourceLabel: 'Stored deals',
  sourceUrl: 'https://example.test/deals',
  productUrl: 'https://example.test/deals/cached',
  title: 'Cached rice deal',
  capturedAt: '2026-07-19T09:00:00.000Z',
  evidenceText: 'Cached rice deal R29.99',
);

const _serverDeal = Deal(
  id: 'server-deal',
  retailerId: 'example',
  retailerName: 'Example Store',
  sourceLabel: 'Stored deals',
  sourceUrl: 'https://example.test/deals',
  productUrl: 'https://example.test/deals/server',
  title: 'Stored server deal',
  capturedAt: '2026-07-19T12:00:00.000Z',
  evidenceText: 'Stored server deal R24.99',
);

const _previewDeal = Deal(
  id: 'preview-deal',
  retailerId: 'example',
  retailerName: 'Example Store',
  sourceLabel: 'Stored deals',
  sourceUrl: 'https://example.test/deals',
  productUrl: 'https://example.test/deals/preview',
  title: 'Preview coffee deal',
  capturedAt: '2026-08-02T12:00:00.000Z',
  evidenceText: 'Preview coffee deal R49.99',
);

const _galleryDeal = Deal(
  id: 'gallery-deal',
  retailerId: 'example',
  retailerName: 'Example Store',
  sourceLabel: 'Marketplace',
  sourceUrl: 'https://example.test/deals',
  productUrl: 'https://example.test/deals/gallery',
  title: 'Gallery coffee deal',
  capturedAt: '2026-07-26T12:00:00.000Z',
  evidenceText: 'Gallery coffee deal R79.99',
  imageUrl: 'https://images.example.test/coffee-front.png',
  images: [
    'https://images.example.test/coffee-front.png',
    'https://images.example.test/coffee-side.png',
  ],
  soldOut: true,
);

const _studentDeal = Deal(
  id: 'student-deal',
  retailerId: 'campus-shop',
  retailerName: 'Campus Shop',
  sourceLabel: 'Official student offers',
  sourceUrl: 'https://example.test/student-offers',
  productUrl: 'https://example.test/student-laptop',
  title: 'Student laptop deal',
  capturedAt: '2026-08-02T12:00:00.000Z',
  evidenceText: 'Verified student discount',
);

const _regularDeal = Deal(
  id: 'regular-deal',
  retailerId: 'home-shop',
  retailerName: 'Home Shop',
  sourceLabel: 'Official offers',
  sourceUrl: 'https://example.test/offers',
  productUrl: 'https://example.test/kettle',
  title: 'Ordinary kettle deal',
  capturedAt: '2026-08-02T12:00:00.000Z',
  evidenceText: 'Current kettle price',
);
