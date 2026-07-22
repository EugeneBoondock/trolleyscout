import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../app_controller.dart';
import '../theme.dart';
import 'in_app_browser.dart';

/// The alerts bell: a badge counts matched watches the member has not seen.
/// Tapping opens the watch list, where alerts can be read and dismissed.
class WatchBell extends StatelessWidget {
  const WatchBell({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final count = controller.alertCount;
    return IconButton(
      tooltip: count > 0
          ? '$count deal alert${count == 1 ? '' : 's'} waiting'
          : 'Watched items',
      onPressed: () {
        HapticFeedback.selectionClick();
        showWatchesSheet(context, controller);
      },
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        backgroundColor: TS.redOf(context),
        child: Icon(
          count > 0 ? Icons.notifications_active : Icons.notifications_none,
        ),
      ),
    );
  }
}

Future<void> showWatchesSheet(BuildContext context, AppController controller) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TS.bgOf(context),
    shape: Border(top: BorderSide(color: TS.lineOf(context), width: 3)),
    builder: (context) => _WatchesSheet(controller: controller),
  );
}

class _WatchesSheet extends StatefulWidget {
  const _WatchesSheet({required this.controller});

  final AppController controller;

  @override
  State<_WatchesSheet> createState() => _WatchesSheetState();
}

class _WatchesSheetState extends State<_WatchesSheet> {
  @override
  void initState() {
    super.initState();
    widget.controller.refreshWatches();
  }

  Future<void> _dismiss(DealWatch watch) async {
    HapticFeedback.lightImpact();
    // Optimistic: the alert clears immediately, server catches up.
    widget.controller.replaceWatches([
      for (final candidate in widget.controller.watches)
        candidate.id == watch.id
            ? DealWatch(
                id: watch.id,
                queryText: watch.queryText,
                createdAt: watch.createdAt,
                matchedAt: watch.matchedAt,
                seenAt: DateTime.now().toUtc().toIso8601String(),
                matches: watch.matches,
              )
            : candidate,
    ]);
    try {
      widget.controller.replaceWatches(
          await widget.controller.api.markDealWatchSeen(watch.id));
    } catch (_) {
      // Optimistic state stands; the next refresh reconciles.
    }
  }

  Future<void> _delete(DealWatch watch) async {
    HapticFeedback.lightImpact();
    widget.controller.replaceWatches([
      for (final candidate in widget.controller.watches)
        if (candidate.id != watch.id) candidate,
    ]);
    try {
      widget.controller.replaceWatches(
          await widget.controller.api.deleteDealWatch(watch.id));
    } catch (_) {
      // Optimistic state stands; the next refresh reconciles.
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final watches = widget.controller.watches;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.75,
            ),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(20),
              children: [
                Text('WATCHED ITEMS', style: TS.eyebrowOf(context)),
                const SizedBox(height: 4),
                const Text('Your deal alerts',
                    style:
                        TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text(
                  'Search an item on Find deals and watch it. The moment any scout or '
                  'another shopper\'s search turns up a matching deal, it lands here.',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
                ),
                const SizedBox(height: 14),
                if (watches.isEmpty)
                  Container(
                    decoration: BoxDecoration(
                      color: TS.surfaceOf(context),
                      border:
                          Border.all(color: TS.lineSoftOf(context), width: 2),
                    ),
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      'Nothing watched yet. Search for an item under Find deals — '
                      'if there is no special yet, you can watch it from there.',
                      style: TextStyle(color: TS.mutedOf(context)),
                    ),
                  ),
                for (final watch in watches)
                  _WatchCard(
                    watch: watch,
                    onDismiss:
                        watch.isUnreadAlert ? () => _dismiss(watch) : null,
                    onDelete: () => _delete(watch),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _WatchCard extends StatelessWidget {
  const _WatchCard({
    required this.watch,
    required this.onDelete,
    this.onDismiss,
  });

  final DealWatch watch;
  final VoidCallback onDelete;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final matched = watch.isMatched;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: TS.card(
        context,
        border: watch.isUnreadAlert ? TS.greenOf(context) : TS.lineOf(context),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  watch.queryText,
                  style: const TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 16),
                ),
              ),
              if (watch.isUnreadAlert)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  color: TS.greenOf(context),
                  child: Text('DEAL FOUND',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.onTertiary,
                          fontSize: 10,
                          fontWeight: FontWeight.w900)),
                ),
              IconButton(
                tooltip: 'Stop watching this item',
                onPressed: onDelete,
                icon: const Icon(Icons.delete_outline, size: 20),
              ),
            ],
          ),
          if (!matched)
            Text(
              'Still scouting. You will see an alert here the moment a deal appears.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
            ),
          for (final match in watch.matches)
            InkWell(
              onTap: match.productUrl == null
                  ? null
                  : () => showInAppBrowser(
                        context,
                        match.productUrl,
                        title: match.retailerName ?? 'Deal source',
                      ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    if (match.imageUrl != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 10),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: Image.network(
                            match.imageUrl!,
                            width: 40,
                            height: 40,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) =>
                                const SizedBox(width: 40, height: 40),
                          ),
                        ),
                      ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(match.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w600)),
                          if (match.retailerName != null)
                            Text(match.retailerName!,
                                style: TextStyle(
                                    color: TS.mutedOf(context), fontSize: 11)),
                        ],
                      ),
                    ),
                    if (match.priceText != null)
                      Text(match.priceText!,
                          style: TextStyle(
                              color: TS.redOf(context),
                              fontWeight: FontWeight.w900)),
                    if (match.productUrl != null)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Icon(Icons.open_in_new,
                            size: 13, color: TS.mutedOf(context)),
                      ),
                  ],
                ),
              ),
            ),
          if (onDismiss != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onDismiss,
                icon: const Icon(Icons.check, size: 16),
                label: const Text('Got it'),
              ),
            ),
        ],
      ),
    );
  }
}
