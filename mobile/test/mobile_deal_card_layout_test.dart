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
          {String query = '', String kind = 'all'}) async =>
      const RetailerCatalog(retailers: [], sourceKinds: []);

  @override
  Future<DiscoveredStoresResult> discoveredStores() async =>
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
  Future<List<PublicAd>> publicAds(String placement) async => const [];

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async =>
      const [];

  @override
  Future<NotificationPreferences> notificationPreferences() async =>
      const NotificationPreferences.off();
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
