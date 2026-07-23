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
  late Future<Basket> _future = _load();
  // Once the basket has loaded once, further changes (quantity, remove,
  // undo) are applied to this local copy immediately — optimistically —
  // and reconciled with the server response in the background. Only the
  // very first load (or an explicit retry after a failed load) goes through
  // the FutureBuilder below.
  Basket? _basket;

  Future<Basket> _load() {
    final future = widget.api.basket();
    future.then((basket) {
      if (mounted) setState(() => _basket = basket);
    }).catchError((_) {
      // Surfaced by the FutureBuilder's error branch below.
    });
    return future;
  }

  void _reload() => setState(() {
        _basket = null;
        _future = _load();
      });

  Future<void> _update(BasketItem item, int quantity) async {
    final basket = _basket;
    if (basket == null) return;
    final clamped = quantity.clamp(1, 99);
    if (clamped == item.quantity) return;
    uxTap();
    final previous = basket;
    setState(() => _basket = _withQuantity(basket, item, clamped));
    try {
      final updated = await widget.api.updateBasketItem(item.id, clamped);
      if (mounted) setState(() => _basket = updated);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _basket = previous);
        showNotice(context, error.message);
      }
    }
  }

  Future<void> _remove(BasketItem item) async {
    final basket = _basket;
    if (basket == null) return;
    final previous = basket;
    setState(() => _basket = _withoutItem(basket, item));
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text('${item.deal.title} removed.'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => _restore(item),
        ),
      ));
    try {
      final updated = await widget.api.deleteBasketItem(item.id);
      if (mounted) setState(() => _basket = updated);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _basket = previous);
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        showNotice(context, error.message);
      }
    }
  }

  Future<void> _restore(BasketItem item) async {
    try {
      final basket = await widget.api
          .addBasketItem(item.savedDealId, quantity: item.quantity);
      if (mounted) setState(() => _basket = basket);
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final basket = _basket;
    if (basket != null) return _body(basket);
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
        return _body(snapshot.data!);
      },
    );
  }

  Widget _body(Basket basket) {
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
                      Semantics(
                        label: 'Quantity ${item.quantity}',
                        child: Text('${item.quantity}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 18)),
                      ),
                      IconButton(
                        tooltip: 'Increase quantity',
                        onPressed: () => _update(item, item.quantity + 1),
                        icon: const Icon(Icons.add_circle_outline),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: 'Remove basket item',
                        onPressed: () => _remove(item),
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
  }
}

/// Rebuilds [basket] with [item]'s quantity set to [quantity], scaling that
/// item's line price/saving and the basket summary proportionally. This is a
/// best-effort client-side estimate shown only until the server's response
/// (the source of truth) lands and replaces it.
Basket _withQuantity(Basket basket, BasketItem item, int quantity) {
  final items = [
    for (final current in basket.items)
      current.id == item.id ? _scaledItem(current, quantity) : current,
  ];
  return Basket(
    items: items,
    summary: _adjustSummary(basket.summary, item, quantity),
  );
}

/// Rebuilds [basket] with [item] removed, adjusting the summary to match.
Basket _withoutItem(Basket basket, BasketItem item) {
  final items =
      basket.items.where((current) => current.id != item.id).toList();
  return Basket(
    items: items,
    summary: _adjustSummary(basket.summary, item, 0),
  );
}

BasketItem _scaledItem(BasketItem item, int quantity) {
  if (item.quantity == quantity) return item;
  return BasketItem(
    id: item.id,
    savedDealId: item.savedDealId,
    quantity: quantity,
    deal: item.deal,
    linePriceCents: _scaledCents(item.linePriceCents, item.quantity, quantity),
    lineSavingCents:
        _scaledCents(item.lineSavingCents, item.quantity, quantity),
  );
}

int? _scaledCents(int? lineCents, int fromQuantity, int toQuantity) {
  if (lineCents == null || fromQuantity <= 0) return lineCents;
  return (lineCents / fromQuantity * toQuantity).round();
}

BasketSummary _adjustSummary(
    BasketSummary summary, BasketItem item, int newQuantity) {
  final delta = newQuantity - item.quantity;
  if (delta == 0) return summary;
  final priceDelta = _scaledDelta(item.linePriceCents, item.quantity, delta);
  final savingDelta = _scaledDelta(item.lineSavingCents, item.quantity, delta);
  return BasketSummary(
    itemCount: summary.itemCount + delta,
    knownPriceItemCount: summary.knownPriceItemCount,
    totalCents: summary.totalCents + (priceDelta ?? 0),
    savingsCents: summary.savingsCents + (savingDelta ?? 0),
  );
}

int? _scaledDelta(int? lineCents, int fromQuantity, int delta) {
  if (lineCents == null || fromQuantity <= 0) return null;
  return (lineCents / fromQuantity * delta).round();
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
          cacheWidth: 204,
          cacheHeight: 204,
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
