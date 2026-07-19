import 'dart:async';

import 'api.dart';
import 'deal_alert_background.dart';
import 'deal_alert_scheduler.dart';
import 'notification_prefs_store.dart';
import 'notifications.dart';

typedef DealAlertRunner = Future<bool> Function(Api api);
typedef DealAlertPermissionRequest = Future<bool> Function();

/// Keeps the server preference, local cursor, and Android periodic task aligned
/// when a member session starts or ends.
class DealAlertLifecycle {
  DealAlertLifecycle({
    NotificationPrefsStore? preferences,
    DealAlertScheduler? scheduler,
    DealAlertRunner? runPoller,
    DealAlertPermissionRequest? requestPermission,
  })  : _preferences = preferences ?? NotificationPrefsStore(),
        _scheduler = scheduler ?? DealAlertScheduler(),
        _runPoller = runPoller,
        _requestPermission =
            requestPermission ?? DealNotifications.instance.requestPermission;

  final NotificationPrefsStore _preferences;
  final DealAlertScheduler _scheduler;
  final DealAlertRunner? _runPoller;
  final DealAlertPermissionRequest _requestPermission;
  Future<void> _operationTail = Future<void>.value();

  Future<void> syncAuthenticated(Api api) =>
      _enqueue(() => _syncAuthenticated(api));

  Future<void> _syncAuthenticated(Api api) async {
    bool enabled;
    try {
      enabled = (await api.notificationPreferences()).newDeals;
    } catch (_) {
      // Preserve the last confirmed choice during a temporary outage.
      enabled = await _preferences.loadOptIn();
    }

    if (enabled) {
      try {
        enabled = await _requestPermission();
      } catch (_) {
        enabled = false;
      }
    }

    await _preferences.saveOptIn(enabled);
    await _scheduler.setEnabled(enabled);
    if (!enabled) return;

    final run = _runPoller ??
        (api) => DealAlertPoller(
              api: api,
              preferences: _preferences,
              scheduler: _scheduler,
            ).run();
    await run(api);
  }

  Future<void> signedOut() => _enqueue(_clearSignedOutState);

  Future<void> _clearSignedOutState() async {
    await _preferences.clear();
    await _scheduler.setEnabled(false);
  }

  Future<void> _enqueue(Future<void> Function() operation) {
    final previous = _operationTail;
    final completed = Completer<void>();
    _operationTail = completed.future;

    return () async {
      try {
        await previous;
        await operation();
      } finally {
        completed.complete();
      }
    }();
  }
}
