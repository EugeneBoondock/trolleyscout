import 'package:flutter/material.dart';

/// The honest end-date label for a Window Shopping card, or null when there is
/// nothing true to say.
///
/// A shopper on a tight budget deserves to know when an offer really closes —
/// and deserves to be left alone when we do not know. So this only ever repeats
/// what the feed actually told us: a real, parseable end date that is still in
/// the future. No end date, an unparseable one, or one that has already passed
/// all return null, and the card shows nothing at all. Nothing here invents a
/// countdown or hurries anyone along.
///
/// Dates further out than a week also return null. That is not urgency by
/// omission — it is that "ends in 23 days" is not a fact a shopper can act on
/// today, and every extra badge costs attention that the price deserves.
String? windowEndsLabel(String? expiresAt, {required DateTime now}) {
  if (expiresAt == null) return null;
  final parsed = DateTime.tryParse(expiresAt.trim());
  if (parsed == null) return null;
  // Feeds send both UTC ("…Z") and local timestamps; compare in one zone.
  final end = parsed.isUtc ? parsed.toLocal() : parsed;
  if (!end.isAfter(now)) return null;

  final today = DateTime(now.year, now.month, now.day);
  final endDay = DateTime(end.year, end.month, end.day);
  // Whole days between the two calendar dates, rounded so a clock change can
  // never turn "tomorrow" into "today".
  final days = (endDay.difference(today).inHours / 24).round();
  if (days <= 0) return 'Ends today';
  if (days == 1) return 'Ends tomorrow';
  if (days <= 7) return 'Ends in $days days';
  return null;
}

/// A calm end-date pill for the deal card. Deliberately quiet: it sits beside
/// the saving badge as information, not as an alarm, and it renders nothing at
/// all when [windowEndsLabel] has nothing true to report.
///
/// Colours are fixed white-on-scrim rather than themed, matching the rest of
/// the card chrome — a reel card is always a photo behind a dark gradient in
/// both light and dark mode, so a themed surface would disappear on it.
class WindowEndsPill extends StatelessWidget {
  const WindowEndsPill({super.key, required this.expiresAt, required this.now});

  final String? expiresAt;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final label = windowEndsLabel(expiresAt, now: now);
    if (label == null) return const SizedBox.shrink();
    return Container(
      key: const ValueKey('window-ends-pill'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        border: Border.all(color: Colors.white30),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.schedule, size: 12, color: Colors.white70),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
