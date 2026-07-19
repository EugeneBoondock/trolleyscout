import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/deal_alert_scheduler.dart';

void main() {
  test('enabling alerts schedules one connected three-hour background check',
      () async {
    final platform = _TaskPlatform();

    await DealAlertScheduler(platform: platform).setEnabled(true);

    expect(platform.scheduledNames, [DealAlertScheduler.uniqueTaskName]);
    expect(platform.frequencies, [const Duration(hours: 3)]);
    expect(platform.requiresNetwork, [true]);
    expect(platform.cancelledNames, isEmpty);
  });

  test('disabling alerts cancels the unique background check', () async {
    final platform = _TaskPlatform();

    await DealAlertScheduler(platform: platform).setEnabled(false);

    expect(platform.cancelledNames, [DealAlertScheduler.uniqueTaskName]);
    expect(platform.scheduledNames, isEmpty);
  });
}

class _TaskPlatform implements DealAlertTaskPlatform {
  final List<String> scheduledNames = [];
  final List<Duration> frequencies = [];
  final List<bool> requiresNetwork = [];
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
    frequencies.add(frequency);
    requiresNetwork.add(networkRequired);
  }
}
