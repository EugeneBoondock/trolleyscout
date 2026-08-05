import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../basket_run.dart';
import '../currency.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';

class BasketScreen extends StatefulWidget {
  const BasketScreen({
    super.key,
    required this.api,
    this.shareBasket,
  });

  final Api api;
  final Future<void> Function(String text)? shareBasket;

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
  final Set<String> _checkedItemIds = {};

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
    setState(() {
      _checkedItemIds.remove(item.id);
      _basket = _withoutItem(basket, item);
    });
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

  Future<void> _share(Basket basket, Currency currency) async {
    final text = formatBasketShareText(
      basket,
      formatMoney: currency.format,
    );
    try {
      final override = widget.shareBasket;
      if (override != null) {
        await override(text);
      } else {
        await SharePlus.instance.share(ShareParams(
          subject: 'Trolley Scout shopping list',
          text: text,
        ));
      }
    } catch (_) {
      if (mounted) showNotice(context, 'Could not share this shopping list.');
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
    // Basket money is shopping money: it follows the shopper's own country.
    final currency = Currency.of(widget.api.effectiveCurrencyCode);
    final storeStops = buildBasketStoreStops(basket);
    final checkedCount =
        basket.items.where((item) => _checkedItemIds.contains(item.id)).length;
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
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _share(basket, currency),
              icon: const Icon(Icons.share_outlined),
              label: const Text('Share shopping list'),
            ),
          ),
          const SizedBox(height: 14),
          PaperCard(
            margin: const EdgeInsets.only(bottom: 14),
            child: _BasketSummaryGrid(
              metrics: [
                _BasketMetric(
                  label: 'Store stops',
                  value: '${storeStops.length}',
                  detail: '${basket.summary.itemCount} items',
                ),
                _BasketMetric(
                  label: 'Price coverage',
                  value:
                      '${basket.summary.knownPriceItemCount}/${basket.summary.itemCount}',
                  detail: 'items priced',
                ),
                _BasketMetric(
                  label: 'Known total',
                  value: currency.format(basket.summary.totalCents),
                ),
                _BasketMetric(
                  label: 'Savings',
                  value: currency.format(basket.summary.savingsCents),
                ),
              ],
            ),
          ),
          PaperCard(
            margin: const EdgeInsets.only(bottom: 14),
            child: Row(
              children: [
                Icon(Icons.check_circle, color: TS.greenOf(context), size: 24),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '$checkedCount of ${basket.items.length} products are in your trolley. '
                    'The checklist lasts for this shopping session.',
                    style: TextStyle(color: TS.mutedOf(context)),
                  ),
                ),
              ],
            ),
          ),
          for (var stopIndex = 0;
              stopIndex < storeStops.length;
              stopIndex++) ...[
            _StoreStopHeader(
              currency: currency,
              index: stopIndex + 1,
              stop: storeStops[stopIndex],
            ),
            for (final item in storeStops[stopIndex].items)
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
                              CheckboxListTile(
                                key: ValueKey('basket-check-${item.id}'),
                                contentPadding: EdgeInsets.zero,
                                controlAffinity:
                                    ListTileControlAffinity.leading,
                                dense: true,
                                title: Text(
                                  _checkedItemIds.contains(item.id)
                                      ? 'In trolley'
                                      : 'Mark in trolley',
                                  style: TextStyle(
                                    color: TS.greenOf(context),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                value: _checkedItemIds.contains(item.id),
                                onChanged: (_) => setState(() {
                                  if (!_checkedItemIds.add(item.id)) {
                                    _checkedItemIds.remove(item.id);
                                  }
                                }),
                              ),
                              Text(item.deal.title,
                                  style: TextStyle(
                                      decoration:
                                          _checkedItemIds.contains(item.id)
                                              ? TextDecoration.lineThrough
                                              : null,
                                      color: _checkedItemIds.contains(item.id)
                                          ? TS.mutedOf(context)
                                          : TS.inkOf(context),
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
                              key: ValueKey('basket-quantity-${item.id}'),
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
      ],
    );
  }
}

class _StoreStopHeader extends StatelessWidget {
  const _StoreStopHeader({
    required this.currency,
    required this.index,
    required this.stop,
  });

  final Currency currency;
  final int index;
  final BasketStoreStop stop;

  @override
  Widget build(BuildContext context) => PaperCard(
        margin: const EdgeInsets.only(bottom: 10, top: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: TS.yellow,
                shape: BoxShape.circle,
                border: Border.all(color: TS.inkOf(context), width: 2),
              ),
              child: Text(
                '$index',
                style: const TextStyle(
                  color: TS.ink,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('STORE STOP $index', style: TS.eyebrowOf(context)),
                  Text(
                    stop.retailerName,
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    '${stop.itemCount} ${stop.itemCount == 1 ? 'item' : 'items'} · '
                    '${stop.knownPriceItemCount} priced',
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('Known subtotal',
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 11)),
                Text(
                  stop.knownPriceItemCount == 0
                      ? 'No price'
                      : currency.format(stop.totalCents),
                  style: TextStyle(
                    color: TS.redOf(context),
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (stop.savingsCents > 0)
                  Text(
                    '${currency.format(stop.savingsCents)} saved',
                    style: TextStyle(color: TS.greenOf(context), fontSize: 11),
                  ),
              ],
            ),
          ],
        ),
      );
}

class _BasketMetric {
  const _BasketMetric({required this.label, required this.value, this.detail});

  final String label;
  final String value;
  final String? detail;
}

class _BasketSummaryGrid extends StatelessWidget {
  const _BasketSummaryGrid({required this.metrics});

  final List<_BasketMetric> metrics;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final width = (constraints.maxWidth - 12) / 2;
          return Wrap(
            spacing: 12,
            runSpacing: 14,
            children: [
              for (final metric in metrics)
                SizedBox(
                  width: width,
                  child: _Total(
                    detail: metric.detail,
                    label: metric.label,
                    value: metric.value,
                  ),
                ),
            ],
          );
        },
      );
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
  final items = basket.items.where((current) => current.id != item.id).toList();
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
    knownPriceItemCount:
        summary.knownPriceItemCount + (item.linePriceCents == null ? 0 : delta),
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
  const _Total({required this.label, required this.value, this.detail});

  final String? detail;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: TS.mutedOf(context))),
          Text(value,
              style: Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
          if (detail != null)
            Text(detail!,
                style: TextStyle(color: TS.mutedOf(context), fontSize: 11)),
        ],
      );
}
