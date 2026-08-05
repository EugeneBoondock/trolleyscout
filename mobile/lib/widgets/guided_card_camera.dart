import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';

const double loyaltyCardAspectRatio = 85.60 / 53.98;

typedef GuidedCardCapture = Future<String?> Function(
  BuildContext context, {
  required String title,
  required String instruction,
});

Rect cardFrameForViewport(Size viewport, EdgeInsets safePadding) {
  final horizontalMargin = viewport.width < 360 ? 18.0 : 24.0;
  final availableWidth = math.max(1.0, viewport.width - horizontalMargin * 2);
  final topReserved = safePadding.top + 116;
  final bottomReserved = safePadding.bottom + 158;
  final availableHeight = math.max(
    1.0,
    viewport.height - topReserved - bottomReserved,
  );
  var width =
      math.min(availableWidth, availableHeight * loyaltyCardAspectRatio);
  width = math.max(1.0, width);
  final height = width / loyaltyCardAspectRatio;
  return Rect.fromLTWH(
    (viewport.width - width) / 2,
    topReserved + (availableHeight - height) / 2,
    width,
    height,
  );
}

Rect mapViewportCropToImage({
  required Size viewport,
  required Size image,
  required Rect frame,
}) {
  if (viewport.isEmpty || image.isEmpty) return Rect.zero;
  final scale = math.max(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  final renderedWidth = image.width * scale;
  final renderedHeight = image.height * scale;
  final offsetX = (viewport.width - renderedWidth) / 2;
  final offsetY = (viewport.height - renderedHeight) / 2;
  final left = ((frame.left - offsetX) / scale).clamp(0.0, image.width);
  final top = ((frame.top - offsetY) / scale).clamp(0.0, image.height);
  final right = ((frame.right - offsetX) / scale).clamp(0.0, image.width);
  final bottom = ((frame.bottom - offsetY) / scale).clamp(0.0, image.height);
  return Rect.fromLTRB(left, top, right, bottom);
}

Future<String?> captureGuidedCard(
  BuildContext context, {
  required String title,
  required String instruction,
}) {
  return Navigator.of(context).push<String>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => GuidedCardCameraScreen(
        title: title,
        instruction: instruction,
      ),
    ),
  );
}

class GuidedCardCameraScreen extends StatefulWidget {
  const GuidedCardCameraScreen({
    super.key,
    required this.title,
    required this.instruction,
    this.cameraProvider = availableCameras,
  });

  final String title;
  final String instruction;
  final Future<List<CameraDescription>> Function() cameraProvider;

  @override
  State<GuidedCardCameraScreen> createState() => _GuidedCardCameraScreenState();
}

class _GuidedCardCameraScreenState extends State<GuidedCardCameraScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  String? _error;
  String? _reviewPath;
  bool _busy = false;
  bool _keepReview = false;
  FlashMode _flashMode = FlashMode.off;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initializeCamera());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive) {
      final controller = _controller;
      _controller = null;
      unawaited(controller?.dispose());
    } else if (state == AppLifecycleState.resumed &&
        _controller == null &&
        _reviewPath == null) {
      unawaited(_initializeCamera());
    }
  }

  Future<void> _initializeCamera() async {
    if (mounted) {
      setState(() {
        _error = null;
      });
    }
    try {
      final cameras = await widget.cameraProvider();
      if (cameras.isEmpty) {
        throw CameraException(
          'no_camera',
          'No camera was found on this device.',
        );
      }
      final selected = cameras.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        selected,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      await controller.setFlashMode(_flashMode);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await _controller?.dispose();
      setState(() {
        _controller = controller;
      });
    } on CameraException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.code == 'CameraAccessDenied'
            ? 'Camera access is off. Allow camera access in your device settings, then try again.'
            : (error.description ?? 'The camera is unavailable right now.');
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'The camera is unavailable right now.';
      });
    }
  }

  Future<void> _toggleFlash() async {
    final controller = _controller;
    if (controller == null || _busy) return;
    final next = _flashMode == FlashMode.off ? FlashMode.auto : FlashMode.off;
    try {
      await controller.setFlashMode(next);
      if (mounted) setState(() => _flashMode = next);
    } on CameraException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Flash is unavailable on this camera.')),
        );
      }
    }
  }

  Future<void> _takePhoto(Size viewport, Rect frame) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _busy) return;
    setState(() => _busy = true);
    XFile? original;
    try {
      original = await controller.takePicture();
      final directory = await getTemporaryDirectory();
      final outputPath =
          '${directory.path}${Platform.pathSeparator}guided-card-${DateTime.now().microsecondsSinceEpoch}.jpg';
      final croppedPath = await compute(_cropCardPhoto, <String, Object>{
        'sourcePath': original.path,
        'outputPath': outputPath,
        'viewportWidth': viewport.width,
        'viewportHeight': viewport.height,
        'frameLeft': frame.left,
        'frameTop': frame.top,
        'frameWidth': frame.width,
        'frameHeight': frame.height,
      });
      if (original.path != croppedPath) {
        await File(original.path)
            .delete()
            .catchError((_) => File(original!.path));
      }
      await controller.pausePreview();
      if (!mounted) {
        await File(croppedPath).delete().catchError((_) => File(croppedPath));
        return;
      }
      setState(() {
        _reviewPath = croppedPath;
        _busy = false;
      });
    } catch (_) {
      if (original != null) {
        await File(original.path)
            .delete()
            .catchError((_) => File(original!.path));
      }
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('That photo could not be saved. Please try again.'),
        ),
      );
    }
  }

  Future<void> _retake() async {
    final path = _reviewPath;
    setState(() {
      _reviewPath = null;
      _busy = false;
    });
    if (path != null) {
      await File(path).delete().catchError((_) => File(path));
    }
    try {
      await _controller?.resumePreview();
    } on CameraException {
      await _initializeCamera();
    }
  }

  void _usePhoto() {
    final path = _reviewPath;
    if (path == null) return;
    _keepReview = true;
    Navigator.of(context).pop(path);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_controller?.dispose());
    if (!_keepReview && _reviewPath != null) {
      unawaited(
        File(_reviewPath!).delete().catchError((_) => File(_reviewPath!)),
      );
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Theme(
        data: ThemeData.dark(useMaterial3: true),
        child: Scaffold(
          backgroundColor: Colors.black,
          body: _reviewPath == null ? _buildCamera() : _buildReview(),
        ),
      ),
    );
  }

  Widget _buildCamera() {
    final controller = _controller;
    return LayoutBuilder(
      builder: (context, constraints) {
        final viewport = constraints.biggest;
        final safePadding = MediaQuery.paddingOf(context);
        final frame = cardFrameForViewport(viewport, safePadding);
        return Stack(
          fit: StackFit.expand,
          children: [
            if (controller != null && controller.value.isInitialized)
              _CoverCameraPreview(controller: controller)
            else
              const ColoredBox(color: Color(0xFF171717)),
            if (_error == null)
              GuidedCardGuideOverlay(
                viewport: viewport,
                frame: frame,
                title: widget.title,
                instruction: widget.instruction,
              ),
            if (_error != null)
              _CameraErrorState(
                message: _error!,
                onRetry: _initializeCamera,
                onClose: () => Navigator.of(context).pop(),
              )
            else ...[
              Positioned(
                left: 12,
                top: safePadding.top + 8,
                child: _CameraIconButton(
                  tooltip: 'Close camera',
                  icon: Icons.close,
                  onPressed: _busy ? null : () => Navigator.of(context).pop(),
                ),
              ),
              Positioned(
                right: 12,
                top: safePadding.top + 8,
                child: _CameraIconButton(
                  tooltip: _flashMode == FlashMode.off
                      ? 'Use automatic flash'
                      : 'Turn flash off',
                  icon: _flashMode == FlashMode.off
                      ? Icons.flash_off_rounded
                      : Icons.flash_auto_rounded,
                  onPressed: controller == null ? null : _toggleFlash,
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: safePadding.bottom + 28,
                child: Center(
                  child: Semantics(
                    button: true,
                    label: 'Take card photo',
                    child: SizedBox.square(
                      dimension: 76,
                      child: FilledButton(
                        key: const Key('guided-card-capture'),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFFFD42E),
                          foregroundColor: const Color(0xFF1C1710),
                          padding: EdgeInsets.zero,
                          shape: const CircleBorder(
                            side: BorderSide(color: Colors.white, width: 4),
                          ),
                        ),
                        onPressed: controller == null || _busy
                            ? null
                            : () => _takePhoto(viewport, frame),
                        child: _busy
                            ? const SizedBox.square(
                                dimension: 26,
                                child: CircularProgressIndicator(
                                  strokeWidth: 3,
                                  color: Color(0xFF1C1710),
                                ),
                              )
                            : const Icon(Icons.camera_alt_rounded, size: 32),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _buildReview() {
    final safePadding = MediaQuery.paddingOf(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            safePadding.top + 92,
            20,
            safePadding.bottom + 118,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(22),
            child: ColoredBox(
              color: const Color(0xFF171717),
              child: Image.file(
                File(_reviewPath!),
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Center(
                  child: Text('This photo is unavailable.'),
                ),
              ),
            ),
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          top: safePadding.top + 22,
          child: const Text(
            'Check the crop',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          bottom: safePadding.bottom + 28,
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('guided-card-retake'),
                  onPressed: _retake,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Retake'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  key: const Key('guided-card-use-photo'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFFFD42E),
                    foregroundColor: const Color(0xFF1C1710),
                  ),
                  onPressed: _usePhoto,
                  icon: const Icon(Icons.check_rounded),
                  label: const Text('Use photo'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CoverCameraPreview extends StatelessWidget {
  const _CoverCameraPreview({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    final preview = controller.value.previewSize;
    if (preview == null) return const SizedBox.shrink();
    final portrait = MediaQuery.orientationOf(context) == Orientation.portrait;
    final width = portrait ? preview.height : preview.width;
    final height = portrait ? preview.width : preview.height;
    return ClipRect(
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: width,
          height: height,
          child: CameraPreview(controller),
        ),
      ),
    );
  }
}

class GuidedCardGuideOverlay extends StatelessWidget {
  const GuidedCardGuideOverlay({
    super.key,
    required this.viewport,
    required this.frame,
    required this.title,
    required this.instruction,
  });

  final Size viewport;
  final Rect frame;
  final String title;
  final String instruction;

  @override
  Widget build(BuildContext context) {
    const shade = Color(0xA6000000);
    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: frame.top,
              child: const ColoredBox(color: shade)),
          Positioned(
              left: 0,
              top: frame.top,
              width: frame.left,
              height: frame.height,
              child: const ColoredBox(color: shade)),
          Positioned(
              right: 0,
              top: frame.top,
              width: viewport.width - frame.right,
              height: frame.height,
              child: const ColoredBox(color: shade)),
          Positioned(
              left: 0,
              right: 0,
              top: frame.bottom,
              bottom: 0,
              child: const ColoredBox(color: shade)),
          Positioned.fromRect(
            rect: frame,
            child: DecoratedBox(
              key: const Key('guided-card-frame'),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFFFD42E), width: 4),
              ),
            ),
          ),
          Positioned(
            left: 64,
            right: 64,
            top: MediaQuery.paddingOf(context).top + 16,
            child: Column(
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  instruction,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFFF2F2F2),
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            top: frame.bottom + 18,
            child: const Text(
              'Hold steady. The area outside the frame will be removed.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CameraIconButton extends StatelessWidget {
  const _CameraIconButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton.filled(
      tooltip: tooltip,
      style: IconButton.styleFrom(
        backgroundColor: const Color(0xB31C1710),
        foregroundColor: Colors.white,
        minimumSize: const Size.square(48),
      ),
      onPressed: onPressed,
      icon: Icon(icon),
    );
  }
}

class _CameraErrorState extends StatelessWidget {
  const _CameraErrorState({
    required this.message,
    required this.onRetry,
    required this.onClose,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.no_photography_outlined, size: 54),
              const SizedBox(height: 18),
              const Text(
                'Camera unavailable',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 10),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Try again'),
              ),
              TextButton(onPressed: onClose, child: const Text('Close')),
            ],
          ),
        ),
      ),
    );
  }
}

Future<String> _cropCardPhoto(Map<String, Object> input) async {
  final sourcePath = input['sourcePath']! as String;
  final outputPath = input['outputPath']! as String;
  final bytes = await File(sourcePath).readAsBytes();
  final decoded = img.decodeImage(bytes);
  if (decoded == null) throw const FormatException('Unsupported photo format.');
  final oriented = img.bakeOrientation(decoded);
  final viewport = Size(
    input['viewportWidth']! as double,
    input['viewportHeight']! as double,
  );
  final frame = Rect.fromLTWH(
    input['frameLeft']! as double,
    input['frameTop']! as double,
    input['frameWidth']! as double,
    input['frameHeight']! as double,
  );
  final crop = mapViewportCropToImage(
    viewport: viewport,
    image: Size(oriented.width.toDouble(), oriented.height.toDouble()),
    frame: frame,
  );
  final x = crop.left.floor().clamp(0, oriented.width - 1);
  final y = crop.top.floor().clamp(0, oriented.height - 1);
  final width = crop.width.ceil().clamp(1, oriented.width - x);
  final height = crop.height.ceil().clamp(1, oriented.height - y);
  var cropped = img.copyCrop(
    oriented,
    x: x,
    y: y,
    width: width,
    height: height,
  );
  if (cropped.width > 1800) {
    cropped = img.copyResize(cropped, width: 1800);
  }
  await File(outputPath).writeAsBytes(img.encodeJpg(cropped, quality: 90));
  return outputPath;
}
