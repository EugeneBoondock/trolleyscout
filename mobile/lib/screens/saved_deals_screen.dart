import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';

class SavedDealsScreen extends StatefulWidget {
  const SavedDealsScreen({super.key, required this.api});

  final Api api;

  @override
  State<SavedDealsScreen> createState() => _SavedDealsScreenState();
}

class _SavedDealsScreenState extends State<SavedDealsScreen> {
  late Future<List<SavedDeal>> _future = widget.api.savedDeals();

  void _reload() => setState(() {
        _future = widget.api.savedDeals();
      });

  Future<void> _remove(String id) async {
    try {
      final deals = await widget.api.deleteSavedDeal(id);
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
          return ErrorPane(
              message: 'Could not load saved deals.', onRetry: _reload);
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
              const EmptyCard(
                  message: 'No saved deals yet.', icon: Icons.wallet_outlined)
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
                            onPressed: () =>
                                openExternal(deal.productUrl ?? deal.sourceUrl),
                            icon: const Icon(Icons.open_in_new),
                            label: const Text('Open source'),
                          ),
                          IconButton(
                            tooltip: 'Remove saved deal',
                            onPressed: () => _remove(deal.id),
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
