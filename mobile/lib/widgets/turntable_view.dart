import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../body_bounds.dart';
import '../turntable.dart';
import '../ux.dart';

/// A fitting-room result the shopper can turn by dragging.
///
/// There is no second photo and no second render behind this: the turn slides
/// the image already on screen around a cylinder fitted to the shopper, which
/// costs nothing per use and cannot drift from the shopper's own face the way
/// a generated view would. See turntable.dart for the mapping and
/// body_bounds.dart for how the cylinder finds the person.
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
  BodyBand _band = BodyBand.fallback;
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
      _band = BodyBand.fallback;
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
      _measureBand(info.image);
    }, onError: (_, __) {
      stream.removeListener(listener);
      if (mounted) setState(() => _shaderFailed = true);
    });
    stream.addListener(listener);
  }

  /// Fits the cylinder to the person. One pixel read per photo; until it
  /// lands, or if it fails, the centred fallback band keeps the turn working.
  Future<void> _measureBand(ui.Image image) async {
    try {
      final data =
          await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (data == null || !mounted || _texture != image) return;
      final band = estimateBodyBand(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        image.width,
        image.height,
      );
      if (mounted && _texture == image) setState(() => _band = band);
    } catch (_) {
      // The fallback band is already in place.
    }
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

    // The paint area keeps the photo's own shape. Painting straight onto
    // whatever box the parent offers stretched the shopper to the screen's
    // proportions, which read as a fault before the first drag ever happened.
    return AspectRatio(
      aspectRatio: texture.width / texture.height,
      child: LayoutBuilder(
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
                band: _band,
                shader: shader,
                texture: texture,
              ),
              size: Size(width, constraints.maxHeight),
            ),
          );
        },
      ),
    );
  }
}

class _TurntablePainter extends CustomPainter {
  _TurntablePainter({
    required this.angle,
    required this.band,
    required this.shader,
    required this.texture,
  });

  final double angle;
  final BodyBand band;
  final ui.FragmentShader shader;
  final ui.Image texture;

  @override
  void paint(Canvas canvas, Size size) {
    shader
      ..setFloat(0, size.width)
      ..setFloat(1, size.height)
      ..setFloat(2, angle)
      ..setFloat(3, band.centre)
      ..setFloat(4, band.halfWidth)
      ..setImageSampler(0, texture);
    canvas.drawRect(Offset.zero & size, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_TurntablePainter oldDelegate) =>
      oldDelegate.angle != angle ||
      oldDelegate.texture != texture ||
      oldDelegate.band != band;
}
