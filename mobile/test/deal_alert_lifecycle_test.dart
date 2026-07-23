import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/app_controller.dart';
import 'package:trolley_scout/deal_alert_lifecycle.dart';
import 'package:trolley_scout/deal_alert_scheduler.dart';
import 'package:trolley_scout/notification_prefs_store.dart';
import 'package:trolley_scout/session_cookie_store.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('server opt-in schedules a fresh device and establishes its baseline',
      () async {
    final preferences = NotificationPrefsStore();
    final tasks = _TaskPlatform();
    final polled = <Api>[];
    var permissionRequests = 0;
    final api = _PreferenceApi(enabled: true);
    final lifecycle = DealAlertLifecycle(
      preferences: preferences,
      scheduler: DealAlertScheduler(platform: tasks),
      requestPermission: () async {
        permissionRequests += 1;
        return true;
      },
      runPoller: (api) async {
        polled.add(api);
        return true;
      },
    );

    await lifecycle.syncAuthenticated(api);

    expect(await preferences.loadOptIn(), isTrue);
    expect(permissionRequests, 1);
    expect(tasks.scheduledNames, [DealAlertScheduler.uniqueTaskName]);
    expect(polled, [api]);
  });

  test('server opt-in stays disabled when device permission is denied',
      () async {
    final preferences = NotificationPrefsStore();
    final tasks = _TaskPlatform();
    final polled = <Api>[];
    var permissionRequests = 0;
    final api = _PreferenceApi(enabled: true);
    final lifecycle = DealAlertLifecycle(
      preferences: preferences,
      scheduler: DealAlertScheduler(platform: tasks),
      requestPermission: () async {
        permissionRequests += 1;
        return false;
      },
      runPoller: (api) async {
        polled.add(api);
        return true;
      },
    );

    await lifecycle.syncAuthenticated(api);

    expect(permissionRequests, 1);
    expect(await preferences.loadOptIn(), isFalse);
    expect(tasks.scheduledNames, isEmpty);
    expect(tasks.cancelledNames, [DealAlertScheduler.uniqueTaskName]);
    expect(polled, isEmpty);
  });

  test('sign-out queued during sync leaves the device disabled', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveDealAlertCursor(12);
    await preferences.saveLastAlertAt(DateTime.utc(2026, 7, 19));
    final tasks = _TaskPlatform();
    final preferenceResponse = Completer<NotificationPreferences>();
    final api = _DelayedPreferenceApi(preferenceResponse.future);
    final lifecycle = DealAlertLifecycle(
      preferences: preferences,
      scheduler: DealAlertScheduler(platform: tasks),
      requestPermission: () async => true,
      runPoller: (_) async => true,
    );

    final sync = lifecycle.syncAuthenticated(api);
    await api.requested.future;
    final signOut = lifecycle.signedOut();
    preferenceResponse.complete(const NotificationPreferences(newDeals: true));
    await Future.wait([sync, signOut]);

    expect(await preferences.loadOptIn(), isFalse);
    expect(await preferences.loadDealAlertCursor(), isNull);
    expect(await preferences.loadLastAlertAt(), isNull);
    expect(tasks.scheduledNames, [DealAlertScheduler.uniqueTaskName]);
    expect(tasks.cancelledNames, [DealAlertScheduler.uniqueTaskName]);
  });

  test('sign-out clears alert state and cancels periodic work', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(12);
    await preferences.saveLastAlertAt(DateTime.utc(2026, 7, 19));
    final tasks = _TaskPlatform();
    final lifecycle = DealAlertLifecycle(
      preferences: preferences,
      scheduler: DealAlertScheduler(platform: tasks),
    );

    await lifecycle.signedOut();

    expect(await preferences.loadOptIn(), isFalse);
    expect(await preferences.loadDealAlertCursor(), isNull);
    expect(await preferences.loadLastAlertAt(), isNull);
    expect(tasks.cancelledNames, [DealAlertScheduler.uniqueTaskName]);
  });

  test('the app controller shows restored members before lifecycle sync',
      () async {
    final api = _SessionApi();
    final lifecycle = _BlockingLifecycle();
    final controller = AppController(api, dealAlerts: lifecycle);

    await controller.restore();
    await lifecycle.syncStarted.future;
    expect(controller.restoring, isFalse);
    expect(lifecycle.syncedApis, [api]);

    lifecycle.completeSync();
    await controller.signOut();
    expect(lifecycle.signedOutCalls, 1);
  });

  test('the app controller returns from login before lifecycle sync', () async {
    final api = _SessionApi();
    final lifecycle = _BlockingLifecycle();
    final controller = AppController(api, dealAlerts: lifecycle);

    final authenticated = await controller.authenticate(
      const AuthDraft.login(
        email: 'shopper@example.test',
        password: 'password1',
      ),
    );
    await lifecycle.syncStarted.future;
    expect(authenticated, isTrue);
    expect(controller.busy, isFalse);
    expect(lifecycle.syncedApis, [api]);
    lifecycle.completeSync();
  });

  test('offline sign-out clears the active session on this device', () async {
    final api = _OfflineSignOutApi();
    final lifecycle = _BlockingLifecycle()..completeSync();
    final controller = AppController(api, dealAlerts: lifecycle);
    await controller.restore();

    await controller.signOut();

    expect(controller.session.isAuthenticated, isFalse);
    expect(controller.watches, isEmpty);
    expect(controller.busy, isFalse);
    expect(controller.notice, 'You’re signed out on this device.');
  });
}

class _PreferenceApi extends Api {
  _PreferenceApi({required this.enabled})
      : super(baseUrl: 'https://example.test');

  final bool enabled;

  @override
  Future<NotificationPreferences> notificationPreferences() async =>
      NotificationPreferences(newDeals: enabled);
}

class _DelayedPreferenceApi extends Api {
  _DelayedPreferenceApi(this.response) : super(baseUrl: 'https://example.test');

  final Future<NotificationPreferences> response;
  final requested = Completer<void>();

  @override
  Future<NotificationPreferences> notificationPreferences() {
    if (!requested.isCompleted) requested.complete();
    return response;
  }
}

class _SessionApi extends Api {
  _SessionApi()
      : super(
          baseUrl: 'https://example.test',
          cookieStore: MemorySessionCookieStore(),
          sessionStore: MemorySessionSnapshotStore(),
        );

  @override
  Future<MemberSession> session() async => _memberSession;

  @override
  Future<MemberSession> authenticate(AuthDraft draft) async => _memberSession;

  @override
  Future<MemberSession> signOut() async => const MemberSession.signedOut();

  @override
  Future<List<DealWatch>> dealWatches() async => const [];

  @override
  Future<Object?> getMemberState(String key) async => null;
}

class _OfflineSignOutApi extends _SessionApi {
  @override
  Future<MemberSession> signOut() async {
    throw const ApiException('Offline');
  }
}

class _BlockingLifecycle extends DealAlertLifecycle {
  final List<Api> syncedApis = [];
  final syncStarted = Completer<void>();
  final _syncGate = Completer<void>();
  int signedOutCalls = 0;

  @override
  Future<void> syncAuthenticated(Api api) async {
    syncedApis.add(api);
    if (!syncStarted.isCompleted) syncStarted.complete();
    await _syncGate.future;
  }

  @override
  Future<void> signedOut() async {
    signedOutCalls += 1;
  }

  void completeSync() {
    if (!_syncGate.isCompleted) _syncGate.complete();
  }
}

const _memberSession = MemberSession(
  isAuthenticated: true,
  account: MemberAccount(
    id: 'member-1',
    email: 'shopper@example.test',
    displayName: 'Test Shopper',
    initials: 'TS',
    planId: 'free',
    planName: 'Free',
    planStatus: 'active',
    role: 'member',
    propertiesAccess: false,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T10:00:00.000Z',
  ),
);

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
