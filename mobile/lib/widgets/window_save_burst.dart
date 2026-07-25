import 'package:flutter/material.dart';

import '../theme.dart';

/// The confirmation that blooms over a card when a shopper double-taps to save.
///
/// Saving is the act this whole screen exists to encourage — it is the one that
/// puts money back in a household's pocket — so it gets the nicest response in
/// the app: a bookmark that swells once and fades. It confirms something that
/// really happened; it is not a reward loop, and it never appears unless a save
/// was actually recorded.
///
/// Drive it by incrementing [trigger]. A zero (or unchanged) value shows
/// nothing, so rebuilding a card never replays the animation.
class WindowSaveBurst extends StatefulWidget {
  const WindowSaveBurst({super.key, required this.trigger});

  final int trigger;

  @override
  State<WindowSaveBurst> createState() => _WindowSaveBurstState();
}

class _WindowSaveBurstState extends State<WindowSaveBurst>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 720),
  );

  @override
  void didUpdateWidget(covariant WindowSaveBurst oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Only a fresh save plays. Falling back to 0 (this card is no longer the
    // one that was saved) must never read as a new save.
    if (widget.trigger > oldWidget.trigger) _controller.forward(from: 0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return IgnorePointer(
      child: Center(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            // Present only while it is playing: nothing before the first save,
            // nothing left behind afterwards.
            if (_controller.status != AnimationStatus.forward) {
              return const SizedBox.shrink();
            }
            final t = _controller.value;
            // Reduced motion still gets the confirmation — it simply holds
            // still and then leaves, with no swell and no travel.
            final opacity = t < 0.7 ? 1.0 : 1 - (t - 0.7) / 0.3;
            final scale = reduceMotion
                ? 1.0
                : 0.6 + Curves.easeOutBack.transform(t.clamp(0.0, 1.0)) * 0.5;
            return Opacity(
              opacity: opacity.clamp(0.0, 1.0),
              child: Transform.scale(scale: scale, child: child),
            );
          },
          child: Semantics(
            liveRegion: true,
            label: 'Saved',
            child: Container(
              key: const ValueKey('window-save-burst'),
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55),
                shape: BoxShape.circle,
                border: Border.all(color: TS.yellow, width: 2),
              ),
              child: const Icon(Icons.bookmark, color: TS.yellow, size: 48),
            ),
          ),
        ),
      ),
    );
  }
}
