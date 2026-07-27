import 'package:flutter/material.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CataloguePreviewApp());
}

class CataloguePreviewApp extends StatelessWidget {
  const CataloguePreviewApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: TS.lightTheme(),
        darkTheme: TS.darkTheme(),
        themeMode: ThemeMode.system,
        home: Scaffold(
          body: SafeArea(
            child: DealsScreen(
              api: _CataloguePreviewApi(),
              initialCatalogueId: 'open-catalogue-tab-only',
            ),
          ),
        ),
      );
}

class _CataloguePreviewApi extends Api {
  _CataloguePreviewApi() : super(baseUrl: 'https://example.test');

  @override
  Future<DiscoveryResult> discovery({
    bool forceLive = false,
    bool summary = false,
  }) async =>
      const DiscoveryResult(
        deals: [],
        foundDealCount: 0,
        checkedSourceCount: 4,
        unavailableSourceCount: 0,
        leafletCount: 5,
        catalogues: _catalogues,
      );

  @override
  Future<RetailerCatalog> retailers({
    String query = '',
    String kind = 'all',
    bool summary = false,
  }) async =>
      const RetailerCatalog(retailers: [], sourceKinds: []);

  @override
  Future<List<PublicAd>> publicAds(String placement) async => const [];

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async =>
      const [];
}

const _catalogues = [
  Catalogue(
    id: 'africa-cash-123421',
    retailerId: 'africa-cash-and-carry',
    retailerName: 'Africa Cash & Carry',
    name: 'Africa Cash & Carry Saturday Promo',
    url: 'https://www.latestspecials.co.za/',
    imageUrl:
        'https://eu.leafletscdn.com/thumbor/ZrWlGQqus-xaMD7RJNcam1QPzaA=/full-fit-in/240x240/filters:format(webp):quality(65)/co.za/data/284/123421/0.jpg?t=1784910543',
    validFrom: '2026-07-25',
    validTo: '2026-07-31',
    pages: [
      CataloguePage(
        pageNumber: 1,
        imageUrl:
            'https://eu.leafletscdn.com/thumbor/ZrWlGQqus-xaMD7RJNcam1QPzaA=/full-fit-in/240x240/filters:format(webp):quality(65)/co.za/data/284/123421/0.jpg?t=1784910543',
      ),
    ],
  ),
  Catalogue(
    id: 'boxer-123196',
    retailerId: 'boxer',
    retailerName: 'Boxer',
    name: 'Boxer weekly specials',
    url: 'https://www.latestspecials.co.za/',
    imageUrl:
        'https://eu.leafletscdn.com/thumbor/aNWBDSzysYUlg5Je6X4vKHxruaI=/0x0/filters:format(webp):quality(65)/co.za/data/108/123196/0.jpg?t=1784780031',
    validFrom: '2026-07-23',
    validTo: '2026-08-10',
    pages: [
      CataloguePage(
        pageNumber: 1,
        imageUrl:
            'https://eu.leafletscdn.com/thumbor/aNWBDSzysYUlg5Je6X4vKHxruaI=/0x0/filters:format(webp):quality(65)/co.za/data/108/123196/0.jpg?t=1784780031',
      ),
    ],
  ),
  Catalogue(
    id: 'food-lovers-123466',
    retailerId: 'food-lovers',
    retailerName: 'Food Lover’s Market',
    name: 'Food Lover’s Market Biltong Monday',
    url: 'https://www.latestspecials.co.za/',
    imageUrl:
        'https://eu.leafletscdn.com/thumbor/lwTETSqYBRAKGhKFL27_nM2XS6c=/full-fit-in/240x240/filters:format(webp):quality(65)/co.za/data/106/123466/0.jpg?t=1785081785',
    validFrom: '2026-07-27',
    validTo: '2026-07-27',
    pages: [
      CataloguePage(
        pageNumber: 1,
        imageUrl:
            'https://eu.leafletscdn.com/thumbor/lwTETSqYBRAKGhKFL27_nM2XS6c=/full-fit-in/240x240/filters:format(webp):quality(65)/co.za/data/106/123466/0.jpg?t=1785081785',
      ),
    ],
  ),
  Catalogue(
    id: 'pick-n-pay-123493',
    retailerId: 'pick-n-pay',
    retailerName: 'Pick n Pay',
    name: 'Pick n Pay weekly specials',
    url: 'https://www.latestspecials.co.za/',
    imageUrl:
        'https://eu.leafletscdn.com/thumbor/RRSdQxTKjoqMBjB80wFryx5wdkk=/0x0/filters:format(webp):quality(65)/co.za/data/101/123493/0.jpg?t=1785124135',
    validFrom: '2026-07-27',
    validTo: '2026-08-02',
    pages: [
      CataloguePage(
        pageNumber: 1,
        imageUrl:
            'https://eu.leafletscdn.com/thumbor/RRSdQxTKjoqMBjB80wFryx5wdkk=/0x0/filters:format(webp):quality(65)/co.za/data/101/123493/0.jpg?t=1785124135',
        width: 1550,
        height: 2038,
      ),
      CataloguePage(
        pageNumber: 2,
        imageUrl:
            'https://eu.leafletscdn.com/thumbor/XR1Dy4_6FDhGYoco7XpB7ijkbaU=/0x0/filters:format(webp):quality(65)/co.za/data/101/123493/1.jpg?t=1785124135',
        width: 1550,
        height: 2038,
      ),
      CataloguePage(
        pageNumber: 3,
        imageUrl:
            'https://eu.leafletscdn.com/thumbor/PeeHLoldmRIItlmyRdVU_NSJdNg=/0x0/filters:format(webp):quality(65)/co.za/data/101/123493/2.jpg?t=1785124135',
        width: 1550,
        height: 2038,
      ),
    ],
  ),
  Catalogue(
    id: 'saverite-123478',
    retailerId: 'saverite',
    retailerName: 'Saverite',
    name: 'Saverite weekly specials',
    url: 'https://www.latestspecials.co.za/',
    imageUrl:
        'https://eu.leafletscdn.com/thumbor/uAf4Gap87DlyGOMzE7VrBtjfaeQ=/0x0/filters:format(webp):quality(65)/co.za/data/261/123478/0.jpg?t=1785090311',
    validFrom: '2026-07-27',
    validTo: '2026-08-02',
    pages: [
      CataloguePage(
        pageNumber: 1,
        imageUrl:
            'https://eu.leafletscdn.com/thumbor/uAf4Gap87DlyGOMzE7VrBtjfaeQ=/0x0/filters:format(webp):quality(65)/co.za/data/261/123478/0.jpg?t=1785090311',
      ),
    ],
  ),
];
