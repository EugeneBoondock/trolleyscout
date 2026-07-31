import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/dashboard_screen.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('dashboard saved-deal artwork stays clipped inside its card',
      (tester) async {
    await _usePhoneViewport(tester);
    final api = _LayoutApi();

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DashboardScreen(
          api: api,
          session: _memberSession,
          onNavigate: (_) {},
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -420));
    await tester.pumpAndSettle();

    final cardFinder = find.byKey(const Key('saved-deal-card-saved-tv'));
    expect(cardFinder, findsOneWidget);
    final card = tester.widget<Container>(cardFinder);
    expect(card.clipBehavior, Clip.antiAlias);
  });

  testWidgets('deal finder keeps long deal cards and actions compact',
      (tester) async {
    await _usePhoneViewport(tester);
    final api = _LayoutApi();

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(api: api, isAuthenticated: true),
      ),
    ));
    await tester.pumpAndSettle();

    final cardFinder = find.byKey(const Key('deal-card-long-deal'));
    final actionsFinder = find.byKey(const Key('deal-actions-long-deal'));
    expect(cardFinder, findsOneWidget);
    expect(actionsFinder, findsOneWidget);

    final title = tester.widget<Text>(find.text(_longTitle));
    expect(title.maxLines, 3);
    expect(tester.getSize(actionsFinder).height, lessThanOrEqualTo(52));
    expect(tester.getSize(cardFinder).height, lessThanOrEqualTo(280));
  });

  testWidgets('Marketplace labels a Bob Shop auction amount as a current bid',
      (tester) async {
    await _usePhoneViewport(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(api: _BidLayoutApi(), isAuthenticated: true),
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('deal-price-qualifier-bobshop-bid')),
      findsOneWidget,
    );
    expect(find.text('Current bid'), findsOneWidget);
  });

  testWidgets('Marketplace can hide sold-out deals', (tester) async {
    await _usePhoneViewport(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: _AvailabilityLayoutApi(),
          isAuthenticated: true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('deal-card-sold-out')), findsOneWidget);
    await tester.tap(find.byKey(const Key('visibility-filter-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hide-sold-out-filter')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('deal-card-sold-out')), findsNothing);
    expect(find.byKey(const Key('deal-card-available')), findsOneWidget);
  });

  testWidgets('Filters button stays put when a filter is turned on',
      (tester) async {
    // The label used to gain a count ("Filters · 1"), which widened the button
    // and slid it sideways out from under the thumb that had just tapped it.
    await _usePhoneViewport(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(api: _AvailabilityLayoutApi(), isAuthenticated: true),
      ),
    ));
    await tester.pumpAndSettle();

    final menu = find.byKey(const Key('visibility-filter-menu'));
    final before = tester.getRect(menu);

    await tester.tap(menu);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hide-sold-out-filter')));
    await tester.pumpAndSettle();

    expect(tester.getRect(menu), before,
        reason: 'the Filters control must not move or resize when a filter is on');
    expect(find.text('Filters'), findsOneWidget);
  });

  testWidgets('Marketplace hides auction listings on request', (tester) async {
    await _usePhoneViewport(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: _BidLayoutApi(),
          isAuthenticated: true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('deal-card-bobshop-bid')), findsOneWidget);
    await tester.tap(find.byKey(const Key('visibility-filter-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hide-bids-filter')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('deal-card-bobshop-bid')), findsNothing);
    expect(find.byKey(const Key('deal-card-plain-camera')), findsOneWidget);
  });

  testWidgets('Filters menu stays usable in dark mode on a phone',
      (tester) async {
    await _usePhoneViewport(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: ThemeMode.dark,
      home: Scaffold(
        body: DealsScreen(
          api: _RecentLayoutApi(),
          isAuthenticated: true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    final menu = find.byKey(const Key('visibility-filter-menu'));
    expect(menu, findsOneWidget);
    expect(Theme.of(tester.element(menu)).brightness, Brightness.dark);
    await tester.tap(menu);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hide-sold-out-filter')), findsOneWidget);
    expect(find.byKey(const Key('hide-bids-filter')), findsOneWidget);
  });

  testWidgets('Marketplace explains a reached Free viewing allowance',
      (tester) async {
    await _usePhoneViewport(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: _LimitedLayoutApi(),
          isAuthenticated: true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('marketplace-access-limit')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Free plan: up to 2,000 deals and 50 catalogues. '
        '12,000 deals and 72 catalogues are available.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('deal-card-access-discovery')), findsOneWidget);
    await tester.drag(find.byType(ListView).first, const Offset(0, -320));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('deal-card-access-site')), findsOneWidget);
  });

  testWidgets('Marketplace keeps its merged feed within the deal allowance',
      (tester) async {
    await _usePhoneViewport(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: _MergedLimitLayoutApi(),
          isAuthenticated: true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('deal-card-access-discovery')), findsOneWidget);
    expect(find.byKey(const Key('deal-card-access-site')), findsNothing);
  });
}

Future<void> _usePhoneViewport(WidgetTester tester) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 844);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
}

const _longTitle =
    'TechByte Nipple Covers for Women Reusable Sticky Adhesive Silicone '
    'Covers One Pair Five Colours Available One Size Fits All';

class _LayoutApi extends Api {
  _LayoutApi() : super(baseUrl: 'https://example.test');

  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [
          Deal(
            id: 'long-deal',
            retailerId: 'amazon-za',
            retailerName: 'Amazon South Africa',
            sourceLabel: 'Official store',
            sourceUrl: 'https://example.test/source',
            productUrl: 'https://example.test/product',
            title: _longTitle,
            priceText: 'Voucher price R 136,93',
            previousPriceText: 'Price R 152,15',
            savingText: 'With voucher',
          ),
        ],
        foundDealCount: 1,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
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
  }) async =>
      const DiscoveredStoresResult(
        stores: [],
        storeCount: 0,
        areaCount: 0,
        knownChainCount: 0,
        withPromotionsCount: 0,
      );

  @override
  Future<List<SavedDeal>> savedDeals() async => const [
        SavedDeal(
          id: 'saved-tv',
          retailerName: 'Game',
          title: 'Hisense 4K QLED Smart TV 55Q6Q',
          priceText: 'R6499.00',
          savedAt: '2026-07-22T00:00:00.000Z',
        ),
      ];

  @override
  Future<List<SavedSource>> savedSources() async => const [];

  @override
  Future<Basket> basket() async => const Basket(
        items: [],
        summary: BasketSummary(
          itemCount: 0,
          knownPriceItemCount: 0,
          totalCents: 0,
          savingsCents: 0,
        ),
      );

  @override
  Future<int> verifiedOfferCount() async => 0;

  @override
  Future<int> voucherCount() async => 0;

  @override
  Future<List<PublicAd>> publicAds(String placement) async => const [];

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async =>
      const [];

  @override
  Future<NotificationPreferences> notificationPreferences() async =>
      const NotificationPreferences.off();
}

class _AvailabilityLayoutApi extends _LayoutApi {
  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [
          Deal(
            id: 'available',
            retailerId: 'bathu',
            retailerName: 'Bathu',
            sourceLabel: 'Sale',
            title: 'Available shoe',
          ),
          Deal(
            id: 'sold-out',
            retailerId: 'bathu',
            retailerName: 'Bathu',
            sourceLabel: 'Sale',
            title: 'Sold-out shoe',
            soldOut: true,
          ),
        ],
        foundDealCount: 2,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      );
}

class _BidLayoutApi extends _LayoutApi {
  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [
          Deal(
            id: 'plain-camera',
            retailerId: 'takealot',
            retailerName: 'Takealot',
            sourceLabel: 'Deals',
            title: 'Plain camera',
          ),
          Deal(
            id: 'bobshop-bid',
            retailerId: 'bobshop',
            retailerName: 'BobShop',
            sourceLabel: 'Featured listings',
            title: 'Camera auction',
            unitText: 'Current bid',
          ),
        ],
        foundDealCount: 2,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      );
}

class _RecentLayoutApi extends _LayoutApi {
  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    final now = DateTime.now().toUtc();
    return DiscoveryResult(
      deals: [
        Deal(
          id: 'recent-rice',
          retailerId: 'food-market',
          retailerName: 'Food Market',
          sourceLabel: 'Food specials',
          title: 'Recently added rice',
          capturedAt: now.subtract(const Duration(days: 1)).toIso8601String(),
        ),
        Deal(
          id: 'refreshed-old-rice',
          retailerId: 'food-market',
          retailerName: 'Food Market',
          sourceLabel: 'Food specials',
          title: 'Refreshed old rice',
          addedAt: now.subtract(const Duration(days: 14)).toIso8601String(),
          capturedAt: now.subtract(const Duration(hours: 1)).toIso8601String(),
        ),
      ],
      foundDealCount: 2,
      checkedSourceCount: 1,
      unavailableSourceCount: 0,
      leafletCount: 0,
    );
  }
}

class _LimitedLayoutApi extends _LayoutApi {
  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        access: DiscoveryAccess(
          availableCatalogueCount: 72,
          availableDealCount: 12000,
          catalogueLimit: 50,
          dealLimit: 2000,
          planId: 'free',
        ),
        deals: [
          Deal(
            id: 'access-discovery',
            retailerId: 'access-market',
            retailerName: 'Access Market',
            sourceLabel: 'Official specials',
            title: 'Discovery allowance deal',
          ),
        ],
        foundDealCount: 12000,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 72,
      );

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async => const [
        ScrollDeal(
          id: 'access-site',
          title: 'Deal-site overflow',
          retailerName: 'Deal Site',
          sourceLabel: 'Deal Site',
          source: 'deal-site',
          productUrl: 'https://example.test/access-site',
          imageUrl: 'https://example.test/access-site.jpg',
        ),
      ];
}

class _MergedLimitLayoutApi extends _LimitedLayoutApi {
  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        access: DiscoveryAccess(
          availableCatalogueCount: 0,
          availableDealCount: 2,
          catalogueLimit: 50,
          dealLimit: 1,
          planId: 'free',
        ),
        deals: [
          Deal(
            id: 'access-discovery',
            retailerId: 'access-market',
            retailerName: 'Access Market',
            sourceLabel: 'Official specials',
            title: 'Discovery allowance deal',
          ),
        ],
        foundDealCount: 2,
        checkedSourceCount: 1,
        unavailableSourceCount: 0,
        leafletCount: 0,
      );
}

const _memberSession = MemberSession(
  isAuthenticated: true,
  account: MemberAccount(
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
  ),
);
