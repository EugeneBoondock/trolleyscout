import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import 'api.dart';
import 'deal_alert_scheduler.dart';
import 'notification_prefs_store.dart';
import 'notifications.dart';

typedef DealAlertNotify = FutureOr<bool> Function(int count);

class DealAlertPoller {
  DealAlertPoller({
    Api? api,
    NotificationPrefsStore? preferences,
    DealAlertScheduler? scheduler,
    DealAlertNotify? notify,
  })  : _api = api ?? Api(),
        _preferences = preferences ?? NotificationPrefsStore(),
        _scheduler = scheduler ?? DealAlertScheduler(),
        _notify = notify ??
            ((count) => DealNotifications.instance.showNewDeals(count));

  final Api _api;
  final NotificationPrefsStore _preferences;
  final DealAlertScheduler _scheduler;
  final DealAlertNotify _notify;

  Future<bool> run() async {
    if (!await _preferences.loadOptIn()) return true;

    try {
      final previousCursor = await _preferences.loadDealAlertCursor();
      final summary = await _api.dealAlerts(after: previousCursor);

      if (!summary.enabled) {
        await _disablePermanentWork();
        return true;
      }

      if (previousCursor == null) {
        await _preferences.saveDealAlertCursor(summary.latestCursor);
        return true;
      }

      if (summary.totalNewDealCount > 0) {
        final delivered = await _notify(summary.totalNewDealCount);
        if (!delivered) return false;
        await _preferences.saveLastAlertAt(DateTime.now());
      }
      await _preferences.saveDealAlertCursor(summary.latestCursor);
      return true;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _disablePermanentWork();
        return true;
      }
      debugPrint('Deal alert background check failed: $error');
      return false;
    } catch (error) {
      debugPrint('Deal alert background check failed: $error');
      return false;
    }
  }

  Future<void> _disablePermanentWork() async {
    await _preferences.clear();
    await _scheduler.setEnabled(false);
  }
}

@pragma('vm:entry-point')
void dealAlertCallbackDispatcher() {
  Workmanager().executeTask((task, _) async {
    WidgetsFlutterBinding.ensureInitialized();
    if (task != DealAlertScheduler.taskName) return true;
    return DealAlertPoller().run();
  });
}

Future<void> initializeDealAlertBackground() async {
  try {
    await Workmanager().initialize(dealAlertCallbackDispatcher);
  } catch (error) {
    debugPrint('Deal alert background initialization failed: $error');
  }
}
