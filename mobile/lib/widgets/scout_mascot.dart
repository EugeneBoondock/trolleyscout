import 'package:flutter/material.dart';

import '../theme.dart';

enum ScoutMascotPose { point, search, wave }

extension on ScoutMascotPose {
  String get assetName => 'assets/mascots/scout-$name.png';
}

class ScoutMascot extends StatelessWidget {
  const ScoutMascot({
    super.key,
    this.label,
    this.pose = ScoutMascotPose.wave,
    this.size = 148,
  });

  final String? label;
  final ScoutMascotPose pose;
  final double size;

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      pose.assetName,
      excludeFromSemantics: label == null,
      fit: BoxFit.contain,
      height: size,
      semanticLabel: label,
      width: size,
    );

    return RepaintBoundary(
      child: SizedBox.square(
        dimension: size,
        child: image,
      ),
    );
  }
}

class ScoutGuideCard extends StatelessWidget {
  const ScoutGuideCard({
    super.key,
    required this.message,
    required this.onDismiss,
    required this.title,
    this.pose = ScoutMascotPose.point,
  });

  final String message;
  final VoidCallback onDismiss;
  final ScoutMascotPose pose;
  final String title;

  @override
  Widget build(BuildContext context) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return TweenAnimationBuilder<double>(
      duration:
          reduceMotion ? Duration.zero : const Duration(milliseconds: 360),
      curve: Curves.easeOutBack,
      tween: Tween(begin: 0, end: 1),
      builder: (context, value, child) => Opacity(
        opacity: value.clamp(0, 1),
        child: Transform.translate(
          offset: Offset(0, (1 - value) * 22),
          child: child,
        ),
      ),
      child: Semantics(
        container: true,
        liveRegion: true,
        label: '$title. $message',
        child: Container(
          constraints: const BoxConstraints(maxWidth: 340),
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 10),
          decoration: TS.card(context, width: 1.5),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ScoutMascot(pose: pose, size: 82),
              const SizedBox(width: 6),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(title,
                          style: const TextStyle(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 3),
                      Text(
                        message,
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontSize: 12.5,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              IconButton(
                constraints:
                    const BoxConstraints.tightFor(width: 48, height: 48),
                icon: const Icon(Icons.close, size: 18),
                onPressed: onDismiss,
                tooltip: 'Dismiss Scout’s tip',
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
