import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

class ScoutLaunchIntro extends StatefulWidget {
  const ScoutLaunchIntro({
    super.key,
    required this.onComplete,
    this.duration = const Duration(milliseconds: 2900),
  });

  final Duration duration;
  final VoidCallback onComplete;

  @override
  State<ScoutLaunchIntro> createState() => _ScoutLaunchIntroState();
}

class _ScoutLaunchIntroState extends State<ScoutLaunchIntro>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  bool _configuredForReducedMotion = false;

  @override
  void initState() {
    super.initState();
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) widget.onComplete();
    });
    _controller.forward();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    precacheImage(const AssetImage('assets/intro/scout-spin.png'), context);
    precacheImage(const AssetImage('assets/intro/scout-x.png'), context);

    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion && !_configuredForReducedMotion) {
      _configuredForReducedMotion = true;
      _controller
        ..duration = const Duration(milliseconds: 650)
        ..forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final extent = math.min(constraints.maxWidth * 0.9, 430.0);
            return Center(
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) {
                  final value = _controller.value;
                  final spinProgress = Curves.easeInOutCubic
                      .transform((value / 0.58).clamp(0, 1));
                  final popProgress = Curves.easeOutBack
                      .transform(((value - 0.54) / 0.17).clamp(0, 1));
                  final crossFade = Curves.easeOutCubic
                      .transform(((value - 0.52) / 0.14).clamp(0, 1));
                  final exitOpacity =
                      (1 - ((value - 0.90) / 0.10).clamp(0, 1)).toDouble();

                  return Opacity(
                    opacity: exitOpacity,
                    child: SizedBox.square(
                      dimension: extent,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Container(
                            width: extent * 0.84,
                            height: extent * 0.84,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: RadialGradient(
                                colors: [
                                  TS.yellow.withValues(alpha: 0.20),
                                  TS.surfaceOf(context).withValues(alpha: 0.28),
                                  Colors.transparent,
                                ],
                              ),
                            ),
                          ),
                          if (!reduceMotion)
                            Opacity(
                              opacity: 1 - crossFade,
                              child: Transform(
                                alignment: Alignment.center,
                                transform: Matrix4.identity()
                                  ..setEntry(3, 2, 0.0012)
                                  ..rotateY(spinProgress * math.pi * 2)
                                  ..rotateZ(
                                      math.sin(spinProgress * math.pi * 2) *
                                          0.025),
                                child: Image.asset(
                                  'assets/intro/scout-spin.png',
                                  key: const ValueKey('scout-intro-spin'),
                                  excludeFromSemantics: true,
                                  width: extent * 0.76,
                                ),
                              ),
                            ),
                          Opacity(
                            opacity: reduceMotion ? 1 : crossFade,
                            child: Transform.scale(
                              scale:
                                  reduceMotion ? 1 : 0.68 + popProgress * 0.32,
                              child: Image.asset(
                                'assets/intro/scout-x.png',
                                key: const ValueKey('scout-intro-x'),
                                excludeFromSemantics: true,
                                width: extent,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
