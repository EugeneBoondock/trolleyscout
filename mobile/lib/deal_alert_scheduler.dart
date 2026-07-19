import 'package:flutter/foundation.dart';
import 'package:workmanager/workmanager.dart';

abstract interface class DealAlertTaskPlatform {
  Future<void> schedulePeriodic({
    required String uniqueName,
    required Duration frequency,
    required bool networkRequired,
  });

  Future<void> cancel(String uniqueName);
}

class WorkmanagerDealAlertTaskPlatform implements DealAlertTaskPlatform {
  const WorkmanagerDealAlertTaskPlatform();

  @override
  Future<void> schedulePeriodic({
    required String uniqueName,
    required Duration frequency,
    required bool networkRequired,
  }) {
    return Workmanager().registerPeriodicTask(
      uniqueName,
      DealAlertScheduler.taskName,
      frequency: frequency,
      constraints: Constraints(
        networkType:
            networkRequired ? NetworkType.connected : NetworkType.notRequired,
      ),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
    );
  }

  @override
  Future<void> cancel(String uniqueName) =>
      Workmanager().cancelByUniqueName(uniqueName);
}

class DealAlertScheduler {
  DealAlertScheduler({DealAlertTaskPlatform? platform})
      : _platform = platform ?? const WorkmanagerDealAlertTaskPlatform();

  static const uniqueTaskName = 'trolley-scout-new-deal-alerts';
  static const taskName = 'check-new-deal-alerts';
  static const frequency = Duration(hours: 3);

  final DealAlertTaskPlatform _platform;

  Future<void> setEnabled(bool enabled) async {
    try {
      if (enabled) {
        await _platform.schedulePeriodic(
          uniqueName: uniqueTaskName,
          frequency: frequency,
          networkRequired: true,
        );
      } else {
        await _platform.cancel(uniqueTaskName);
      }
    } catch (error) {
      debugPrint('Deal alert background schedule failed: $error');
    }
  }
}
