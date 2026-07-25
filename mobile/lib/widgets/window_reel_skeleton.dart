import 'package:flutter/material.dart';

import '../theme.dart';

/// The first-load state for the reel: the shape of the card that is coming,
/// rather than a spinner on an empty screen.
///
/// Showing the layout up front is the cheapest way to make the wait feel
/// shorter — the eye has somewhere to settle and the first real card slots into
/// a frame it already recognises, instead of replacing a void. Honours reduced
/// motion by holding the shimmer still.
class WindowReelSkeleton extends StatefulWidget {
  const WindowReelSkeleton({super.key});

  @override
  State<WindowReelSkeleton> createState() => _WindowReelSkeletonState();
}

class _WindowReelSkeletonState extends State<WindowReelSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    if (reduceMotion) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }

    return Semantics(
      label: 'Loading the window',
      child: Container(
        key: const ValueKey('window-reel-skeleton'),
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(TS.panelRadius),
        ),
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) => _SkeletonBody(
            shimmerPosition: reduceMotion ? 0.5 : _controller.value,
          ),
        ),
      ),
    );
  }
}

class _SkeletonBody extends StatelessWidget {
  const _SkeletonBody({required this.shimmerPosition});

  final double shimmerPosition;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // The photo well, which is most of the card.
        _Shimmer(position: shimmerPosition, radius: 0),
        // The action rail, mirroring where save/comment/share will appear.
        Positioned(
          right: 10,
          bottom: 190,
          child: Column(
            children: [
              for (var index = 0; index < 3; index++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 18),
                  child: _Shimmer(
                    position: shimmerPosition,
                    radius: 24,
                    width: 48,
                    height: 48,
                  ),
                ),
            ],
          ),
        ),
        // The details block: store chip, title, price, then the open button.
        Positioned(
          left: 16,
          right: 74,
          bottom: 28,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _Shimmer(
                  position: shimmerPosition,
                  radius: 20,
                  width: 140,
                  height: 26),
              const SizedBox(height: 10),
              _Shimmer(position: shimmerPosition, radius: 6, height: 22),
              const SizedBox(height: 8),
              _Shimmer(
                  position: shimmerPosition, radius: 6, width: 180, height: 30),
              const SizedBox(height: 14),
              _Shimmer(
                position: shimmerPosition,
                radius: TS.controlRadius,
                height: 48,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Shimmer extends StatelessWidget {
  const _Shimmer({
    required this.position,
    required this.radius,
    this.width,
    this.height,
  });

  final double position;
  final double radius;
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    // The card well is always dark, so the shimmer is a light sweep over black
    // in both themes — the same treatment the reel's photos sit on.
    const base = Color(0xFF1C1710);
    const glint = Color(0xFF2E2820);
    final sweep = position * 2 - 0.5;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          stops: [
            (sweep - 0.25).clamp(0.0, 1.0),
            sweep.clamp(0.0, 1.0),
            (sweep + 0.25).clamp(0.0, 1.0),
          ],
          colors: const [base, glint, base],
        ),
      ),
    );
  }
}
