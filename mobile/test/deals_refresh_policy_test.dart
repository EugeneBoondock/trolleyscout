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
    await DiscoveryCache().save(
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

    await tester.pumpWidget(_wrap(DealsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Marketplace'), findsOneWidget);
    expect(find.text('Cached rice deal'), findsOneWidget);
    expect(api.discoveryCalls, 0);
  });

  testWidgets('a cache older than three hours re-reads stored server deals',
      (tester) async {
    await DiscoveryCache().save(
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

    await tester.pumpWidget(_wrap(DealsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Stored server deal'), findsOneWidget);
    expect(api.discoveryCalls, 1);
    expect(api.forceLiveCalls, [false]);
  });

  testWidgets(
      'a failed refresh reports the refresh failure without claiming the device is offline',
      (tester) async {
    await DiscoveryCache().save(
      const DiscoveryResult(
        deals: [_cachedDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now().subtract(const Duration(hours: 4)),
    );

    await tester.pumpWidget(_wrap(DealsScreen(api: _FailingDealsApi())));
    await tester.pumpAndSettle();

    expect(find.textContaining('Couldn’t refresh'), findsOneWidget);
    expect(find.textContaining('Offline'), findsNothing);
    expect(find.text('Cached rice deal'), findsOneWidget);
  });

  testWidgets('tapping a marketplace image opens a swipeable product viewer',
      (tester) async {
    await tester.pumpWidget(_wrap(DealsScreen(api: _GalleryDealsApi())));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('deal-image-gallery-deal')));
    await tester.pumpAndSettle();

    expect(find.text('Marketplace product images'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('marketplace-product-viewer')),
        matching: find.text('Gallery coffee deal'),
      ),
      findsOneWidget,
    );
    expect(find.text('1 of 2'), findsOneWidget);
    expect(find.text('View product'), findsOneWidget);

    await tester.drag(
      find.byKey(const Key('marketplace-product-gallery')),
      const Offset(-350, 0),
    );
    await tester.pumpAndSettle();

    expect(find.text('2 of 2'), findsOneWidget);
  });

  testWidgets('country switch never reuses another country’s deal cache',
      (tester) async {
    await DiscoveryCache().save(
      const DiscoveryResult(
        deals: [_cachedDeal],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      ),
      DateTime.now(),
      'ZA',
    );
    final api = _DealsApi(countryCode: 'ZW');

    await tester.pumpWidget(_wrap(DealsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Stored server deal'), findsOneWidget);
    expect(find.text('Cached rice deal'), findsNothing);
    expect(api.discoveryCalls, 1);
    expect(api.dealSiteCalls, 0);
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
}

class _FailingDealsApi extends _DealsApi {
  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    throw const ApiException('The request took too long. Try again.');
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
);
