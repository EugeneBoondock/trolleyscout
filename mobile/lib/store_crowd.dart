/// Typical grocery-store busyness for South African shopping rhythms. There is
/// no free live-crowd feed, so this is honest about being a pattern, not a
/// headcount: month-end pay weekends spike, Saturday mornings queue, late
/// evenings and mid-morning weekdays glide.
enum CrowdLevel { quiet, moderate, busy }

class CrowdEstimate {
  const CrowdEstimate({required this.level, required this.reason});

  final CrowdLevel level;

  /// Why the estimate says what it says, phrased for a chip tooltip.
  final String reason;

  String get label => switch (level) {
        CrowdLevel.quiet => 'Usually quiet',
        CrowdLevel.moderate => 'Steady',
        CrowdLevel.busy => 'Usually busy',
      };
}

CrowdEstimate estimateCrowd(DateTime when) {
  final isPayWeekend = _isMonthEndWindow(when) &&
      (when.weekday == DateTime.saturday || when.weekday == DateTime.sunday);
  final hour = when.hour;

  if (hour < 8 || hour >= 19) {
    return const CrowdEstimate(
      level: CrowdLevel.quiet,
      reason: 'Early and late hours are the calmest time to shop.',
    );
  }
  if (isPayWeekend) {
    return const CrowdEstimate(
      level: CrowdLevel.busy,
      reason: 'Month-end pay weekend — tills run flat out.',
    );
  }
  if (_isMonthEndWindow(when)) {
    return const CrowdEstimate(
      level: CrowdLevel.busy,
      reason: 'Month-end week — stores fill up after payday.',
    );
  }
  if (when.weekday == DateTime.saturday && hour >= 9 && hour < 13) {
    return const CrowdEstimate(
      level: CrowdLevel.busy,
      reason: 'Saturday morning is the weekly rush.',
    );
  }
  if (when.weekday == DateTime.sunday && hour >= 10 && hour < 13) {
    return const CrowdEstimate(
      level: CrowdLevel.moderate,
      reason: 'Sunday late morning sees a steady flow.',
    );
  }
  if (hour >= 16 && hour < 19) {
    return const CrowdEstimate(
      level: CrowdLevel.moderate,
      reason: 'After-work shoppers pass through until early evening.',
    );
  }
  return const CrowdEstimate(
    level: CrowdLevel.quiet,
    reason: 'Mid-day on a weekday is usually easy going.',
  );
}

/// The 25th through the 3rd: SA salaries mostly land from the 25th, and the
/// spending wave carries into the first days of the new month.
bool _isMonthEndWindow(DateTime when) => when.day >= 25 || when.day <= 3;
