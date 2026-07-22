import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
    await tester.tap(find.text('Rosebank weekly'));
    await tester.pumpAndSettle();

    expect(find.byType(CatalogueReader), findsOneWidget);
    expect(find.text('Page 1 of 2'), findsOneWidget);
  });

  testWidgets('Stores renders one chain card and keeps branches separate',
      (tester) async {
    await tester.pumpWidget(_wrap(
      StoresScreen(api: _CatalogueApi(), isAuthenticated: false),
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

    expect(find.text('Milk 2L'), findsOneWidget);
    expect(find.text('R20.00'), findsOneWidget);
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
          {String query = '', String kind = 'all'}) async =>
      const RetailerCatalog(retailers: [], sourceKinds: []);

  @override
  Future<DiscoveredStoresResult> discoveredStores() async =>
      const DiscoveredStoresResult(
        stores: [_rosebank, _sandton],
        storeCount: 2,
        areaCount: 2,
        knownChainCount: 2,
        withPromotionsCount: 2,
      );
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
  retailerId: 'pick-n-pay',
  logoUrl: 'https://cdn.example.test/pnp.png',
  promotionCount: 2,
  deals: [
    Deal(
      title: 'Milk 2L',
      retailerName: 'Pick n Pay Rosebank',
      priceText: 'R20.00',
    ),
  ],
  catalogues: [_rosebankCatalogue],
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
