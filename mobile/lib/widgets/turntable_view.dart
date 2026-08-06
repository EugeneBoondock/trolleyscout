import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../turntable.dart';
import '../ux.dart';

/// A fitting-room result the shopper can turn by dragging.
///
/// There is no second photo and no second render behind this: the turn is a
/// cylindrical parallax of the image already on screen, which costs nothing
/// per use and cannot drift from the shopper's own face the way a generated
/// view would. See turntable.dart for why a cylinder is the right shape.
///
/// If the shader cannot be loaded — an old device, an engine without Impeller
/// — the photo is simply shown as it is. A missing flourish must never cost
/// the shopper the look they paid a fitting for.
class TurntableView extends StatefulWidget {
  const TurntableView({
    super.key,
    required this.image,
    this.enabled = true,
  });

  final ImageProvider image;
  final bool enabled;

  @override
  State<TurntableView> createState() => _TurntableViewState();
}

class _TurntableViewState extends State<TurntableView> {
  ui.FragmentShader? _shader;
  ui.Image? _texture;
  double _angle = 0;
  double _dragStartAngle = 0;
  bool _shaderFailed = false;

  @override
  void initState() {
    super.initState();
    _loadShader();
    _loadTexture();
  }

  @override
  void didUpdateWidget(TurntableView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.image != widget.image) {
      _texture = null;
      _angle = 0;
      _loadTexture();
    }
  }

  @override
  void dispose() {
    _shader?.dispose();
    _texture?.dispose();
    super.dispose();
  }

  Future<void> _loadShader() async {
    try {
      final program =
          await ui.FragmentProgram.fromAsset('shaders/turntable.frag');
      if (!mounted) return;
      setState(() => _shader = program.fragmentShader());
    } catch (_) {
      if (mounted) setState(() => _shaderFailed = true);
    }
  }

  Future<void> _loadTexture() async {
    final stream = widget.image.resolve(ImageConfiguration.empty);
    late final ImageStreamListener listener;
    listener = ImageStreamListener((info, _) {
      stream.removeListener(listener);
      if (!mounted) {
        info.image.dispose();
        return;
      }
      setState(() => _texture = info.image);
    }, onError: (_, __) {
      stream.removeListener(listener);
      if (mounted) setState(() => _shaderFailed = true);
    });
    stream.addListener(listener);
  }

  double _dragged = 0;

  void _onDragStart(DragStartDetails _) {
    _dragStartAngle = _angle;
    _dragged = 0;
  }

  void _onDragUpdate(DragUpdateDetails details, double width) {
    _dragged += details.delta.dx;
    setState(() {
      _angle = turntableAngleFromDrag(
        startAngle: _dragStartAngle,
        dragPixels: _dragged,
        viewWidth: width,
      );
    });
  }

  void _onDragEnd(DragEndDetails _) {
    _dragged = 0;
    // Settles back square on release. The photo as taken is the honest view,
    // and a look left mid-turn reads as a rendering fault rather than a pose.
    setState(() => _angle = 0);
    uxTap();
  }

  @override
  Widget build(BuildContext context) {
    final shader = _shader;
    final texture = _texture;
    if (!widget.enabled || _shaderFailed || shader == null || texture == null) {
      return Image(image: widget.image, fit: BoxFit.contain);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        return GestureDetector(
          key: const Key('turntable-drag'),
          onHorizontalDragStart: _onDragStart,
          onHorizontalDragUpdate: (details) => _onDragUpdate(details, width),
          onHorizontalDragEnd: _onDragEnd,
          child: CustomPaint(
            painter: _TurntablePainter(
              angle: _angle,
              shader: shader,
              texture: texture,
            ),
            size: Size(width, constraints.maxHeight),
          ),
        );
      },
    );
  }
}

class _TurntablePainter extends CustomPainter {
  _TurntablePainter({
    required this.angle,
    required this.shader,
    required this.texture,
  });

  final double angle;
  final ui.FragmentShader shader;
  final ui.Image texture;

  @override
  void paint(Canvas canvas, Size size) {
    shader
      ..setFloat(0, size.width)
      ..setFloat(1, size.height)
      ..setFloat(2, angle)
      ..setFloat(3, turntableBodyCentre)
      ..setFloat(4, turntableBodyHalfWidth)
      ..setImageSampler(0, texture);
    canvas.drawRect(Offset.zero & size, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_TurntablePainter oldDelegate) =>
      oldDelegate.angle != angle || oldDelegate.texture != texture;
}
