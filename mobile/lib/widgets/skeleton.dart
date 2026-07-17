import 'package:flutter/material.dart';

import '../theme.dart';

/// Shimmering placeholder cards shown while a list loads, so screens appear
/// instantly instead of holding a spinner. Honours the system reduced-motion
/// setting by rendering static placeholders.
class SkeletonPane extends StatefulWidget {
  const SkeletonPane({super.key, this.rows = 6, this.rowHeight = 96});

  final int rows;
  final double rowHeight;

  @override
  State<SkeletonPane> createState() => _SkeletonPaneState();
}

class _SkeletonPaneState extends State<SkeletonPane>
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

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      physics: const NeverScrollableScrollPhysics(),
      itemCount: widget.rows,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) => AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => _SkeletonCard(
          height: widget.rowHeight,
          shimmerPosition: reduceMotion ? 0.5 : _controller.value,
        ),
      ),
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard({required this.height, required this.shimmerPosition});

  final double height;
  final double shimmerPosition;

  @override
  Widget build(BuildContext context) {
    final base = TS.surfaceOf(context);
    final glint = Color.lerp(base, TS.lineSoftOf(context), 0.55)!;
    // The highlight sweeps across the card once per animation cycle.
    final sweep = shimmerPosition * 2 - 0.5;

    return Container(
      height: height,
      decoration: BoxDecoration(
        border: Border.all(color: TS.lineSoftOf(context), width: 2),
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          stops: [
            (sweep - 0.25).clamp(0.0, 1.0),
            sweep.clamp(0.0, 1.0),
            (sweep + 0.25).clamp(0.0, 1.0),
          ],
          colors: [base, glint, base],
        ),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _bar(context, widthFactor: 0.35, height: 10),
          const SizedBox(height: 10),
          _bar(context, widthFactor: 0.8, height: 14),
          const SizedBox(height: 8),
          _bar(context, widthFactor: 0.55, height: 14),
        ],
      ),
    );
  }

  Widget _bar(BuildContext context,
      {required double widthFactor, required double height}) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: widthFactor,
      child: Container(height: height, color: TS.lineSoftOf(context)),
    );
  }
}
