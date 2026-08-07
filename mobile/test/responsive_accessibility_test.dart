import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/app_controller.dart';
import 'package:trolley_scout/main.dart';
import 'package:trolley_scout/screens/dashboard_screen.dart';
import 'package:trolley_scout/screens/near_me_screen.dart';
import 'package:trolley_scout/screens/onboarding_screen.dart';
import 'package:trolley_scout/screens/profile_screen.dart';
import 'package:trolley_scout/screens/stores_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/common.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('onboarding and account form fit a small screen at 200% text',
      (tester) async {
    _configureSmallLargeTextView(tester);
    final controller = AppController(_ResponsiveApi());

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: OnboardingScreen(controller: controller, onExplore: () {}),
    ));
    await tester.pump();

    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Log in'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.text('Stretch your budget'), findsOneWidget);
  });

  testWidgets('shared screen header wraps its action at 200% text',
      (tester) async {
    _configureSmallLargeTextView(tester);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const Scaffold(
        body: SafeArea(
          child: SingleChildScrollView(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: ScreenHeader(
                eyebrow: 'Saved items',
                title: 'A long screen heading for a narrow phone',
                action:
                    FilledButton(onPressed: null, child: Text('Manage all')),
              ),
            ),
          ),
        ),
      ),
    ));

    expect(tester.takeException(), isNull);
  });

  testWidgets('authenticated navigation fits a small screen at 200% text',
      (tester) async {
    _configureSmallLargeTextView(tester);
    final controller = AppController(_ResponsiveApi())
      ..session = _memberSession
      ..restoring = false;

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: RootShell(
        controller: controller,
        launchIntroDuration: Duration.zero,
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(DashboardScreen), findsOneWidget);
    final navigation = find.byType(NavigationBar);
    expect(navigation, findsOneWidget);
    // Taller than a toolbar on purpose, still a fraction of the screen at
    // 200% text.
    expect(tester.getSize(navigation).height, lessThanOrEqualTo(80));
    for (final label in [
      'Home',
      'Marketplace',
      'Mr Scout',
      'Stores',
      'Window',
    ]) {
      final text = find.descendant(of: navigation, matching: find.text(label));
      expect(text, findsOneWidget);
      // Labels are deliberately larger than they were: the guard is that one
      // cannot blow the bar out, not that it stays tiny. The bar's own height
      // is pinned above.
      expect(tester.getSize(text).height, lessThanOrEqualTo(22));
      // What matters is that a label stays inside its own fifth of the bar,
      // not any particular pixel width. The label font shrank with the bar, so
      // "Marketplace" now renders in full where it used to be clipped.
      final slotWidth = tester.getSize(navigation).width / 5;
      expect(tester.getSize(text).width, lessThanOrEqualTo(slotWidth));
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'the bottom bar folds away when reading down and returns on the '
      'way back up', (tester) async {
    final controller = AppController(_ResponsiveApi())
      ..session = _memberSession
      ..restoring = false;

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: RootShell(
        controller: controller,
        launchIntroDuration: Duration.zero,
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));

    final reveal = find.byKey(const Key('bottom-nav-reveal'));
    final openHeight = tester.getSize(reveal).height;
    expect(openHeight, greaterThan(0));

    // A scroll notification from inside the page, the way a real list reports
    // one: reading down folds the bar away.
    // The mascot animates forever, so settle by the clock, not by quiet.
    _scroll(tester, ScrollDirection.reverse);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.getSize(reveal).height, 0);

    _scroll(tester, ScrollDirection.forward);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.getSize(reveal).height, openHeight);

    // A sideways flick through a deal carousel is not reading down a page.
    _scroll(tester, ScrollDirection.reverse,
        axisDirection: AxisDirection.right);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.getSize(reveal).height, openHeight);

    expect(tester.takeException(), isNull);
  });

  testWidgets('store, nearby, and profile journeys fit at 200% text',
      (tester) async {
    _configureSmallLargeTextView(tester);
    final api = _ResponsiveApi();
    final controller = AppController(api)
      ..session = _memberSession
      ..restoring = false;
    final screens = <Widget>[
      StoresScreen(api: api, isAuthenticated: true),
      NearMeScreen(api: api, isAuthenticated: true),
      ProfileScreen(controller: controller),
    ];

    for (final screen in screens) {
      await tester.pumpWidget(MaterialApp(
        theme: TS.lightTheme(),
        home: Scaffold(body: screen),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final scrollable = find.byType(Scrollable);
      if (scrollable.evaluate().isNotEmpty) {
        await tester.drag(scrollable.first, const Offset(0, -1600));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
    }
  });

  testWidgets('authenticated navigation fits a short landscape screen',
      (tester) async {
    tester.view.physicalSize = const Size(568, 320);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final controller = AppController(_ResponsiveApi())
      ..session = _memberSession
      ..restoring = false;

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: RootShell(
        controller: controller,
        launchIntroDuration: Duration.zero,
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('authenticated tablet uses an adaptive navigation rail',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = AppController(_ResponsiveApi())
      ..session = _memberSession
      ..restoring = false;

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: RootShell(
        controller: controller,
        launchIntroDuration: Duration.zero,
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Marketplace'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final theme in <(String, ThemeData)>[
    ('light', TS.lightTheme()),
    ('dark', TS.darkTheme()),
  ]) {
    testWidgets('${theme.$1} onboarding meets mobile accessibility guidelines',
        (tester) async {
      final controller = AppController(_ResponsiveApi());
      await tester.pumpWidget(MaterialApp(
        theme: theme.$2,
        home: OnboardingScreen(controller: controller, onExplore: () {}),
      ));
      await tester.pump();

      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    });

    testWidgets('${theme.$1} app shell meets mobile accessibility guidelines',
        (tester) async {
      final controller = AppController(_ResponsiveApi())
        ..session = _memberSession
        ..restoring = false;
      await tester.pumpWidget(MaterialApp(
        theme: theme.$2,
        home: RootShell(
          controller: controller,
          launchIntroDuration: Duration.zero,
        ),
      ));
      await tester.pump(const Duration(milliseconds: 500));

      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    });
  }
}

/// Reports a scroll the way a real list does, from inside the page so it
/// bubbles up through the shell's listener.
void _scroll(
  WidgetTester tester,
  ScrollDirection direction, {
  AxisDirection axisDirection = AxisDirection.down,
}) {
  final context = tester.element(find.byType(DashboardScreen));
  UserScrollNotification(
    context: context,
    direction: direction,
    metrics: FixedScrollMetrics(
      axisDirection: axisDirection,
      devicePixelRatio: 1,
      maxScrollExtent: 2000,
      minScrollExtent: 0,
      pixels: 300,
      viewportDimension: 600,
    ),
  ).dispatch(context);
}

void _configureSmallLargeTextView(WidgetTester tester) {
  tester.view.physicalSize = const Size(320, 568);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = 2;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

class _ResponsiveApi extends Api {
  _ResponsiveApi() : super(baseUrl: 'https://example.test');

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
  Future<List<SavedDeal>> savedDeals() async => const [];

  @override
  Future<Basket> basket() async => const Basket.empty();

  @override
  Future<int> voucherCount() async => 0;

  @override
  Future<List<PublicAd>> publicAds(String placement) async => const [];
}

const _memberSession = MemberSession(
  isAuthenticated: true,
  account: MemberAccount(
    id: 'member-1',
    email: 'sam@example.test',
    displayName: 'Sam Shopper',
    initials: 'SS',
    planId: 'free',
    planName: 'Free',
    planStatus: 'active',
    role: 'member',
    propertiesAccess: false,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  ),
);
