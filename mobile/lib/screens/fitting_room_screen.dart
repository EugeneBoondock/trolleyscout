import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../theme.dart';
import '../saved_fits_store.dart';
import '../ux.dart';
import '../widgets/buy_fittings_sheet.dart';
import '../vton_photo_store.dart';
import '../widgets/common.dart';

/// The virtual fitting room: a first-run intro, a privacy-first photo step,
/// and a before/after try-on result rendered by the server-side model.
class FittingRoomScreen extends StatefulWidget {
  const FittingRoomScreen({
    super.key,
    required this.api,
    required this.garmentImageUrls,
    required this.garmentTitle,
    this.onUpgrade,
    this.photoStore,
    this.fitsStore,
  });

  final Api api;

  /// One garment, or a whole outfit the server layers onto one body.
  final List<String> garmentImageUrls;
  final String garmentTitle;

  String get garmentImageUrl => garmentImageUrls.first;

  /// Where the Scout-plan upsell sends the shopper.
  final VoidCallback? onUpgrade;

  /// Test seam — widget tests inject an in-memory store because real file I/O
  /// never completes inside their fake-async zone.
  final VtonPhotoStore? photoStore;
  final SavedFitsStore? fitsStore;

  @override
  State<FittingRoomScreen> createState() => _FittingRoomScreenState();
}

enum _FittingStage { intro, photo, generating, result, gated }

const _introSeenKey = 'vton_intro_seen_v1';
const _firstSuccessKey = 'vton_first_success_v1';

class _FittingRoomScreenState extends State<FittingRoomScreen> {
  late final VtonPhotoStore _photoStore =
      widget.photoStore ?? VtonPhotoStore();
  late final SavedFitsStore _fitsStore = widget.fitsStore ?? SavedFitsStore();
  bool _fitSaved = false;
  bool _savingFit = false;
  _FittingStage _stage = _FittingStage.photo;
  Uint8List? _photoBytes;
  Uint8List? _resultBytes;
  TryOnQuota? _quota;
  String? _gateMessage;
  String? _tryOnError;
  bool _celebrate = false;
  bool _pickingPhoto = false;

  static const _statusLines = [
    'Steaming the seams…',
    'Checking the fit…',
    'Tailoring pixels…',
    'Pinning the hem…',
  ];
  int _statusIndex = 0;
  Timer? _statusTimer;

  final _introController = PageController();
  int _introPage = 0;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  @override
  void dispose() {
    _statusTimer?.cancel();
    _introController.dispose();
    super.dispose();
  }

  Future<void> _restore() async {
    final preferences = await SharedPreferences.getInstance();
    final introSeen = preferences.getBool(_introSeenKey) ?? false;
    final photo = await _photoStore.load();
    if (!mounted) return;
    setState(() {
      _photoBytes = photo;
      _stage = introSeen ? _FittingStage.photo : _FittingStage.intro;
    });
  }

  Future<void> _finishIntro() async {
    setState(() => _stage = _FittingStage.photo);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_introSeenKey, true);
  }

  Future<void> _pickPhoto(ImageSource source) async {
    if (_pickingPhoto) return;
    setState(() => _pickingPhoto = true);
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1280,
        maxHeight: 1920,
        imageQuality: 85,
      );
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      await _photoStore.save(bytes);
      if (mounted) setState(() => _photoBytes = bytes);
    } catch (_) {
      if (mounted) {
        showNotice(context, 'That photo could not be read. Try another one.');
      }
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  Future<void> _deletePhoto() async {
    final confirmed = await confirmAction(
      context,
      title: 'Delete my photo',
      message: 'This removes the only copy — it lives on this phone and '
          'nowhere else.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    await _photoStore.delete();
    if (mounted) {
      setState(() {
        _photoBytes = null;
        _resultBytes = null;
        _stage = _FittingStage.photo;
      });
    }
  }

  Future<void> _tryOn() async {
    final photo = _photoBytes;
    if (photo == null) return;
    setState(() {
      _stage = _FittingStage.generating;
      _tryOnError = null;
      _statusIndex = 0;
    });
    _statusTimer?.cancel();
    _statusTimer = Timer.periodic(const Duration(milliseconds: 1600), (_) {
      if (mounted) {
        setState(
            () => _statusIndex = (_statusIndex + 1) % _statusLines.length);
      }
    });
    try {
      final result = await widget.api.virtualTryOn(
        personImageBytes: photo,
        garmentImageUrls: widget.garmentImageUrls,
      );
      final bytes = _decodeDataUri(result.image);
      if (!mounted) return;
      if (bytes == null) {
        setState(() {
          _stage = _FittingStage.photo;
          _tryOnError = 'The fitting room returned no image. Try again.';
        });
        return;
      }
      final preferences = await SharedPreferences.getInstance();
      final firstSuccess = !(preferences.getBool(_firstSuccessKey) ?? false);
      if (firstSuccess) await preferences.setBool(_firstSuccessKey, true);
      if (!mounted) return;
      setState(() {
        _resultBytes = bytes;
        _quota = result.quota;
        _stage = _FittingStage.result;
        _celebrate = firstSuccess;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      // 403 is a plan gate; 429 means this month's fittings are spent — both
      // want the upsell, not a retry button.
      final gated = error.statusCode == 403 || error.statusCode == 429;
      setState(() {
        _stage = gated ? _FittingStage.gated : _FittingStage.photo;
        // 403 has no plan access at all, so it keeps the plan pitch; 429 ran
        // a real allowance down and says so in the server's own words.
        _gateMessage = error.statusCode == 429 ? error.message : null;
        _tryOnError = gated ? null : error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _stage = _FittingStage.photo;
        _tryOnError = 'The fitting room hit a snag. Try again.';
      });
    } finally {
      _statusTimer?.cancel();
    }
  }

  static Uint8List? _decodeDataUri(String value) {
    try {
      final base64Part =
          value.startsWith('data:') ? value.split(',').last : value;
      final bytes = base64Decode(base64Part);
      return bytes.isEmpty ? null : bytes;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('FITTING ROOM', style: TS.display),
      ),
      body: SafeArea(
        child: switch (_stage) {
          _FittingStage.intro => _IntroPager(
              controller: _introController,
              page: _introPage,
              onPageChanged: (page) => setState(() => _introPage = page),
              onDone: _finishIntro,
            ),
          _FittingStage.photo => _photoStep(context),
          _FittingStage.generating => const _GeneratingPane(key: Key('vton-generating')),
          _FittingStage.result => _resultStep(context),
          _FittingStage.gated => _ScoutPlanGateCard(
              message: _gateMessage,
              onUpgrade: () {
                Navigator.of(context).maybePop();
                widget.onUpgrade?.call();
              },
              // Running out mid-shop should not mean leaving the fitting
              // room: buying more brings the shopper straight back.
              onBuyFittings: _gateMessage == null
                  ? null
                  : () async {
                      final bought =
                          await showBuyFittingsSheet(context, widget.api);
                      if (!mounted || !bought) return;
                      setState(() {
                        _gateMessage = null;
                        _stage = _FittingStage.photo;
                      });
                    },
            ),
        },
      ),
    );
  }

  Widget _photoStep(BuildContext context) {
    final photo = _photoBytes;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _GarmentBanner(
            imageUrl: widget.garmentImageUrl, title: widget.garmentTitle),
        const SizedBox(height: 16),
        if (_tryOnError != null) ...[
          PaperCard(
            child: Row(
              children: [
                Icon(Icons.error_outline, color: TS.redOf(context)),
                const SizedBox(width: 10),
                Expanded(child: Text(_tryOnError!)),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (photo == null)
          PaperCard(
            child: Column(
              children: [
                const _PhotoGuidance(),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _pickingPhoto
                        ? null
                        : () => _pickPhoto(ImageSource.camera),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.photo_camera_outlined, size: 18),
                        SizedBox(width: 8),
                        Text('Take a photo'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: _pickingPhoto
                        ? null
                        : () => _pickPhoto(ImageSource.gallery),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.photo_library_outlined, size: 18),
                        SizedBox(width: 8),
                        Text('Choose from gallery'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          )
        else
          PaperCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('YOUR PHOTO', style: TS.eyebrowOf(context)),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(TS.tileRadius),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 320),
                    child: Image.memory(
                      photo,
                      fit: BoxFit.cover,
                      width: double.infinity,
                      errorBuilder: (context, error, stack) =>
                          const SizedBox(height: 80),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _tryOn,
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.checkroom, size: 18),
                        SizedBox(width: 8),
                        Text('Try it on'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Center(
                  child: TextButton(
                    onPressed: _deletePhoto,
                    child: Text('Delete my photo',
                        style: TextStyle(color: TS.redOf(context))),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        const _PrivacyPromiseCard(compact: true),
      ],
    );
  }

  Future<void> _saveFit() async {
    final bytes = _resultBytes;
    if (bytes == null || _savingFit) return;
    uxTap();
    setState(() => _savingFit = true);
    try {
      await _fitsStore.save(imageBytes: bytes, title: widget.garmentTitle);
      if (!mounted) return;
      setState(() {
        _fitSaved = true;
        _savingFit = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Fit saved on this phone only.'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _savingFit = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('That fit could not be saved.')),
      );
    }
  }

  Widget _resultStep(BuildContext context) {
    final before = _photoBytes;
    final after = _resultBytes;
    if (before == null || after == null) return const SizedBox.shrink();
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('THE LOOK', style: TS.eyebrowOf(context)),
        const SizedBox(height: 4),
        Text(widget.garmentTitle,
            style:
                Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
        const SizedBox(height: 12),
        TweenAnimationBuilder<double>(
          // A subtle scale-in makes the first reveal land as a moment; the
          // shopper's later results settle instantly.
          tween: Tween(
              begin: (_celebrate && !reduceMotion) ? 0.9 : 1.0, end: 1.0),
          duration: const Duration(milliseconds: 420),
          curve: Curves.easeOutBack,
          builder: (context, scale, child) =>
              Transform.scale(scale: scale, child: child),
          child: _BeforeAfterSlider(before: before, after: after),
        ),
        if (_celebrate) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.auto_awesome, size: 16, color: TS.ink),
              const SizedBox(width: 6),
              Text('Your first fit — looking sharp!',
                  style: TextStyle(
                      color: TS.mutedOf(context),
                      fontWeight: FontWeight.w700)),
            ],
          ),
        ],
        if (_quota != null) ...[
          const SizedBox(height: 12),
          _QuotaBar(quota: _quota!, onUpgrade: widget.onUpgrade),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  key: const Key('save-fit'),
                  onPressed: _fitSaved || _savingFit ? null : _saveFit,
                  icon: Icon(
                    _fitSaved
                        ? Icons.bookmark_rounded
                        : Icons.bookmark_border_rounded,
                    size: 18,
                  ),
                  label: Text(_fitSaved ? 'Saved' : 'Save this fit'),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: SizedBox(
                height: 48,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  child: const Text('Try another'),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // No share button by design: the result stays as private as the photo.
        const _PrivacyPromiseCard(compact: true),
      ],
    );
  }
}

class _GarmentBanner extends StatelessWidget {
  const _GarmentBanner({required this.imageUrl, required this.title});

  final String imageUrl;
  final String title;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(TS.tileRadius),
            child: SizedBox(
              width: 56,
              height: 56,
              child: Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stack) => Container(
                  color: TS.surfaceSoftOf(context),
                  child: Icon(Icons.checkroom_outlined,
                      color: TS.mutedOf(context)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('TRYING ON', style: TS.eyebrowOf(context)),
                const SizedBox(height: 2),
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoGuidance extends StatelessWidget {
  const _PhotoGuidance();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                  color: TS.yellow, shape: BoxShape.circle),
              child: const Icon(Icons.accessibility_new, color: TS.ink),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'One full-body photo is all it needs',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        for (final tip in const [
          (Icons.wb_sunny_outlined, 'Stand in good, even light'),
          (Icons.crop_portrait_outlined, 'Plain background if you can'),
          (Icons.straighten_outlined, 'Head to shoes in the frame'),
        ])
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                Icon(tip.$1, size: 18, color: TS.mutedOf(context)),
                const SizedBox(width: 10),
                Expanded(child: Text(tip.$2)),
              ],
            ),
          ),
      ],
    );
  }
}

/// The bold privacy promise, repeated wherever the photo appears so the
/// guarantee is never more than a glance away.
class _PrivacyPromiseCard extends StatelessWidget {
  const _PrivacyPromiseCard({this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: compact ? 36 : 52,
            height: compact ? 36 : 52,
            decoration:
                const BoxDecoration(color: TS.yellow, shape: BoxShape.circle),
            child: Icon(Icons.lock_outline,
                color: TS.ink, size: compact ? 18 : 26),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Your photo never leaves your hands',
                    style: TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(
                  'It is processed in memory and stored ONLY on this phone. '
                  'We cannot see it, keep it, or share it.',
                  style: TextStyle(
                      color: TS.mutedOf(context), fontSize: 13, height: 1.35),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _IntroPager extends StatelessWidget {
  const _IntroPager({
    required this.controller,
    required this.page,
    required this.onPageChanged,
    required this.onDone,
  });

  final PageController controller;
  final int page;
  final ValueChanged<int> onPageChanged;
  final VoidCallback onDone;

  static const _pageCount = 3;

  @override
  Widget build(BuildContext context) {
    final isLast = page == _pageCount - 1;
    return Column(
      children: [
        Expanded(
          child: PageView(
            controller: controller,
            onPageChanged: onPageChanged,
            children: const [
              _IntroStep(
                illustration: _MirrorIllustration(),
                title: 'Try clothes on yourself, before you buy',
                message: 'Pick any clothing deal and see it on you — no '
                    'queue, no fitting-room curtain, no buyer\'s remorse.',
              ),
              _IntroStep(
                illustration: _PhotoIllustration(),
                title: 'One full-body photo is all it needs',
                message: 'Good light, a plain background, and head to shoes '
                    'in the frame. Take it once, use it for every outfit.',
              ),
              _IntroStep(
                illustration: _PrivacyIllustration(),
                title: 'Your photo never leaves your hands',
                message: 'It is processed in memory and stored ONLY on this '
                    'phone. We cannot see it, keep it, or share it.',
              ),
            ],
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var index = 0; index < _pageCount; index++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: index == page ? 22 : 8,
                height: 8,
                decoration: BoxDecoration(
                  color: index == page
                      ? TS.redOf(context)
                      : TS.lineSoftOf(context),
                  borderRadius: BorderRadius.circular(TS.pillRadius),
                ),
              ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: isLast
                  ? onDone
                  : () => controller.nextPage(
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOut,
                      ),
              child: Text(isLast ? 'Open the fitting room' : 'Next'),
            ),
          ),
        ),
      ],
    );
  }
}

class _IntroStep extends StatelessWidget {
  const _IntroStep({
    required this.illustration,
    required this.title,
    required this.message,
  });

  final Widget illustration;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: reduceMotion ? 1.0 : 0.0, end: 1.0),
        duration: const Duration(milliseconds: 360),
        curve: Curves.easeOut,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, (1 - value) * 14),
            child: child,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            illustration,
            const SizedBox(height: 24),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.merge(TS.display),
            ),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: TS.mutedOf(context), height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}

/// Playful illustration built from shapes: a mirror with a sparkle and a
/// garment waiting beside it.
class _MirrorIllustration extends StatelessWidget {
  const _MirrorIllustration();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      height: 150,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 110,
            height: 150,
            decoration: BoxDecoration(
              color: TS.surfaceSoftOf(context),
              border: Border.all(color: TS.lineOf(context), width: 3),
              borderRadius: BorderRadius.circular(60),
            ),
            child: Icon(Icons.accessibility_new,
                size: 64, color: TS.mutedOf(context)),
          ),
          Positioned(
            right: 0,
            bottom: 12,
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: TS.yellow,
                shape: BoxShape.circle,
                border: Border.all(color: TS.lineOf(context), width: 3),
              ),
              child: const Icon(Icons.checkroom, color: TS.ink, size: 26),
            ),
          ),
          Positioned(
            left: 4,
            top: 4,
            child:
                Icon(Icons.auto_awesome, color: TS.redOf(context), size: 22),
          ),
        ],
      ),
    );
  }
}

class _PhotoIllustration extends StatelessWidget {
  const _PhotoIllustration();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 130,
      height: 150,
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineOf(context), width: 3),
        borderRadius: BorderRadius.circular(TS.cardRadius),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.wb_sunny_outlined, color: TS.redOf(context), size: 22),
          const SizedBox(height: 6),
          Icon(Icons.boy_rounded, size: 76, color: TS.mutedOf(context)),
        ],
      ),
    );
  }
}

class _PrivacyIllustration extends StatelessWidget {
  const _PrivacyIllustration();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 150,
      height: 150,
      decoration: BoxDecoration(
        color: TS.yellow,
        shape: BoxShape.circle,
        border: Border.all(color: TS.lineOf(context), width: 3),
      ),
      child: const Icon(Icons.phonelink_lock_outlined,
          size: 64, color: TS.ink),
    );
  }
}

/// A shimmering silhouette with rotating status lines — the wait reads as a
/// tailor at work, not a stalled spinner.
class _GeneratingPane extends StatefulWidget {
  const _GeneratingPane({super.key});

  @override
  State<_GeneratingPane> createState() => _GeneratingPaneState();
}

class _GeneratingPaneState extends State<_GeneratingPane>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    _pulse.repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    final state = context.findAncestorStateOfType<_FittingRoomScreenState>();
    final line = _FittingRoomScreenState
        ._statusLines[state?._statusIndex ?? 0];
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: reduceMotion
                ? const AlwaysStoppedAnimation(1.0)
                : Tween(begin: 0.35, end: 1.0).animate(CurvedAnimation(
                    parent: _pulse, curve: Curves.easeInOut)),
            child: Container(
              width: 130,
              height: 170,
              decoration: BoxDecoration(
                color: TS.surfaceSoftOf(context),
                borderRadius: BorderRadius.circular(70),
              ),
              child: Icon(Icons.accessibility_new,
                  size: 72, color: TS.mutedOf(context)),
            ),
          ),
          const SizedBox(height: 20),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 260),
            child: Text(
              line,
              key: ValueKey(line),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 6),
          Text('Usually under a minute',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 12)),
        ],
      ),
    );
  }
}

/// Before/after with a draggable divider — drag anywhere on the image to
/// sweep between the shopper's photo and the rendered look.
class _BeforeAfterSlider extends StatefulWidget {
  const _BeforeAfterSlider({required this.before, required this.after});

  final Uint8List before;
  final Uint8List after;

  @override
  State<_BeforeAfterSlider> createState() => _BeforeAfterSliderState();
}

class _BeforeAfterSliderState extends State<_BeforeAfterSlider> {
  double _fraction = 0.5;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(TS.cardRadius),
      child: AspectRatio(
        aspectRatio: 3 / 4,
        child: LayoutBuilder(
          builder: (context, constraints) => GestureDetector(
            onHorizontalDragUpdate: (details) => setState(() {
              _fraction =
                  (details.localPosition.dx / constraints.maxWidth).clamp(0.0, 1.0);
            }),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.memory(widget.after,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stack) =>
                        const SizedBox.shrink()),
                ClipRect(
                  clipper: _LeftFractionClipper(_fraction),
                  child: Image.memory(widget.before,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stack) =>
                          const SizedBox.shrink()),
                ),
                Positioned(
                  left: constraints.maxWidth * _fraction - 1.5,
                  top: 0,
                  bottom: 0,
                  child: Container(width: 3, color: TS.yellow),
                ),
                Positioned(
                  left: constraints.maxWidth * _fraction - 16,
                  top: constraints.maxHeight / 2 - 16,
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: TS.yellow,
                      shape: BoxShape.circle,
                      border: Border.all(color: TS.ink, width: 2),
                    ),
                    child: const Icon(Icons.unfold_more,
                        size: 18, color: TS.ink),
                  ),
                ),
                const Positioned(
                    left: 10, top: 10, child: _SliderTag(label: 'Before')),
                const Positioned(
                    right: 10, top: 10, child: _SliderTag(label: 'After')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LeftFractionClipper extends CustomClipper<Rect> {
  const _LeftFractionClipper(this.fraction);

  final double fraction;

  @override
  Rect getClip(Size size) => Rect.fromLTRB(0, 0, size.width * fraction, size.height);

  @override
  bool shouldReclip(_LeftFractionClipper oldClipper) =>
      oldClipper.fraction != fraction;
}

class _SliderTag extends StatelessWidget {
  const _SliderTag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: TS.ink,
          borderRadius: BorderRadius.circular(TS.pillRadius),
        ),
        child: Text(label,
            style: const TextStyle(
                color: Color(0xFFFFFDF4),
                fontSize: 11,
                fontWeight: FontWeight.w800)),
      );
}

/// The upsell shown when the server says the fitting room needs the Scout
/// plan.
/// What the shopper has left this month, stated plainly — a filling bar for
/// counted plans, a quiet line of pride for unlimited ones.
class _QuotaBar extends StatelessWidget {
  const _QuotaBar({required this.quota, this.onUpgrade});

  final TryOnQuota quota;
  final VoidCallback? onUpgrade;

  @override
  Widget build(BuildContext context) {
    if (quota.isUnlimited) {
      return Row(
        key: const Key('vton-quota'),
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.all_inclusive_rounded,
              size: 15, color: TS.mutedOf(context)),
          const SizedBox(width: 6),
          Text('Unlimited fittings on your plan',
              style: TextStyle(
                  color: TS.mutedOf(context),
                  fontSize: 12,
                  fontWeight: FontWeight.w700)),
        ],
      );
    }
    final limit = quota.limit ?? 0;
    final remaining = quota.remaining ?? 0;
    final progress = limit == 0 ? 0.0 : (remaining / limit).clamp(0.0, 1.0);
    final low = remaining <= (limit * 0.2).ceil();
    return Column(
      key: const Key('vton-quota'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                quota.label,
                style: TextStyle(
                  color: low ? TS.redOf(context) : TS.mutedOf(context),
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            if (low && onUpgrade != null)
              GestureDetector(
                onTap: () {
                  uxTap();
                  onUpgrade!.call();
                },
                child: Text(
                  'Get more',
                  style: TextStyle(
                    color: TS.redOf(context),
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: TweenAnimationBuilder<double>(
            duration: const Duration(milliseconds: 500),
            curve: Curves.easeOutCubic,
            tween: Tween(begin: 0, end: progress),
            builder: (context, value, _) => LinearProgressIndicator(
              value: value,
              minHeight: 6,
              backgroundColor: TS.surfaceSoftOf(context),
              valueColor: AlwaysStoppedAnimation(
                  low ? TS.redOf(context) : TS.greenOf(context)),
            ),
          ),
        ),
      ],
    );
  }
}

class _ScoutPlanGateCard extends StatelessWidget {
  const _ScoutPlanGateCard({
    required this.onUpgrade,
    this.message,
    this.onBuyFittings,
  });

  final VoidCallback onUpgrade;

  /// Offered when an allowance ran out rather than a plan being missing.
  final VoidCallback? onBuyFittings;

  /// The server's own words when a monthly allowance ran out, so the card
  /// says "all 10 fittings" rather than a generic plan pitch.
  final String? message;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        PaperCard(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                    color: TS.yellow, shape: BoxShape.circle),
                child: const Icon(Icons.checkroom, color: TS.ink, size: 30),
              ),
              const SizedBox(height: 14),
              Text(
                  message == null
                      ? 'THE FITTING ROOM IS A SCOUT PLAN PERK'
                      : 'THIS MONTH\'S FITTINGS ARE USED UP',
                  textAlign: TextAlign.center,
                  style: TS.eyebrowOf(context)),
              const SizedBox(height: 8),
              Text(
                message == null
                    ? 'Try clothes on before you buy'
                    : 'More fittings, any time',
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.merge(TS.display),
              ),
              const SizedBox(height: 8),
              Text(
                message ??
                    'Scout members can try any clothing deal on their own '
                        'photo before spending a cent. Upgrade to unlock the '
                        'fitting room along with the rest of the Scout '
                        'toolkit.',
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context), height: 1.4),
              ),
              if (message != null) ...[
                const SizedBox(height: 10),
                Text(
                  'Scout: 50 fittings a month · Household: unlimited',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: TS.faintOf(context),
                      fontSize: 12,
                      fontWeight: FontWeight.w700),
                ),
              ],
              const SizedBox(height: 16),
              if (onBuyFittings != null) ...[
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    key: const Key('buy-more-fittings'),
                    onPressed: onBuyFittings,
                    icon: const Icon(Icons.add_shopping_cart_rounded, size: 18),
                    label: const Text('Buy more fittings'),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              SizedBox(
                width: double.infinity,
                child: onBuyFittings == null
                    ? FilledButton(
                        onPressed: onUpgrade,
                        child: const Text('See the Scout plan'),
                      )
                    : OutlinedButton(
                        onPressed: onUpgrade,
                        child: const Text('Or upgrade your plan'),
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
