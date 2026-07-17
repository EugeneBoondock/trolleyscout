import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';

class BasketScreen extends StatefulWidget {
  const BasketScreen({super.key, required this.api});

  final Api api;

  @override
  State<BasketScreen> createState() => _BasketScreenState();
}

class _BasketScreenState extends State<BasketScreen> {
  late Future<Basket> _future = widget.api.basket();

  void _reload() => setState(() {
        _future = widget.api.basket();
      });

  Future<void> _update(BasketItem item, int quantity) async {
    uxTap();
    try {
      final basket =
          await widget.api.updateBasketItem(item.id, quantity.clamp(1, 99));
      if (mounted) {
        setState(() {
          _future = Future.value(basket);
        });
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  Future<void> _remove(String id) async {
    try {
      final basket = await widget.api.deleteBasketItem(id);
      if (mounted) {
        setState(() {
          _future = Future.value(basket);
        });
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Basket>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Could not load your basket.', onRetry: _reload);
        }
        final basket = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Basket planner',
              title: 'Your basket',
              description:
                  'Adjust quantities and see the known total and savings before you shop.',
            ),
            if (basket.items.isEmpty)
              const EmptyCard(
                  message: 'Your basket is empty.',
                  icon: Icons.shopping_basket_outlined)
            else ...[
              PaperCard(
                margin: const EdgeInsets.only(bottom: 14),
                child: Row(
                  children: [
                    Expanded(
                        child: _Total(
                            label: 'Known total',
                            value: formatRand(basket.summary.totalCents))),
                    Expanded(
                        child: _Total(
                            label: 'Savings',
                            value: formatRand(basket.summary.savingsCents))),
                  ],
                ),
              ),
              for (final item in basket.items)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (item.deal.imageUrl != null) ...[
                            _BasketImage(
                                imageUrl: item.deal.imageUrl!,
                                title: item.deal.title),
                            const SizedBox(width: 10),
                          ],
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item.deal.retailerName.toUpperCase(),
                                    style: TS.eyebrowOf(context)),
                                Text(item.deal.title,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      if (item.deal.priceText != null)
                        Text(item.deal.priceText!,
                            style: TextStyle(
                                color: TS.redOf(context),
                                fontWeight: FontWeight.w900)),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          IconButton(
                            tooltip: 'Decrease quantity',
                            onPressed: item.quantity <= 1
                                ? null
                                : () => _update(item, item.quantity - 1),
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                          Text('${item.quantity}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 18)),
                          IconButton(
                            tooltip: 'Increase quantity',
                            onPressed: () => _update(item, item.quantity + 1),
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                          const Spacer(),
                          IconButton(
                            tooltip: 'Remove basket item',
                            onPressed: () => _remove(item.id),
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
            ],
          ],
        );
      },
    );
  }
}

class _BasketImage extends StatelessWidget {
  const _BasketImage({required this.imageUrl, required this.title});

  final String imageUrl;
  final String title;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Image.network(
          imageUrl,
          semanticLabel: title,
          width: 68,
          height: 68,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Container(
            width: 68,
            height: 68,
            color: TS.surfaceOf(context),
            child: const Icon(Icons.image_not_supported_outlined),
          ),
        ),
      );
}

class _Total extends StatelessWidget {
  const _Total({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: TS.mutedOf(context))),
          Text(value,
              style: Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
        ],
      );
}
