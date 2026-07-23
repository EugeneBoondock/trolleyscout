import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/nearby_history_store.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/screens/near_me_screen.dart';
import 'package:trolley_scout/screens/stores_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/catalogue_reader.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('Deals opens catalogue pages inside Trolley Scout',
      (tester) async {
    await tester.pumpWidget(_wrap(DealsScreen(api: _CatalogueApi())));
    await tester.pumpAndSettle();

    expect(find.text('Overview'), findsNothing);
    expect(find.text('Advanced filters'), findsOneWidget);
    expect(find.text('All retailers'), findsNothing);

    await tester.tap(find.text('Advanced filters'));
    await tester.pumpAndSettle();
    expect(find.text('All retailers'), findsOneWidget);
    expect(find.text('All sources'), findsOneWidget);
    expect(find.text('Has image'), findsOneWidget);
    expect(find.text('Shows savings'), findsOneWidget);

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
    expect(find.text('Pick n Pay Rosebank'), findsNothing);
    expect(find.text('PnP Sandton'), findsNothing);

    await tester.tap(find.text('View 2 locations'));
    await tester.pumpAndSettle();

    expect(find.text('Pick n Pay Rosebank'), findsOneWidget);
    expect(find.text('PnP Sandton'), findsOneWidget);
    expect(find.text('10 Main Road, Rosebank'), findsOneWidget);
    expect(find.text('20 High Street, Sandton'), findsOneWidget);
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
    await tester.tap(find.text('View 2 locations'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Pick n Pay Rosebank'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Rosebank weekly'));
    await tester.pumpAndSettle();

    expect(find.byType(CatalogueReader), findsOneWidget);
    expect(find.text('Page 1 of 2'), findsOneWidget);
  });
}

Widget _wrap(Widget child) => MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(body: child),
    );

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

const _winterCatalogue = Catalogue(
  name: 'Winter savings',
  url: 'https://catalogues.example.test/winter',
  retailerName: 'Pick n Pay',
  pages: _cataloguePages,
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

const _rosebank = NearbyStore(
  placeId: 'pnp-rosebank',
  name: 'Pick n Pay Rosebank',
  address: '10 Main Road, Rosebank',
  website: 'https://www.pnp.co.za/store/rosebank',
  retailerId: 'pick-n-pay',
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
