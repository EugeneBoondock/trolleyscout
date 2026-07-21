import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';
import 'skeleton.dart';

class ScreenHeader extends StatelessWidget {
  const ScreenHeader(
      {super.key,
      required this.eyebrow,
      required this.title,
      this.description,
      this.action});

  final String eyebrow;
  final String title;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(eyebrow.toUpperCase(), style: TS.eyebrowOf(context)),
        const SizedBox(height: 4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .headlineMedium
                      ?.merge(TS.display)),
            ),
            if (action != null) ...[const SizedBox(width: 12), action!],
          ],
        ),
        if (description != null) ...[
          const SizedBox(height: 8),
          Text(description!,
              style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
        const SizedBox(height: 18),
      ],
    );
  }
}

/// Wraps a tappable surface so it dips slightly while pressed — the tactile
/// micro-interaction that makes taps feel instant and premium. Uses a [Listener]
/// (pointer events only), so it never competes with the child's own InkWell/tap
/// in the gesture arena; it is purely a visual layer. Honours reduce-motion.
class PressableScale extends StatefulWidget {
  const PressableScale({
    super.key,
    required this.child,
    this.pressedScale = 0.97,
  });

  final Widget child;
  final double pressedScale;

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> {
  bool _pressed = false;

  void _set(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: (_pressed && !reduceMotion) ? widget.pressedScale : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

class PaperCard extends StatelessWidget {
  const PaperCard(
      {super.key,
      required this.child,
      this.margin,
      this.padding = const EdgeInsets.all(16)});

  final Widget child;
  final EdgeInsetsGeometry? margin;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: margin,
      padding: padding,
      decoration: TS.card(context),
      // ListTiles and ink splashes paint on the nearest Material; without this
      // they'd try to paint on the Scaffold's, underneath this card's color
      // (Flutter 3.44+ asserts on that). Transparent, so the paper look wins.
      child: Material(type: MaterialType.transparency, child: child),
    );
  }
}

class LoadingPane extends StatelessWidget {
  const LoadingPane({super.key});

  // Skeleton cards instead of a spinner: the screen keeps its shape and the
  // shimmer reads as "content is seconds away", not "please wait".
  @override
  Widget build(BuildContext context) => const SkeletonPane(rows: 6);
}

class ErrorPane extends StatelessWidget {
  const ErrorPane({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
}

class EmptyCard extends StatelessWidget {
  const EmptyCard(
      {super.key, required this.message, this.icon = Icons.inbox_outlined});

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) => PaperCard(
        child: Column(
          children: [
            Icon(icon,
                size: 34,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      );
}

class MetricCard extends StatelessWidget {
  const MetricCard(
      {super.key,
      required this.label,
      required this.value,
      required this.icon,
      this.onTap});

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        child: InkWell(
        onTap: onTap,
        child: PaperCard(
          child: Row(
            children: [
              Icon(icon, color: TS.redOf(context), size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(value,
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display)),
                    Text(label,
                        style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      );
}

String formatRand(int cents) => 'R${(cents / 100).toStringAsFixed(2)}';

Future<void> openExternal(String? value) async {
  if (value == null || value.isEmpty) return;
  final uri = Uri.tryParse(value);
  if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
}

void showNotice(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
