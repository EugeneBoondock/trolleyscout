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
    final stacked = action != null &&
        (MediaQuery.sizeOf(context).width < 380 ||
            MediaQuery.textScalerOf(context).scale(1) > 1.3);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(eyebrow.toUpperCase(), style: TS.eyebrowOf(context)),
        const SizedBox(height: 4),
        if (stacked) ...[
          Text(title,
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.merge(TS.display)),
          const SizedBox(height: 12),
          Align(alignment: Alignment.centerLeft, child: action!),
        ] else
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
  const ErrorPane({
    super.key,
    required this.message,
    required this.onRetry,
    this.detail,
  });

  final String message;
  final VoidCallback onRetry;

  /// Extra context worth showing under [message] — e.g. an ApiException's own
  /// message, when the call site has one and wants to surface it rather than
  /// discard it in favour of the generic [message].
  final String? detail;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              if (detail != null && detail!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(detail!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: TS.mutedOf(context), fontSize: 12)),
              ],
              const SizedBox(height: 12),
              FilledButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
}

class EmptyCard extends StatelessWidget {
  const EmptyCard(
      {super.key,
      required this.message,
      this.icon = Icons.inbox_outlined,
      this.action});

  final String message;
  final IconData icon;

  /// Optional call-to-action shown under the message — e.g. a button that
  /// sends the shopper somewhere useful instead of leaving them at a dead end.
  final Widget? action;

  @override
  Widget build(BuildContext context) => PaperCard(
        child: Column(
          children: [
            Icon(icon,
                size: 34,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            if (action != null) ...[
              const SizedBox(height: 12),
              action!,
            ],
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

/// The canonical whole-vs-decimal money formatter: "R50" for a whole amount,
/// "R50.50" otherwise. [symbol] overrides the currency prefix for non-rand
/// display. This is the single source of truth other "drop the .00" money
/// formatters (ad_pricing.dart, auto_compare_tool.dart) delegate to — keep
/// [formatRand] above separate, since it always shows two decimals and call
/// sites depend on that.
String formatMoney(int cents, {String symbol = 'R'}) {
  final amount = cents / 100;
  final isWhole = amount == amount.roundToDouble();
  return '$symbol${isWhole ? amount.toStringAsFixed(0) : amount.toStringAsFixed(2)}';
}

/// A catalogue/deal "valid until" label that flags past dates as expired
/// instead of rendering a stale, future-looking date string.
class ValidUntilInfo {
  const ValidUntilInfo({required this.label, required this.isExpired});

  final String label;
  final bool isExpired;
}

ValidUntilInfo? validUntilInfo(String? validTo) {
  if (validTo == null || validTo.isEmpty) return null;
  final end = DateTime.tryParse(validTo);
  final isExpired = end != null && end.isBefore(DateTime.now());
  final datePart = validTo.length >= 10 ? validTo.substring(0, 10) : validTo;
  return ValidUntilInfo(
    label: isExpired ? 'Expired' : 'Until $datePart',
    isExpired: isExpired,
  );
}

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

Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: destructive
              ? FilledButton.styleFrom(
                  backgroundColor: TS.redOf(context),
                  foregroundColor: Theme.of(context).colorScheme.onSecondary,
                )
              : null,
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}
