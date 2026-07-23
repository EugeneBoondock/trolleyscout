import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/deal_alert_scheduler.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the new-deal alert switch schedules and cancels background work',
      (tester) async {
    final api = _ToggleApi();
    final tasks = _TaskPlatform();
    final scheduler = DealAlertScheduler(platform: tasks);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: api,
          isAuthenticated: true,
          alertScheduler: scheduler,
          requestNotificationPermission: () async => true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    tester.widget<Switch>(find.byType(Switch)).onChanged!(true);
    await tester.pumpAndSettle();
    expect(api.savedPreferences, [true]);
    expect(tasks.scheduledNames, [DealAlertScheduler.uniqueTaskName]);

    tester.widget<Switch>(find.byType(Switch)).onChanged!(false);
    await tester.pumpAndSettle();
    expect(api.savedPreferences, [true, false]);
    expect(tasks.cancelledNames, [DealAlertScheduler.uniqueTaskName]);
  });

  testWidgets('denied device permission leaves alerts off', (tester) async {
    final api = _ToggleApi();
    final tasks = _TaskPlatform();
    var openedSettings = false;

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: api,
          isAuthenticated: true,
          alertScheduler: DealAlertScheduler(platform: tasks),
          requestNotificationPermission: () async => false,
          openNotificationSettings: () async {
            openedSettings = true;
            return true;
          },
        ),
      ),
    ));
    await tester.pumpAndSettle();

    tester.widget<Switch>(find.byType(Switch)).onChanged!(true);
    await tester.pumpAndSettle();

    expect(api.savedPreferences, isEmpty);
    expect(tasks.scheduledNames, isEmpty);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
    expect(
        find.text('Notifications are off for Trolley Scout.'), findsOneWidget);
    await tester.tap(find.text('Settings'));
    await tester.pump();
    expect(openedSettings, isTrue);
  });

  testWidgets('restoring the screen preserves a device-level denial',
      (tester) async {
    SharedPreferences.setMockInitialValues({'notify_new_deals': false});
    final api = _ToggleApi(initialServerPreference: true);
    final tasks = _TaskPlatform();

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: api,
          isAuthenticated: true,
          alertScheduler: DealAlertScheduler(platform: tasks),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
    expect(tasks.scheduledNames, isEmpty);
  });

  testWidgets('a failed server preference write preserves the previous state',
      (tester) async {
    final api = _ToggleApi(failPreferenceWrite: true);
    final tasks = _TaskPlatform();

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DealsScreen(
          api: api,
          isAuthenticated: true,
          alertScheduler: DealAlertScheduler(platform: tasks),
          requestNotificationPermission: () async => true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    tester.widget<Switch>(find.byType(Switch)).onChanged!(true);
    await tester.pumpAndSettle();

    expect(tasks.scheduledNames, isEmpty);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
    expect(
        find.text('Could not update deal alerts. Try again.'), findsOneWidget);
  });
}

class _ToggleApi extends Api {
  _ToggleApi({
    this.failPreferenceWrite = false,
    this.initialServerPreference = false,
  }) : super(baseUrl: 'https://example.test');

  final List<bool> savedPreferences = [];
  final bool failPreferenceWrite;
  final bool initialServerPreference;

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
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async =>
      const [];

  @override
  Future<List<PublicAd>> publicAds(String placement) async => const [];

  @override
  Future<NotificationPreferences> notificationPreferences() async =>
      NotificationPreferences(newDeals: initialServerPreference);

  @override
  Future<NotificationPreferences> setNotificationPreferences(
      bool newDeals) async {
    if (failPreferenceWrite) {
      throw const ApiException('Unavailable', statusCode: 503);
    }
    savedPreferences.add(newDeals);
    return NotificationPreferences(newDeals: newDeals);
  }

  @override
  Future<DealAlertSummary> dealAlerts({int? after}) async =>
      const DealAlertSummary(
        enabled: true,
        latestCursor: 0,
        totalNewDealCount: 0,
      );
}

class _TaskPlatform implements DealAlertTaskPlatform {
  final List<String> scheduledNames = [];
  final List<String> cancelledNames = [];

  @override
  Future<void> cancel(String uniqueName) async {
    cancelledNames.add(uniqueName);
  }

  @override
  Future<void> schedulePeriodic({
    required String uniqueName,
    required Duration frequency,
    required bool networkRequired,
  }) async {
    scheduledNames.add(uniqueName);
  }
}
