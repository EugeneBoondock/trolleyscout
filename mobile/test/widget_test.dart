import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/app_link_coordinator.dart';
import 'package:trolley_scout/main.dart';
import 'package:trolley_scout/screens/dashboard_screen.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/screens/stores_screen.dart';
import 'package:trolley_scout/session_cookie_store.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('signed out boots onboarding, not the app shell', (tester) async {
    await tester
        .pumpWidget(_testApp(_FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    // Onboarding is shown; no app content or navigation is reachable yet.
    expect(find.text('TROLLEY SCOUT'), findsOneWidget);
    expect(find.text('Stretch your budget'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Next'), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'Log in'), findsOneWidget);
    expect(find.byTooltip('Open navigation menu'), findsNothing);
  });

  testWidgets('onboarding uses new Scout scenes and rounded actions',
      (tester) async {
    await tester
        .pumpWidget(_testApp(_FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    Finder asset(String name) => find.byWidgetPredicate((widget) =>
        widget is Image &&
        widget.image is AssetImage &&
        (widget.image as AssetImage).assetName == name);

    expect(asset('assets/onboarding/scout-budget.png'), findsOneWidget);
    final next =
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Next'));
    final shape = next.style?.shape?.resolve(<WidgetState>{});
    expect(shape, isA<RoundedRectangleBorder>());
    expect(
      (shape! as RoundedRectangleBorder).borderRadius,
      BorderRadius.circular(TS.controlRadius),
    );

    await tester.drag(find.byType(PageView), const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(asset('assets/onboarding/scout-window.png'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(asset('assets/onboarding/scout-home.png'), findsOneWidget);
  });

  testWidgets('onboarding opens the account form and can switch to log in',
      (tester) async {
    await tester
        .pumpWidget(_testApp(_FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.textContaining('create an account'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('Display name'), findsOneWidget);

    await tester.tap(find.text('Log in'));
    await tester.pump();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Display name'), findsNothing);
    expect(find.text('Forgot password?'), findsOneWidget);
  });

  testWidgets('drawer contains every consumer destination once signed in',
      (tester) async {
    await tester.pumpWidget(_testApp(_FakeApi(_memberSession)));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));

    for (final label in [
      'Dashboard',
      'Stores',
      'Vouchers',
      'Properties',
      'Saved deals',
      'Basket',
      'Subscription',
      'Settings',
      'About & help',
    ]) {
      expect(
        find.ancestor(
          of: find.text(label),
          matching: find.byType(ListTile),
        ),
        findsOneWidget,
        reason: '$label must be in the app menu',
      );
    }
    expect(find.text('Admin console'), findsNothing);
    for (final removed in ['Saved sources', 'Offers', 'Scanner', 'Rules']) {
      expect(find.text(removed), findsNothing);
    }
  });

  testWidgets('authenticated startup opens Dashboard as the selected home',
      (tester) async {
    await tester.pumpWidget(_testApp(_FakeApi(_memberSession)));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(DashboardScreen), findsOneWidget);

    final navigation = tester.widget<NavigationBar>(find.byType(NavigationBar));
    final firstDestination = tester.widget<NavigationDestination>(
        find.byType(NavigationDestination).first);
    expect(navigation.selectedIndex, 0);
    expect(navigation.height, 64);
    expect(firstDestination.label, 'Home');
    expect(
      tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .map((destination) => destination.label),
      ['Home', 'Stores', 'Near me', 'Deals', 'Window'],
    );
    expect(find.text('Money'), findsNothing);

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));
    final tile = tester.widget<ListTile>(find
        .ancestor(of: find.text('Dashboard'), matching: find.byType(ListTile))
        .first);

    expect(tile.selected, isTrue);
    expect(tile.selectedTileColor, isNotNull);
    expect(tile.shape, isNotNull);
    expect(
      find.ancestor(of: find.text('Home'), matching: find.byType(ListTile)),
      findsNothing,
    );
  });

  testWidgets('successful onboarding login opens Dashboard', (tester) async {
    final api = _FakeApi(
      const MemberSession.signedOut(),
      authenticatedSession: _memberSession,
    );
    await tester.pumpWidget(_testApp(api));
    await tester.pump(const Duration(milliseconds: 500));

    await _logIn(tester);

    expect(find.byType(DashboardScreen), findsOneWidget);
  });

  testWidgets('sign out prepares Dashboard for the next login', (tester) async {
    final api = _FakeApi(
      _memberSession,
      authenticatedSession: _memberSession,
    );
    await tester.pumpWidget(_testApp(api));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byTooltip('Sign out'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Sign out?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Stretch your budget'), findsOneWidget);
    expect(tester.widget<RootShell>(find.byType(RootShell)).controller.busy,
        isFalse);

    await _logIn(tester);

    expect(api.currentSession.isAuthenticated, isTrue);
    expect(
        tester
            .widget<RootShell>(find.byType(RootShell))
            .controller
            .session
            .isAuthenticated,
        isTrue);
    expect(find.byType(DashboardScreen), findsOneWidget);
  });

  testWidgets('profile sign out and re-login returns to Dashboard',
      (tester) async {
    final api = _FakeApi(
      _memberSession,
      authenticatedSession: _memberSession,
    );
    await tester.pumpWidget(_testApp(api));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byTooltip('Settings'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Settings'), findsWidgets);

    final rootShell = tester.widget<RootShell>(find.byType(RootShell));
    await rootShell.controller.signOut();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Stretch your budget'), findsOneWidget);

    await _logIn(tester);

    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(find.text('Settings'), findsNothing);
  });

  testWidgets('system back returns secondary destinations to Dashboard',
      (tester) async {
    await tester.pumpWidget(_testApp(_FakeApi(_memberSession)));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.descendant(
      of: find.byType(NavigationBar),
      matching: find.byIcon(Icons.storefront_outlined),
    ));
    await tester.pump(const Duration(milliseconds: 500));
    expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        1);

    await tester.binding.handlePopRoute();
    await tester.pump(const Duration(milliseconds: 300));
    expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        0);
    expect(find.byType(DashboardScreen), findsOneWidget);
  });

  testWidgets('app links open a destination in a signed-in session',
      (tester) async {
    await tester.pumpWidget(_testApp(_FakeApi(_memberSession)));
    await tester.pump(const Duration(milliseconds: 500));

    AppLinkCoordinator.instance
        .publish(Uri.parse('trolleyscout://stores?test=signed-in'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(StoresScreen), findsOneWidget);
  });

  testWidgets('app links wait for login before opening member content',
      (tester) async {
    final api = _FakeApi(
      const MemberSession.signedOut(),
      authenticatedSession: _memberSession,
    );
    await tester.pumpWidget(_testApp(api));
    await tester.pump(const Duration(milliseconds: 500));

    AppLinkCoordinator.instance.publish(
      Uri.parse('trolleyscout://deals?q=milk&test=after-login'),
    );
    await tester.pump();
    expect(find.byType(DealsScreen), findsNothing);

    await _logIn(tester);
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(DealsScreen), findsOneWidget);
  });

  testWidgets('admin session sees the role-gated console', (tester) async {
    final api = _FakeApi(_adminSession);
    await tester.pumpWidget(_testApp(api));
    await tester.pump(const Duration(milliseconds: 500));

    expect(api.sessionCalls, 1);
    expect(api.currentSession.isAuthenticated, isTrue);
    expect(find.byTooltip('Sign out'), findsOneWidget);
    expect(find.byTooltip('Settings'), findsOneWidget);

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Admin console'), findsOneWidget);
  });
}

Widget _testApp(Api api) => TrolleyScoutApp(
      api: api,
      launchIntroDuration: Duration.zero,
    );

Future<void> _logIn(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(TextButton, 'Log in'));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.enterText(find.byType(TextFormField).at(0), 'sam@example.com');
  await tester.enterText(find.byType(TextFormField).at(1), 'password1');
  await tester.tap(find.byIcon(Icons.person_outline));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

class _FakeApi extends Api {
  _FakeApi(this.currentSession, {this.authenticatedSession})
      : super(
          baseUrl: 'https://example.test',
          cookieStore: MemorySessionCookieStore(),
          sessionStore: MemorySessionSnapshotStore(),
        );

  MemberSession currentSession;
  final MemberSession? authenticatedSession;
  int sessionCalls = 0;

  @override
  Future<MemberSession> session() async {
    sessionCalls += 1;
    return currentSession;
  }

  @override
  Future<MemberSession> authenticate(AuthDraft draft) async {
    currentSession = authenticatedSession ?? currentSession;
    return currentSession;
  }

  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      const DiscoveryResult(
        deals: [],
        foundDealCount: 0,
        checkedSourceCount: 0,
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
  }) async =>
      const DiscoveredStoresResult(
        stores: [],
        storeCount: 0,
        areaCount: 0,
        knownChainCount: 0,
        withPromotionsCount: 0,
      );

  @override
  Future<List<SavedDeal>> savedDeals() async => const [];

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
  Future<List<VerifiedOffer>> offers() async => const [];

  @override
  Future<int> verifiedOfferCount() async => 0;

  @override
  Future<int> voucherCount() async => 0;

  @override
  Future<List<DealWatch>> dealWatches() async => const [];

  @override
  Future<Object?> getMemberState(String key) async => null;

  @override
  Future<List<ScrollDeal>> windowSaves() async => const [];

  @override
  Future<MemberSession> signOut() async {
    currentSession = const MemberSession.signedOut();
    return currentSession;
  }
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

const _adminSession = MemberSession(
  isAuthenticated: true,
  account: MemberAccount(
    id: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin User',
    initials: 'AU',
    planId: 'household',
    planName: 'Household',
    planStatus: 'active',
    role: 'admin',
    propertiesAccess: true,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  ),
);
