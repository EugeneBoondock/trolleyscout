import 'dart:math' as math;

import 'package:flutter/material.dart';

enum ScoutMarkMotion { static, scout, spin }

class AnimatedScoutMark extends StatefulWidget {
  const AnimatedScoutMark({
    super.key,
    this.motion = ScoutMarkMotion.static,
    this.size = 38,
  });

  final ScoutMarkMotion motion;
  final double size;

  @override
  State<AnimatedScoutMark> createState() => _AnimatedScoutMarkState();
}

class _AnimatedScoutMarkState extends State<AnimatedScoutMark>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  );
  bool? _animationsDisabled;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final disabled = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (_animationsDisabled != disabled) {
      _animationsDisabled = disabled;
      _configureMotion();
    }
  }

  @override
  void didUpdateWidget(covariant AnimatedScoutMark oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.motion != widget.motion) {
      _configureMotion();
    }
  }

  void _configureMotion() {
    _controller.stop();
    if (_animationsDisabled == true ||
        widget.motion == ScoutMarkMotion.static) {
      _controller.value = 0;
      return;
    }

    _controller.duration = widget.motion == ScoutMarkMotion.spin
        ? const Duration(milliseconds: 900)
        : const Duration(milliseconds: 3200);
    _controller.repeat();
  }

  double _needleAngle() {
    if (_animationsDisabled == true ||
        widget.motion == ScoutMarkMotion.static) {
      return 0;
    }
    if (widget.motion == ScoutMarkMotion.spin) {
      return _controller.value * math.pi * 2;
    }

    final value = _controller.value;
    const left = -18 * math.pi / 180;
    const right = 14 * math.pi / 180;
    const settle = -7 * math.pi / 180;
    if (value < 0.12) return 0;
    if (value < 0.30) return _lerp(0, left, (value - 0.12) / 0.18);
    if (value < 0.52) return _lerp(left, right, (value - 0.30) / 0.22);
    if (value < 0.70) return _lerp(right, settle, (value - 0.52) / 0.18);
    if (value < 0.84) return _lerp(settle, 0, (value - 0.70) / 0.14);
    return 0;
  }

  double _lerp(double start, double end, double amount) {
    final eased = Curves.easeInOut.transform(amount.clamp(0, 1));
    return start + (end - start) * eased;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: SizedBox.square(
        dimension: widget.size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(widget.size * 0.22),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(
                'assets/brand-mark.png',
                fit: BoxFit.contain,
                excludeFromSemantics: true,
              ),
              const CustomPaint(painter: _NeedleCoverPainter()),
              AnimatedBuilder(
                animation: _controller,
                builder: (context, child) => Transform.rotate(
                  key: const ValueKey('scout-mark-needle'),
                  angle: _needleAngle(),
                  alignment: const Alignment(0, -0.17578125),
                  child: child,
                ),
                child: const CustomPaint(painter: _NeedlePainter()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NeedleCoverPainter extends CustomPainter {
  const _NeedleCoverPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 512, size.height / 512);
    final paint = Paint()..color = const Color(0xFFF4EEDD);
    canvas.drawPath(
      Path()
        ..moveTo(188, 280)
        ..lineTo(229, 187)
        ..lineTo(265, 199)
        ..lineTo(284, 235)
        ..lineTo(249, 222)
        ..close(),
      paint,
    );
    canvas.drawPath(
      Path()
        ..moveTo(226, 188)
        ..lineTo(337, 120)
        ..lineTo(283, 238)
        ..lineTo(247, 224)
        ..close(),
      paint,
    );
    canvas.drawCircle(const Offset(256, 211), 27, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _NeedlePainter extends CustomPainter {
  const _NeedlePainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 512, size.height / 512);
    canvas.drawPath(
      Path()
        ..moveTo(256, 211)
        ..lineTo(194, 273)
        ..lineTo(239, 193)
        ..close(),
      Paint()..color = const Color(0xFFD91E18),
    );
    canvas.drawPath(
      Path()
        ..moveTo(256, 211)
        ..lineTo(329, 130)
        ..lineTo(273, 232)
        ..close(),
      Paint()..color = const Color(0xFFFFD326),
    );
    canvas.drawCircle(
      const Offset(256, 211),
      22,
      Paint()..color = const Color(0xFF1C1710),
    );
    canvas.drawCircle(
      const Offset(256, 211),
      11,
      Paint()..color = const Color(0xFFF4EEDD),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
