import 'package:flutter/material.dart';

import '../theme.dart';

/// Reserves the story reel while its feed loads and gives each empty story
/// slot the same soft sweep used by the web dashboard.
class DashboardStoriesSkeleton extends StatefulWidget {
  const DashboardStoriesSkeleton({
    super.key,
    this.itemCount = 4,
  });

  final int itemCount;

  @override
  State<DashboardStoriesSkeleton> createState() =>
      _DashboardStoriesSkeletonState();
}

class _DashboardStoriesSkeletonState extends State<DashboardStoriesSkeleton>
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

    return ExcludeSemantics(
      child: SizedBox(
        key: const Key('dashboard-story-reel-skeleton'),
        height: 92,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final position = reduceMotion ? 0.5 : _controller.value;
            return ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: widget.itemCount,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) => RepaintBoundary(
                child: _StoryPlaceholder(
                  key: Key('dashboard-story-skeleton-item-$index'),
                  position: position,
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _StoryPlaceholder extends StatelessWidget {
  const _StoryPlaceholder({
    super.key,
    required this.position,
  });

  final double position;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 68,
      child: Column(
        children: [
          Container(
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: TS.lineSoftOf(context),
                width: 2,
              ),
              gradient: _shimmerGradient(context, position),
            ),
          ),
          const SizedBox(height: 7),
          Container(
            width: 46,
            height: 9,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(TS.pillRadius),
              gradient: _shimmerGradient(context, position),
            ),
          ),
        ],
      ),
    );
  }

  LinearGradient _shimmerGradient(BuildContext context, double position) {
    final base = TS.surfaceSoftOf(context);
    final glint = Color.lerp(base, TS.surfaceOf(context), 0.9)!;
    final sweep = -2.2 + (position * 4.4);

    return LinearGradient(
      begin: Alignment(sweep - 1, 0),
      end: Alignment(sweep + 1, 0),
      colors: [base, glint, base],
      stops: const [0, 0.5, 1],
    );
  }
}
