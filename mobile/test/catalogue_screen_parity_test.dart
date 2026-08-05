import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/discovery_cache.dart';
import 'package:trolley_scout/nearby_history_store.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/screens/near_me_screen.dart';
import 'package:trolley_scout/screens/stores_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/catalogue_reader.dart';
import 'package:trolley_scout/widgets/store_map_view.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('Deals opens catalogue pages inside Trolley Scout',
      (tester) async {
    await tester.pumpWidget(_wrap(_deals(_CatalogueApi())));
    await tester.pumpAndSettle();

    expect(find.text('Overview'), findsNothing);

    // The two filters that get used are on the page, not behind a disclosure
    // that had to be opened on every visit.
    expect(find.text('Advanced filters'), findsNothing);
    expect(find.text('All retailers'), findsOneWidget);
    expect(find.text('All sources'), findsOneWidget);

    // Catalogues now live on their own tab, deduped by retailer.
    await tester.tap(find.byType(Tab).at(1));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Winter savings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Winter savings'));
    await tester.pumpAndSettle();

    expect(find.byType(CatalogueReader), findsOneWidget);
    expect(find.text('Page 1 of 2'), findsOneWidget);
  });

  testWidgets('catalogues default to latest and can sort by store name',
      (tester) async {
    _useTallPhoneViewport(tester);
    await tester.pumpWidget(_wrap(
      _deals(_CatalogueDirectoryApi()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Tab).at(1));
    await tester.pumpAndSettle();

    List<String?> storeOrder() => tester
        .widgetList<Text>(find.byWidgetPredicate(
          (widget) =>
              widget is Text &&
              widget.key is ValueKey<String> &&
              (widget.key! as ValueKey<String>)
                  .value
                  .startsWith('catalogue-section-name-'),
        ))
        .map((widget) => widget.data)
        .toList();
    expect(storeOrder(), ['Zulu Store', 'Bravo Shop', 'Alpha Market']);

    final sort = find.byKey(const Key('catalogue-sort-field'));
    expect(sort, findsOneWidget);
    await tester.tap(sort);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Store name').last);
    await tester.pumpAndSettle();

    expect(storeOrder(), ['Alpha Market', 'Bravo Shop', 'Zulu Store']);
  });

  testWidgets('catalogue directory shows every catalogue without another tap',
      (tester) async {
    _useTallPhoneViewport(tester);
    await tester.pumpWidget(_wrap(
      _deals(_CatalogueDirectoryApi()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Tab).at(1));
    await tester.pumpAndSettle();

    expect(find.text('Current catalogues'), findsOneWidget);
    expect(find.text('4 available'), findsOneWidget);
    expect(find.text('Alpha weekly'), findsOneWidget);
    expect(find.text('Alpha home event'), findsOneWidget);
    expect(find.text('Bravo month-end'), findsOneWidget);
    expect(find.text('Zulu weekly'), findsOneWidget);
  });

  testWidgets('catalogue date filters keep upcoming offers out of current',
      (tester) async {
    _useTallPhoneViewport(tester);
    await tester.pumpWidget(_wrap(
      _deals(_CatalogueDirectoryApi()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Tab).at(1));
    await tester.pumpAndSettle();

    expect(find.text('Future preview'), findsNothing);
    expect(find.text('Upcoming 1'), findsOneWidget);

    await tester.drag(
      find.byKey(const Key('catalogue-timing-scroll')),
      const Offset(-260, 0),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('catalogue-timing-upcoming')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Upcoming catalogues'), findsOneWidget);
    expect(find.text('Future preview'), findsOneWidget);
    expect(find.text('Alpha weekly'), findsNothing);
  });

  testWidgets('a single catalogue uses the full store shelf width',
      (tester) async {
    _useTallPhoneViewport(tester);
    await tester.pumpWidget(_wrap(
      _deals(_CatalogueDirectoryApi()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Tab).at(1));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Bravo month-end'));
    await tester.pumpAndSettle();

    final group = find.byKey(const Key('catalogue-group-bravo'));
    final tile = find.byKey(const Key('catalogue-tile-bravo-month-end'));
    expect(group, findsOneWidget);
    expect(tile, findsOneWidget);
    expect(
      tester.getSize(tile).width,
      greaterThan(tester.getSize(group).width * 0.85),
    );
  });

  testWidgets('catalogue search matches store and catalogue names',
      (tester) async {
    _useTallPhoneViewport(tester);
    await tester.pumpWidget(_wrap(
      _deals(_CatalogueDirectoryApi()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Tab).at(1));
    await tester.pumpAndSettle();

    final search = find.byKey(const Key('catalogue-search-field'));
    expect(search, findsOneWidget);
    await tester.enterText(search, 'home event');
    await tester.pump();

    expect(find.text('Alpha Market'), findsOneWidget);
    expect(find.text('Alpha home event'), findsOneWidget);
    expect(find.text('Alpha weekly'), findsNothing);
    expect(find.text('Bravo Shop'), findsNothing);
    expect(find.text('Zulu Store'), findsNothing);
  });

  testWidgets('catalogue retailer shelf jumps straight to one store',
      (tester) async {
    _useTallPhoneViewport(tester);
    await tester.pumpWidget(_wrap(
      _deals(_CatalogueDirectoryApi()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Tab).at(1));
    await tester.pumpAndSettle();

    expect(find.text('Shop by retailer'), findsOneWidget);
    expect(find.byKey(const Key('catalogue-retailer-alpha')), findsOneWidget);
    expect(find.byKey(const Key('catalogue-retailer-bravo')), findsOneWidget);
    expect(find.byKey(const Key('catalogue-retailer-zulu')), findsOneWidget);

    await tester.tap(find.byKey(const Key('catalogue-retailer-alpha')));
    await tester.pumpAndSettle();

    expect(
      tester
          .widget<TextField>(
            find.byKey(const Key('catalogue-search-field')),
          )
          .controller
          ?.text,
      'Alpha Market',
    );
    expect(find.text('2 shown'), findsOneWidget);
    expect(find.text('Alpha weekly'), findsOneWidget);
    expect(find.text('Alpha home event'), findsOneWidget);
    expect(find.text('Bravo month-end'), findsNothing);
    expect(find.text('Zulu weekly'), findsNothing);
  });

  testWidgets('Near Me history opens catalogues inside Trolley Scout',
      (tester) async {
    await NearbyHistoryStore().save(
      const NearbyResult(stores: [_rosebank]),
      DateTime.parse('2026-07-16T10:00:00.000Z'),
    );

    await tester.pumpWidget(_wrap(NearMeScreen(
      api: _CatalogueApi(),
      historyStore: NearbyHistoryStore(),
    )));
    await tester.pumpAndSettle();

    // The store card is a summary; its catalogues live on the store's page.
    await tester.tap(find.text('VIEW'));
    await tester.pumpAndSettle();
    expect(find.text('Milk 2L'), findsOneWidget);
    expect(find.textContaining('Buy 2 for R35'), findsOneWidget);
    expect(find.textContaining('Until 2026-08-09'), findsOneWidget);
    expect(find.text('Open official store website'), findsOneWidget);
    await tester.tap(find.text('Rosebank weekly'));
    await tester.pumpAndSettle();

    expect(find.byType(CatalogueReader), findsOneWidget);
    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(
      tester
          .widget<CatalogueReader>(find.byType(CatalogueReader))
          .deals
          .map((deal) => deal.title),
      contains('Milk 2L'),
    );
  });

  testWidgets('Near Me store details open the in-app map', (tester) async {
    await NearbyHistoryStore().save(
      const NearbyResult(stores: [_rosebank]),
      DateTime.parse('2026-07-16T10:00:00.000Z'),
    );

    await tester.pumpWidget(_wrap(NearMeScreen(
      api: _CatalogueApi(),
      historyStore: NearbyHistoryStore(),
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.text('VIEW'));
    await tester.pumpAndSettle();

    expect(find.text('View on map'), findsOneWidget);
    await tester.tap(find.text('View on map'));
    await tester.pumpAndSettle();

    expect(find.byType(StoreMapView), findsOneWidget);
    expect(find.text('Preview route'), findsOneWidget);
    expect(find.text('Navigate'), findsOneWidget);
  });

  testWidgets('Near Me explains disabled location and opens device settings',
      (tester) async {
    var openedSettings = false;
    await tester.pumpWidget(_wrap(NearMeScreen(
      api: _CatalogueApi(),
      historyStore: NearbyHistoryStore(),
      isLocationServiceEnabled: () async => false,
      openDeviceLocationSettings: () async {
        openedSettings = true;
        return true;
      },
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Use my location'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Device location is off'), findsOneWidget);
    await tester.tap(find.text('Open location settings'));
    await tester.pump();
    expect(openedSettings, isTrue);
  });

  testWidgets(
      'admin country testing uses the selected capital instead of device GPS',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'ts_admin_country_override_v1': 'ZW',
    });
    final requests = <Uri>[];
    final api = Api(
      client: MockClient((request) async {
        requests.add(request.url);
        final data = switch (request.url.path) {
          '/api/country' => {
              'country': {
                'capital': 'Harare',
                'code': 'ZW',
                'currencyCode': 'ZWG',
                'flag': 'ZW',
                'name': 'Zimbabwe',
                'rateFromZar': 1,
              },
            },
          '/api/geocode' => {
              'match': {
                'formatted': 'Harare, Zimbabwe',
                'lat': -17.8252,
                'lon': 31.0335,
              },
            },
          '/api/nearby-stores' => {
              'country': {
                'capital': 'Harare',
                'code': 'ZW',
                'currencyCode': 'ZWG',
                'flag': 'ZW',
                'name': 'Zimbabwe',
              },
              'stores': [
                {
                  'countryCode': 'ZW',
                  'countryName': 'Zimbabwe',
                  'lat': -17.8252,
                  'lon': 31.0335,
                  'name': 'OK Zimbabwe Harare',
                  'placeId': 'ok-harare',
                },
              ],
            },
          _ => {'ads': <dynamic>[]},
        };
        return http.Response(
          jsonEncode({'data': data}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
      useBrowserCookies: true,
      baseUrl: 'https://example.test',
    );
    await api.country();
    var deviceLocationReads = 0;

    await tester.pumpWidget(_wrap(NearMeScreen(
      api: api,
      historyStore: NearbyHistoryStore(),
      isLocationServiceEnabled: () async => true,
      checkLocationPermission: () async => LocationPermission.always,
      readCurrentPosition: () async {
        deviceLocationReads += 1;
        throw StateError('Device GPS must not be read in admin test mode.');
      },
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Use my location'));
    await tester.pumpAndSettle();

    final nearbyRequest =
        requests.lastWhere((request) => request.path == '/api/nearby-stores');
    expect(deviceLocationReads, 0);
    expect(nearbyRequest.queryParameters['lat'], '-17.8252');
    expect(nearbyRequest.queryParameters['lon'], '31.0335');
    expect(find.text('OK Zimbabwe Harare'), findsOneWidget);
  });

  testWidgets('Near Me hides history and saved addresses from other countries',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'ts_admin_country_override_v1': 'ZW',
      'saved_addresses_v1': jsonEncode([
        {
          'countryCode': 'ZA',
          'createdAt': '2026-07-20T10:00:00.000Z',
          'id': 'sandton',
          'label': 'Sandton home',
          'lat': -26.1076,
          'lon': 28.0567,
        },
        {
          'countryCode': 'ZW',
          'createdAt': '2026-07-20T11:00:00.000Z',
          'id': 'harare',
          'label': 'Harare home',
          'lat': -17.8252,
          'lon': 31.0335,
        },
      ]),
    });
    final history = NearbyHistoryStore();
    await history.save(
      const NearbyResult(
        country: CountryOption(
          code: 'ZA',
          currencyCode: 'ZAR',
          flag: 'ZA',
          name: 'South Africa',
        ),
        stores: [_rosebank],
      ),
      DateTime.parse('2026-07-20T09:00:00.000Z'),
    );
    final api = Api(
      client: MockClient((request) async {
        final data = request.url.path == '/api/country'
            ? {
                'country': {
                  'capital': 'Harare',
                  'code': 'ZW',
                  'currencyCode': 'ZWG',
                  'flag': 'ZW',
                  'name': 'Zimbabwe',
                  'rateFromZar': 1,
                },
              }
            : {'ads': <dynamic>[]};
        return http.Response(
          jsonEncode({'data': data}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
      useBrowserCookies: true,
      baseUrl: 'https://example.test',
    );
    await api.country();

    await tester.pumpWidget(_wrap(NearMeScreen(
      api: api,
      historyStore: history,
    )));
    await tester.pumpAndSettle();

    expect(find.text('Pick n Pay Rosebank'), findsNothing);
    expect(find.text('Sandton home'), findsNothing);
    expect(find.text('Harare home'), findsOneWidget);
  });

  testWidgets('Stores renders one chain card and keeps branches separate',
      (tester) async {
    final api = _CatalogueApi();
    await tester.pumpWidget(_wrap(
      StoresScreen(api: api, isAuthenticated: false),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Pick n Pay'), findsOneWidget);
    expect(find.text('2 locations'), findsOneWidget);
    expect(find.text('0 deals · 1 catalogue'), findsOneWidget);
    expect(find.text('Pick n Pay Rosebank'), findsNothing);
    expect(find.text('PnP Sandton'), findsNothing);

    await tester.tap(find.text('Enter store'));
    await tester.pumpAndSettle();

    expect(find.text('Pick n Pay Rosebank'), findsOneWidget);
    expect(find.text('PnP Sandton'), findsOneWidget);
    expect(find.text('10 Main Road, Rosebank'), findsOneWidget);
    expect(find.text('20 High Street, Sandton'), findsOneWidget);
    expect(find.text('Browse current brand offers'), findsOneWidget);
    expect(find.text('Open for branch-specific offers'), findsNWidgets(2));
    expect(find.text('Milk 2L'), findsNothing);
    expect(find.text('R20.00'), findsNothing);

    await tester.tap(find.text('Pick n Pay Rosebank'));
    await tester.pumpAndSettle();

    expect(api.detailCalls, 1);
    expect(find.text('Milk 2L'), findsOneWidget);
    expect(find.text('R20.00'), findsOneWidget);
    expect(find.text('Buy 2 for R35'), findsOneWidget);
    expect(find.text('Valid until 2026-08-09'), findsOneWidget);
    expect(find.text('Open official website'), findsOneWidget);
  });

  testWidgets('branch modal reads its catalogue without leaving the app',
      (tester) async {
    await tester.pumpWidget(_wrap(
      StoresScreen(api: _CatalogueApi(), isAuthenticated: false),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enter store'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Pick n Pay Rosebank'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Rosebank weekly'));
    await tester.pumpAndSettle();

    expect(find.byType(CatalogueReader), findsOneWidget);
    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(
      tester
          .widget<CatalogueReader>(find.byType(CatalogueReader))
          .deals
          .map((deal) => deal.title),
      contains('Milk 2L'),
    );
  });

  testWidgets('store search finds a chain beyond the first directory page',
      (tester) async {
    await tester.pumpWidget(_wrap(
      StoresScreen(api: _PagedStoreApi(), isAuthenticated: false),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Boxer');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();

    expect(find.text('Boxer'), findsOneWidget);
    expect(find.text('1 deal · 0 catalogues'), findsOneWidget);
  });
}

DealsScreen _deals(Api api) => DealsScreen(
      api: api,
      cacheStore: _MemoryDiscoveryCache(),
    );

class _MemoryDiscoveryCache extends DiscoveryCache {
  @override
  Future<CachedDiscovery?> load([
    String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async =>
      null;

  @override
  Future<void> save(
    DiscoveryResult result,
    DateTime fetchedAt, [
    String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async {}
}

Widget _wrap(Widget child) => MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(body: child),
    );

void _useTallPhoneViewport(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 2200);
  addTearDown(() {
    tester.view.resetDevicePixelRatio();
    tester.view.resetPhysicalSize();
  });
}

class _CatalogueApi extends Api {
  _CatalogueApi() : super(baseUrl: 'https://example.test');

  int detailCalls = 0;

  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [],
        foundDealCount: 0,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 1,
        catalogues: [_winterCatalogue],
      );

  @override
  Future<RetailerCatalog> retailers(
          {String query = '',
          String kind = 'all',
          bool summary = false}) async =>
      const RetailerCatalog(retailers: [], sourceKinds: []);

  @override
  Future<DiscoveredStoresResult> discoveredStores({
    bool summary = false,
    int? limit,
    int offset = 0,
    String query = '',
    bool includeDetails = true,
    String? placeId,
    double? lat,
    double? lon,
  }) async {
    if (placeId != null) {
      detailCalls += 1;
      return DiscoveredStoresResult(
        stores: [placeId == _rosebank.placeId ? _rosebank : _sandton],
        storeCount: 2,
        areaCount: 2,
        knownChainCount: 2,
        withPromotionsCount: 2,
      );
    }
    return const DiscoveredStoresResult(
      stores: [_rosebankSummary, _sandtonSummary],
      storeCount: 2,
      areaCount: 2,
      knownChainCount: 2,
      withPromotionsCount: 2,
    );
  }
}

class _CatalogueDirectoryApi extends _CatalogueApi {
  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [],
        foundDealCount: 0,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 5,
        catalogues: _directoryCatalogues,
      );
}

class _PagedStoreApi extends _CatalogueApi {
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

  @override
  Future<DiscoveredStoresResult> discoveredStores({
    bool summary = false,
    int? limit,
    int offset = 0,
    String query = '',
    bool includeDetails = true,
    String? placeId,
    double? lat,
    double? lon,
  }) async =>
      DiscoveredStoresResult(
        stores: query.toLowerCase().contains('boxer')
            ? const [_boxerSummary]
            : const [_rosebankSummary],
        storeCount: 120,
        areaCount: 2,
        knownChainCount: 2,
        withPromotionsCount: 1,
        hasMore: true,
        limit: limit ?? 60,
        offset: offset,
      );
}

const _winterCatalogue = Catalogue(
  name: 'Winter savings',
  url: 'https://catalogues.example.test/winter',
  retailerName: 'Pick n Pay',
  pages: _cataloguePages,
);

const _boxerDeal = Deal(
  id: 'boxer-rice',
  retailerId: 'boxer',
  retailerName: 'Boxer',
  title: 'Rice 10 kg',
  priceText: 'R129.99',
);

const _rosebankCatalogue = Catalogue(
  name: 'Rosebank weekly',
  url: 'https://catalogues.example.test/rosebank',
  retailerName: 'Pick n Pay Rosebank',
  pages: _cataloguePages,
);

const _cataloguePages = [
  CataloguePage(
    pageNumber: 1,
    imageUrl: 'https://cdn.example.test/page-1.webp',
    fallbacks: ['https://cdn.example.test/page-1.jpg'],
  ),
  CataloguePage(
    pageNumber: 2,
    imageUrl: 'https://cdn.example.test/page-2.webp',
    fallbacks: ['https://cdn.example.test/page-2.jpg'],
  ),
];

const _directoryCatalogues = [
  Catalogue(
    id: 'future-preview',
    retailerId: 'future',
    name: 'Future preview',
    url: 'https://catalogues.example.test/future',
    retailerName: 'Future Store',
    validFrom: '2099-08-05',
    validTo: '2099-08-18',
  ),
  Catalogue(
    id: 'zulu-weekly',
    retailerId: 'zulu',
    name: 'Zulu weekly',
    url: 'https://catalogues.example.test/zulu',
    retailerName: 'Zulu Store',
    validFrom: '2026-07-27',
  ),
  Catalogue(
    id: 'bravo-month-end',
    retailerId: 'bravo',
    name: 'Bravo month-end',
    url: 'https://catalogues.example.test/bravo',
    retailerName: 'Bravo Shop',
    validFrom: '2026-07-26',
  ),
  Catalogue(
    id: 'alpha-weekly',
    retailerId: 'alpha',
    name: 'Alpha weekly',
    url: 'https://catalogues.example.test/alpha-weekly',
    retailerName: 'Alpha Market',
    validFrom: '2026-07-25',
  ),
  Catalogue(
    id: 'alpha-home-event',
    retailerId: 'alpha',
    name: 'Alpha home event',
    url: 'https://catalogues.example.test/alpha-home',
    retailerName: 'Alpha Market',
    validFrom: '2026-07-24',
  ),
];

const _rosebank = NearbyStore(
  placeId: 'pnp-rosebank',
  name: 'Pick n Pay Rosebank',
  address: '10 Main Road, Rosebank',
  website: 'https://www.pnp.co.za/store/rosebank',
  retailerId: 'pick-n-pay',
  lat: -26.1466,
  lon: 28.0419,
  logoUrl: 'https://cdn.example.test/pnp.png',
  promotionCount: 2,
  deals: [
    Deal(
      title: 'Milk 2L',
      retailerName: 'Pick n Pay Rosebank',
      priceText: 'R20.00',
      savingText: 'Buy 2 for R35',
      validTo: '2026-08-09',
    ),
  ],
  catalogues: [_rosebankCatalogue],
);

const _rosebankSummary = NearbyStore(
  placeId: 'pnp-rosebank',
  name: 'Pick n Pay Rosebank',
  address: '10 Main Road, Rosebank',
  retailerId: 'pick-n-pay',
  logoUrl: 'https://cdn.example.test/pnp.png',
  promotionCount: 2,
  detailsLoaded: false,
);

const _sandton = NearbyStore(
  placeId: 'pnp-sandton',
  name: 'PnP Sandton',
  address: '20 High Street, Sandton',
  retailerId: 'pick-n-pay',
  logoUrl: 'https://cdn.example.test/pnp.png',
  promotionCount: 1,
  deals: [
    Deal(
      title: 'Milk 2L',
      retailerName: 'PnP Sandton',
      priceText: 'R23.00',
    ),
  ],
);

const _sandtonSummary = NearbyStore(
  placeId: 'pnp-sandton',
  name: 'PnP Sandton',
  address: '20 High Street, Sandton',
  retailerId: 'pick-n-pay',
  logoUrl: 'https://cdn.example.test/pnp.png',
  promotionCount: 1,
  detailsLoaded: false,
);

const _boxerSummary = NearbyStore(
  placeId: 'boxer-jhb',
  name: 'Boxer Johannesburg',
  address: '1 Main Street, Johannesburg',
  retailerId: 'boxer',
  promotionCount: 0,
  detailsLoaded: false,
);
