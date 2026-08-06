import 'dart:async';

import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../app_link_coordinator.dart';
import '../in_app_alerts.dart';
import '../theme.dart';

/// How long a card stays before it slides away on its own.
const alertDwell = Duration(seconds: 5);

/// The card that drops in when something happens while the app is open.
///
/// It sits above everything, comes down from under the status bar, and leaves
/// on its own. Tapping it goes where the alert points; flicking it up sends it
/// away early. Nothing behind it is blocked while it is on screen — an alert
/// is an offer, not a modal.
class InAppAlertBanner extends StatefulWidget {
  const InAppAlertBanner({super.key, required this.child, this.alerts});

  final Widget child;

  /// Injectable for tests. Defaults to the app-wide channel.
  final Stream<InAppAlert>? alerts;

  @override
  State<InAppAlertBanner> createState() => _InAppAlertBannerState();
}

class _InAppAlertBannerState extends State<InAppAlertBanner>
    with SingleTickerProviderStateMixin {
  // Built here rather than lazily: a lazy `late final` is constructed on
  // first touch, and the first touch can be dispose() on a banner that never
  // showed anything — which asks a deactivated element for a ticker.
  late final AnimationController _entrance;
  StreamSubscription<InAppAlert>? _subscription;
  Timer? _dismissAt;
  InAppAlert? _showing;

  @override
  void initState() {
    super.initState();
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 340),
      reverseDuration: const Duration(milliseconds: 220),
    );
    _subscription =
        (widget.alerts ?? InAppAlerts.instance.stream).listen(_show);
  }

  @override
  void dispose() {
    _dismissAt?.cancel();
    _subscription?.cancel();
    _entrance.dispose();
    super.dispose();
  }

  void _show(InAppAlert alert) {
    _dismissAt?.cancel();
    setState(() => _showing = alert);
    _entrance.forward(from: 0);
    _dismissAt = Timer(alertDwell, _hide);
  }

  void _hide() {
    _dismissAt?.cancel();
    if (!mounted) return;
    _entrance.reverse().whenComplete(() {
      if (mounted) setState(() => _showing = null);
    });
  }

  void _open(InAppAlert alert) {
    _hide();
    AppLinkCoordinator.instance.publish(alert.link);
  }

  @override
  Widget build(BuildContext context) {
    final alert = _showing;
    return Stack(
      children: [
        widget.child,
        if (alert != null)
          Positioned(
            left: 10,
            right: 10,
            top: MediaQuery.of(context).padding.top + 8,
            child: AnimatedBuilder(
              animation: _entrance,
              builder: (context, card) {
                // Overshoot on the way in gives the card the small bounce that
                // makes it feel handed over rather than drawn.
                final eased = CurvedAnimation(
                  parent: _entrance,
                  curve: Curves.easeOutBack,
                  reverseCurve: Curves.easeInCubic,
                ).value;
                return Opacity(
                  opacity: _entrance.value.clamp(0.0, 1.0),
                  child: Transform.translate(
                    offset: Offset(0, -70 * (1 - eased)),
                    child: card,
                  ),
                );
              },
              child: _AlertCard(
                alert: alert,
                onTap: () => _open(alert),
                onDismiss: _hide,
              ),
            ),
          ),
      ],
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({
    required this.alert,
    required this.onTap,
    required this.onDismiss,
  });

  final InAppAlert alert;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final accent = _accentOf(context, alert.kind);
    final tint = _iconTintOf(context, alert.kind, accent);
    return Semantics(
      liveRegion: true,
      button: true,
      label: '${alert.title}. ${alert.body}',
      child: Dismissible(
        key: ValueKey(alert.title + alert.body),
        direction: DismissDirection.up,
        onDismissed: (_) => onDismiss(),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(TS.cardRadius),
            onTap: onTap,
            child: Container(
              decoration: TS.cardFill(context),
              foregroundDecoration: TS.cardStroke(context),
              padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(_iconOf(alert.kind), size: 20, color: tint),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          alert.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          alert.body,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: onDismiss,
                    icon: const Icon(Icons.close_rounded, size: 18),
                    tooltip: 'Dismiss',
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

IconData _iconOf(InAppAlertKind kind) => switch (kind) {
      InAppAlertKind.deals => PhosphorIcons.tag(PhosphorIconsStyle.fill),
      InAppAlertKind.expiring => PhosphorIcons.clock(PhosphorIconsStyle.fill),
      InAppAlertKind.priceDrop =>
        PhosphorIcons.trendDown(PhosphorIconsStyle.fill),
    };

/// Red for a deal, yellow for a clock running down, green for a price that
/// fell — the same three colours the deal cards already use, so the card is
/// read before it is read.
Color _accentOf(BuildContext context, InAppAlertKind kind) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return switch (kind) {
    InAppAlertKind.deals => dark ? TS.redBright : TS.red,
    InAppAlertKind.expiring => TS.yellow,
    InAppAlertKind.priceDrop => TS.green,
  };
}

/// Yellow is a signal colour, not a legible one: at card-tint strength on a
/// cream card the icon disappears. On light it is drawn in ink over the yellow
/// wash; on dark the wash is nearly black, so the yellow itself reads.
Color _iconTintOf(BuildContext context, InAppAlertKind kind, Color accent) {
  if (kind != InAppAlertKind.expiring) return accent;
  return Theme.of(context).brightness == Brightness.dark ? TS.yellow : TS.ink;
}
