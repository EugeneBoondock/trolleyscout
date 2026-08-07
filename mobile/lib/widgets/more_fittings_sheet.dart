import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../theme.dart';
import '../ux.dart';

/// The two ways to get more fittings, offered together.
///
/// Reached from the + beside the fittings balance, so a shopper who wants
/// more never has to run out first to find out how. Money and time sit side
/// by side deliberately: someone who cannot spare R9 is not being shown a
/// lesser option, just a different one.
Future<void> showMoreFittingsSheet(
  BuildContext context, {
  required VoidCallback onBuy,
  required VoidCallback onEarn,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (sheetContext) => SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(10),
        decoration: TS.cardFill(sheetContext),
        foregroundDecoration: TS.cardStroke(sheetContext),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'More fittings',
              style: Theme.of(sheetContext)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              'Top up with a pack, or trade a few minutes for them instead.',
              style: Theme.of(sheetContext).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            _Option(
              icon: PhosphorIcons.shoppingBagOpen(PhosphorIconsStyle.fill),
              title: 'Buy a pack',
              body: 'Fittings land straight away, once the payment clears.',
              onTap: () {
                uxTap();
                Navigator.of(sheetContext).pop();
                onBuy();
              },
            ),
            const SizedBox(height: 10),
            _Option(
              icon: PhosphorIcons.playCircle(PhosphorIconsStyle.fill),
              title: 'Watch an ad',
              body: 'Five ads earn one fitting. Opt in, and no ads appear '
                  'anywhere else in the app.',
              onTap: () {
                uxTap();
                Navigator.of(sheetContext).pop();
                onEarn();
              },
            ),
          ],
        ),
      ),
    ),
  );
}

class _Option extends StatelessWidget {
  const _Option({
    required this.icon,
    required this.title,
    required this.body,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(TS.controlRadius),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: TS.lineSoftOf(context)),
            borderRadius: BorderRadius.circular(TS.controlRadius),
          ),
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(icon, size: 22, color: TS.redOf(context)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(body, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}
