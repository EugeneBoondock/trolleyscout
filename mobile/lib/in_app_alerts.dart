import 'dart:async';

import 'package:flutter/foundation.dart';

/// One thing worth interrupting the shopper for, while they are already here.
@immutable
class InAppAlert {
  const InAppAlert({
    required this.title,
    required this.body,
    required this.link,
    this.kind = InAppAlertKind.deals,
  });

  final String title;
  final String body;

  /// Where a tap should take them, as an app link.
  final Uri link;
  final InAppAlertKind kind;
}

/// What the alert is about. Drives the icon and the accent on the card, so a
/// price drop reads as good news at a glance and an expiry reads as a clock
/// running down.
enum InAppAlertKind { deals, expiring, priceDrop }

/// Alerts raised while the app is open.
///
/// A system notification is the right thing when the app is closed, but when
/// someone is already looking at Trolley Scout, dropping a tray notification
/// over their screen is jarring — the app can say it better itself. The
/// notification layer asks here first: if the app is on screen, this carries
/// the message and no tray notification is posted at all.
class InAppAlerts {
  InAppAlerts._();

  static final InAppAlerts instance = InAppAlerts._();

  final StreamController<InAppAlert> _alerts =
      StreamController<InAppAlert>.broadcast();

  Stream<InAppAlert> get stream => _alerts.stream;

  /// True while the app is on screen with the banner mounted.
  ///
  /// The background poll runs in its own isolate, where nothing is listening,
  /// so this is false there and the tray notification is posted as usual.
  bool get isShowing => _alerts.hasListener;

  /// Shows the alert in the app. Returns false when nobody is watching, which
  /// is the caller's cue to fall back to a system notification.
  bool publish(InAppAlert alert) {
    if (!_alerts.hasListener) return false;
    _alerts.add(alert);
    return true;
  }
}
