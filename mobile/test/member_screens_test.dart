import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/app_controller.dart';
import 'package:trolley_scout/screens/about_screen.dart';
import 'package:trolley_scout/screens/admin_screen.dart';
import 'package:trolley_scout/screens/basket_screen.dart';
import 'package:trolley_scout/screens/dashboard_screen.dart';
import 'package:trolley_scout/screens/offers_screen.dart';
import 'package:trolley_scout/screens/profile_screen.dart';
import 'package:trolley_scout/screens/rules_screen.dart';
import 'package:trolley_scout/screens/saved_deals_screen.dart';
import 'package:trolley_scout/screens/saved_sources_screen.dart';
import 'package:trolley_scout/screens/scanner_screen.dart';
import 'package:trolley_scout/screens/stores_screen.dart';
import 'package:trolley_scout/screens/subscription_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  testWidgets('dashboard renders live member counts and basket total',
      (tester) async {
    final api = _FeatureApi();
    await tester.pumpWidget(_wrap(DashboardScreen(
      api: api,
      session: _memberSession,
      onNavigate: (_) {},
    )));
    await tester.pumpAndSettle();

    expect(find.text('Member dashboard'), findsOneWidget);
    expect(find.text('1 saved deal'), findsOneWidget);
    expect(find.text('R123.45'), findsOneWidget);
  });

  testWidgets('stores can save an official source', (tester) async {
    final api = _FeatureApi();
    await tester
        .pumpWidget(_wrap(StoresScreen(api: api, isAuthenticated: true)));
    await tester.pumpAndSettle();

    expect(find.text('Example Market'), findsOneWidget);
    final saveButton = find.widgetWithText(OutlinedButton, 'Save');
    tester.widget<OutlinedButton>(saveButton).onPressed!();
    await tester.pumpAndSettle();

    expect(api.savedSourceCalls, 1);
    expect(find.text('Saved'), findsOneWidget);
  });

  testWidgets('stores and dashboard use the permanent discovered directory',
      (tester) async {
    final api = _FeatureApi();
    await tester
        .pumpWidget(_wrap(StoresScreen(api: api, isAuthenticated: true)));
    await tester.pumpAndSettle();

    expect(find.text('Stores found near shoppers'), findsOneWidget);
    expect(find.text('Rosebank Local Market'), findsOneWidget);

    await tester.pumpWidget(_wrap(DashboardScreen(
      api: api,
      session: _memberSession,
      onNavigate: (_) {},
    )));
    await tester.pumpAndSettle();

    expect(find.text('2'), findsWidgets);
    expect(find.text('covered stores'), findsOneWidget);
  });

  testWidgets('saved deals can be removed', (tester) async {
    final api = _FeatureApi();
    await tester.pumpWidget(_wrap(SavedDealsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Example maize meal'), findsOneWidget);
    await tester.tap(find.byTooltip('Remove saved deal'));
    await tester.pumpAndSettle();

    expect(api.deletedDealCalls, 1);
    expect(find.text('No saved deals yet.'), findsOneWidget);
  });

  testWidgets('basket quantity can be increased', (tester) async {
    final api = _FeatureApi();
    await tester.pumpWidget(_wrap(BasketScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Increase quantity'));
    await tester.pumpAndSettle();

    expect(api.updatedBasketQuantity, 2);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('remaining parity screens render their real content',
      (tester) async {
    final api = _FeatureApi();
    final controller = AppController(api)
      ..restoring = false
      ..session = _memberSession;
    final screens = <Widget, String>{
      SavedSourcesScreen(api: api): 'Saved sources',
      OffersScreen(api: api, canDelete: false): 'Verified offers',
      ScannerScreen(api: api): 'Offer scanner',
      SubscriptionScreen(api: api): 'Choose your plan',
      ProfileScreen(controller: controller): 'Your profile',
      AboutScreen(onNavigate: (_) {}): 'How Trolley Scout helps',
      const RulesScreen(): 'Data rules',
      AdminScreen(api: api): 'Admin console',
    };

    for (final entry in screens.entries) {
      await tester.pumpWidget(_wrap(entry.key));
      await tester.pumpAndSettle();
      expect(find.text(entry.value), findsOneWidget,
          reason: '${entry.value} must render');
    }
  });

  testWidgets('admin console can trigger the protected deal refresh',
      (tester) async {
    final api = _FeatureApi();
    await tester.pumpWidget(_wrap(AdminScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(
        find.widgetWithText(FilledButton, 'Refresh deal sources'));
    await tester.pumpAndSettle();

    expect(api.dealRefreshCalls, 1);
    expect(find.text('Deal sources refreshed.'), findsOneWidget);
  });
}

Widget _wrap(Widget child) =>
    MaterialApp(theme: TS.theme(), home: Scaffold(body: child));

class _FeatureApi extends Api {
  _FeatureApi() : super(baseUrl: 'https://example.test');

  int savedSourceCalls = 0;
  int deletedDealCalls = 0;
  int dealRefreshCalls = 0;
  int? updatedBasketQuantity;
  var _savedDeals = <SavedDeal>[_savedDeal];
  var _basket = _exampleBasket;

  @override
  Future<DiscoveryResult> discovery({bool forceLive = false}) async =>
      const DiscoveryResult(
        deals: [_deal],
        foundDealCount: 1,
        checkedSourceCount: 3,
        unavailableSourceCount: 0,
        leafletCount: 2,
      );

  @override
  Future<RetailerCatalog> retailers(
          {String query = '', String kind = 'all'}) async =>
      const RetailerCatalog(retailers: [_retailer], sourceKinds: ['specials']);

  @override
  Future<DiscoveredStoresResult> discoveredStores() async =>
      const DiscoveredStoresResult(
        stores: [_discoveredStore],
        storeCount: 1,
        areaCount: 1,
        knownChainCount: 0,
        withPromotionsCount: 1,
      );

  @override
  Future<List<SavedDeal>> savedDeals() async => _savedDeals;

  @override
  Future<List<SavedDeal>> deleteSavedDeal(String id) async {
    deletedDealCalls += 1;
    _savedDeals = [];
    return _savedDeals;
  }

  @override
  Future<List<SavedSource>> savedSources() async => const [_savedSource];

  @override
  Future<List<SavedSource>> saveSource(
      String retailerId, String sourceUrl) async {
    savedSourceCalls += 1;
    return const [_savedSource];
  }

  @override
  Future<Basket> basket() async => _basket;

  @override
  Future<Basket> updateBasketItem(String id, int quantity) async {
    updatedBasketQuantity = quantity;
    _basket = Basket(
      items: [
        BasketItem(
            id: 'basket-1',
            savedDealId: 'saved-1',
            quantity: quantity,
            deal: _savedDeal)
      ],
      summary: const BasketSummary(
        itemCount: 2,
        knownPriceItemCount: 2,
        totalCents: 24690,
        savingsCents: 2000,
      ),
    );
    return _basket;
  }

  @override
  Future<List<VerifiedOffer>> offers() async => const [_offer];

  @override
  Future<SubscriptionData> subscription() async => const SubscriptionData(
        billingReady: true,
        plans: [_freePlan],
        account: _memberAccount,
      );

  @override
  Future<AdminOverview> adminOverview() async => const AdminOverview(
        accounts: [_memberAccount],
        accountCount: 1,
        planCounts: {'free': 1},
        dealCount: 12,
        leafletCount: 3,
        sourceCount: 6,
      );

  @override
  Future<void> refreshDealSources() async {
    dealRefreshCalls += 1;
  }
}

const _memberAccount = MemberAccount(
  id: 'member-1',
  email: 'sam@example.com',
  displayName: 'Sam Shopper',
  initials: 'SS',
  planId: 'free',
  planName: 'Free',
  planStatus: 'active',
  role: 'member',
  propertiesAccess: false,
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
);

const _memberSession =
    MemberSession(isAuthenticated: true, account: _memberAccount);

const _deal = Deal(
  id: 'deal-1',
  retailerId: 'pick-n-pay',
  retailerName: 'Example Market',
  sourceLabel: 'Weekly specials',
  sourceUrl: 'https://example.test/specials',
  productUrl: 'https://example.test/maize',
  title: 'Example maize meal',
  capturedAt: '2026-07-15T10:00:00.000Z',
  evidenceText: 'Example maize meal R123.45',
  priceText: 'R123.45',
  previousPriceText: 'R133.45',
  savingText: 'Save R10',
);

const _savedDeal = SavedDeal(
  id: 'saved-1',
  retailerId: 'pick-n-pay',
  retailerName: 'Example Market',
  sourceLabel: 'Weekly specials',
  sourceUrl: 'https://example.test/specials',
  productUrl: 'https://example.test/maize',
  title: 'Example maize meal',
  capturedAt: '2026-07-15T10:00:00.000Z',
  evidenceText: 'Example maize meal R123.45',
  priceText: 'R123.45',
  savedAt: '2026-07-15T10:00:00.000Z',
);

const _savedSource = SavedSource(
  id: 'source-1',
  createdAt: '2026-07-15T10:00:00.000Z',
  retailerId: 'pick-n-pay',
  retailerName: 'Example Market',
  sourceLabel: 'Weekly specials',
  sourceKind: 'specials',
  sourceUrl: 'https://example.test/specials',
);

const _retailer = Retailer(
  id: 'pick-n-pay',
  name: 'Example Market',
  shortName: 'Example',
  group: 'Supermarket',
  program: 'Example rewards',
  sourceNote: 'Official weekly specials.',
  verifiedOn: '2026-07-15',
  accentColor: '#0d6b3d',
  sources: [
    RetailerSource(
      label: 'Weekly specials',
      url: 'https://example.test/specials',
      kind: 'specials',
    ),
  ],
);

const _discoveredStore = NearbyStore(
  placeId: 'rosebank-local',
  name: 'Rosebank Local Market',
  address: '10 Main Road, Rosebank',
  lat: -26.14,
  lon: 28.04,
  firstSeenAt: '2026-07-01T10:00:00.000Z',
  lastSeenAt: '2026-07-16T10:00:00.000Z',
  logoUrl: 'https://example.test/favicon.ico',
  promotionCount: 2,
);

const _exampleBasket = Basket(
  items: [
    BasketItem(
        id: 'basket-1', savedDealId: 'saved-1', quantity: 1, deal: _savedDeal)
  ],
  summary: BasketSummary(
    itemCount: 1,
    knownPriceItemCount: 1,
    totalCents: 12345,
    savingsCents: 1000,
  ),
);

const _offer = VerifiedOffer(
  id: 'offer-1',
  retailerId: 'pick-n-pay',
  title: 'Example maize meal',
  sourceUrl: 'https://example.test/specials',
  capturedAt: '2026-07-15T10:00:00.000Z',
  priceText: 'R123.45',
);

const _freePlan = MemberPlan(
  id: 'free',
  name: 'Free',
  description: 'Everything a household needs to stretch the month.',
  badge: 'Included',
  isPaid: false,
  statusText: 'Active now',
  features: ['10 saved deals'],
  monthlyCents: 0,
  annualCents: 0,
);
