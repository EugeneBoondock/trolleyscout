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
