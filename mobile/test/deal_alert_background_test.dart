import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/deal_alert_background.dart';
import 'package:trolley_scout/deal_alert_scheduler.dart';
import 'package:trolley_scout/notification_prefs_store.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('an opted-out background check does not request the alert inbox',
      () async {
    final api = _AlertApi(latestCursor: 4, newDealCount: 2);
    final alerts = <int>[];

    final completed = await DealAlertPoller(
      api: api,
      notify: (count) {
        alerts.add(count);
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(api.afterCursors, isEmpty);
    expect(alerts, isEmpty);
  });

  test('the first background check records the inbox cursor without alerting',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    final alerts = <int>[];

    final completed = await DealAlertPoller(
      api: _AlertApi(latestCursor: 7, newDealCount: 3),
      preferences: preferences,
      notify: (count) {
        alerts.add(count);
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(await preferences.loadDealAlertCursor(), 7);
    expect(alerts, isEmpty);
  });

  test('a new server batch produces one notification and advances the cursor',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(7);
    final alerts = <int>[];
    final api = _AlertApi(latestCursor: 8, newDealCount: 2);
    final poller = DealAlertPoller(
      api: api,
      preferences: preferences,
      notify: (count) {
        alerts.add(count);
        return true;
      },
    );

    expect(await poller.run(), isTrue);
    expect(api.afterCursors, [7]);
    expect(alerts, [2]);
    expect(await preferences.loadDealAlertCursor(), 8);

    expect(await poller.run(), isTrue);
    expect(api.afterCursors, [7, 8]);
    expect(alerts, [2], reason: 'the same server batch must not alert twice');
  });

  test('a failed inbox read asks the background scheduler to retry', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);

    final completed = await DealAlertPoller(
      api: _AlertApi(latestCursor: 1, newDealCount: 1, fail: true),
      preferences: preferences,
      notify: (_) => true,
    ).run();

    expect(completed, isFalse);
    expect(await preferences.loadDealAlertCursor(), isNull);
  });

  test('a failed notification keeps the cursor so the batch can retry',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(4);

    final completed = await DealAlertPoller(
      api: _AlertApi(latestCursor: 5, newDealCount: 2),
      preferences: preferences,
      notify: (_) => false,
    ).run();

    expect(completed, isFalse);
    expect(await preferences.loadDealAlertCursor(), 4);
  });

  test('an unauthorized inbox disables local work without retrying', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(4);
    final tasks = _TaskPlatform();

    final completed = await DealAlertPoller(
      api: _AlertApi(
        latestCursor: 5,
        newDealCount: 1,
        failure: const ApiException('Signed out', statusCode: 401),
      ),
      preferences: preferences,
      scheduler: DealAlertScheduler(platform: tasks),
      notify: (_) => true,
    ).run();

    expect(completed, isTrue);
    expect(await preferences.loadOptIn(), isFalse);
    expect(await preferences.loadDealAlertCursor(), isNull);
    expect(tasks.cancelledNames, [DealAlertScheduler.uniqueTaskName]);
  });
}

class _AlertApi extends Api {
  _AlertApi({
    required this.latestCursor,
    required this.newDealCount,
    this.fail = false,
    this.failure,
  }) : super(baseUrl: 'https://example.test');

  final int latestCursor;
  final int newDealCount;
  final bool fail;
  final Object? failure;
  final List<int?> afterCursors = [];

  @override
  Future<DealAlertSummary> dealAlerts({int? after}) async {
    afterCursors.add(after);
    if (failure != null) throw failure!;
    if (fail) throw StateError('offline');
    return DealAlertSummary(
      enabled: true,
      latestCursor: latestCursor,
      totalNewDealCount:
          after == null || after >= latestCursor ? 0 : newDealCount,
    );
  }
}

class _TaskPlatform implements DealAlertTaskPlatform {
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
  }) async {}
}
