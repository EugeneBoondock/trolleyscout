import 'package:flutter/material.dart';

import '../theme.dart';

/// One way onward from the end of a reel.
class WindowNextStop {
  const WindowNextStop({
    required this.label,
    required this.icon,
    required this.onTap,
    this.primary = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  /// The one action styled as the obvious next move.
  final bool primary;
}

/// The card that sits after the last deal in a reel, so a swipe never lands on
/// a wall. Reaching the end of the window should feel like stepping out of one
/// shop and seeing the rest of the mall — there is always somewhere to go, and
/// the ways on are real ones: fetch what has landed since, look through a
/// store's own promos, or go back over what was kept.
///
/// It states only what is true of the reel behind it. If a count is not a real
/// count, it is not shown.
class WindowNextStopCard extends StatelessWidget {
  const WindowNextStopCard({
    super.key,
    required this.title,
    required this.message,
    required this.actions,
    this.footnote,
  });

  final String title;
  final String message;
  final List<WindowNextStop> actions;

  /// A quiet second line — used for real tallies such as how many deals the
  /// shopper has kept. Never a projection, never a goal.
  final String? footnote;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('window-next-stop'),
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        borderRadius: BorderRadius.circular(TS.panelRadius),
        border: Border.all(color: TS.lineSoftOf(context), width: 2),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                Icons.storefront_outlined,
                size: 46,
                color: TS.mutedOf(context),
              ),
              const SizedBox(height: 16),
              Text(
                title,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: TS.inkOf(context),
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context), fontSize: 15),
              ),
              if (footnote != null) ...[
                const SizedBox(height: 10),
                Text(
                  footnote!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: TS.greenOf(context),
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
              const SizedBox(height: 22),
              for (final action in actions)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _NextStopButton(action: action),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NextStopButton extends StatelessWidget {
  const _NextStopButton({required this.action});

  final WindowNextStop action;

  // Comfortably past the 44px minimum once the label wraps at large text sizes.
  static const _minHeight = 48.0;

  @override
  Widget build(BuildContext context) {
    final label = Text(
      action.label,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
    );
    if (action.primary) {
      return FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: TS.yellow,
          foregroundColor: TS.ink,
          minimumSize: const Size.fromHeight(_minHeight),
        ),
        onPressed: action.onTap,
        icon: Icon(action.icon, size: 18),
        label: label,
      );
    }
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        foregroundColor: TS.inkOf(context),
        side: BorderSide(color: TS.lineOf(context)),
        minimumSize: const Size.fromHeight(_minHeight),
      ),
      onPressed: action.onTap,
      icon: Icon(action.icon, size: 18),
      label: label,
    );
  }
}
