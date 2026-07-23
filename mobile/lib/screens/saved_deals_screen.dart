import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/in_app_browser.dart';

class SavedDealsScreen extends StatefulWidget {
  const SavedDealsScreen({super.key, required this.api, this.onFindDeals});

  final Api api;

  /// Empty-state CTA: jump to Find deals so a new member isn't stranded.
  final VoidCallback? onFindDeals;

  @override
  State<SavedDealsScreen> createState() => _SavedDealsScreenState();
}

class _SavedDealsScreenState extends State<SavedDealsScreen> {
  late Future<List<SavedDeal>> _future = widget.api.savedDeals();
  final Set<String> _busyIds = {};

  void _reload() => setState(() {
        _future = widget.api.savedDeals();
      });

  Future<void> _remove(SavedDeal deal) async {
    if (_busyIds.contains(deal.id)) return;
    setState(() => _busyIds.add(deal.id));
    try {
      final deals = await widget.api.deleteSavedDeal(deal.id);
      if (mounted) {
        setState(() {
          _future = Future.value(deals);
        });
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(
            content: Text('${deal.title} removed.'),
            action: SnackBarAction(
              label: 'Undo',
              onPressed: () => _restore(deal),
            ),
          ));
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _busyIds.remove(deal.id));
    }
  }

  Future<void> _restore(SavedDeal deal) async {
    try {
      final deals = await widget.api.saveDeal(deal);
      if (mounted) {
        setState(() {
          _future = Future.value(deals);
        });
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  Future<void> _addToBasket(String id) async {
    try {
      await widget.api.addBasketItem(id);
      if (mounted) showNotice(context, 'Added to basket.');
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<SavedDeal>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          final error = snapshot.error;
          return ErrorPane(
            message: 'Could not load saved deals.',
            detail: error is ApiException ? error.message : null,
            onRetry: _reload,
          );
        }
        final deals = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Member list',
              title: 'Saved deals',
              description:
                  'Keep official deals for later and add them to your basket plan.',
            ),
            if (deals.isEmpty)
              EmptyCard(
                message: 'No saved deals yet. Save any deal to plan your '
                    'basket around it.',
                icon: Icons.wallet_outlined,
                action: widget.onFindDeals == null
                    ? null
                    : FilledButton(
                        onPressed: widget.onFindDeals,
                        child: const Text('Find deals'),
                      ),
              )
            else
              for (final deal in deals)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(deal.retailerName.toUpperCase(),
                          style: TS.eyebrowOf(context)),
                      const SizedBox(height: 4),
                      Text(deal.title,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16)),
                      if (deal.priceText != null)
                        Text(deal.priceText!,
                            style: TextStyle(
                                color: TS.redOf(context),
                                fontSize: 22,
                                fontWeight: FontWeight.w900)),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FilledButton.icon(
                            onPressed: () => _addToBasket(deal.id),
                            icon: const Icon(Icons.add_shopping_cart),
                            label: const Text('Add to basket'),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => showInAppBrowser(
                              context,
                              deal.productUrl ?? deal.sourceUrl,
                              title: deal.retailerName,
                            ),
                            icon: const Icon(Icons.open_in_new),
                            label: const Text('Open source'),
                          ),
                          IconButton(
                            tooltip: 'Remove saved deal',
                            onPressed: _busyIds.contains(deal.id)
                                ? null
                                : () => _remove(deal),
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
          ],
        );
      },
    );
  }
}
