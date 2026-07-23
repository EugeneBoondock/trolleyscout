import 'package:flutter/material.dart';
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
      home: OnboardingScreen(controller: controller),
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

  for (final theme in <(String, ThemeData)>[
    ('light', TS.lightTheme()),
    ('dark', TS.darkTheme()),
  ]) {
    testWidgets('${theme.$1} onboarding meets mobile accessibility guidelines',
        (tester) async {
      final controller = AppController(_ResponsiveApi());
      await tester.pumpWidget(MaterialApp(
        theme: theme.$2,
        home: OnboardingScreen(controller: controller),
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
