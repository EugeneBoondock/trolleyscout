import 'package:flutter/material.dart';

import '../assisted_store_cart.dart';
import '../store_carts.dart';
import '../theme.dart';
import 'in_app_browser.dart';

/// Every shop Mr Scout has put something into, and what went in.
///
/// One sheet rather than one cart: a shopper filling a Pick n Pay basket and a
/// Takealot basket in the same evening has two real carts, and the thing they
/// need is to see which is which and jump to the right shop to pay.
Future<void> showStoreCartsSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const StoreCartsSheet(),
  );
}

class StoreCartsSheet extends StatefulWidget {
  const StoreCartsSheet({super.key});

  @override
  State<StoreCartsSheet> createState() => _StoreCartsSheetState();
}

class _StoreCartsSheetState extends State<StoreCartsSheet> {
  final StoreCartStore _carts = StoreCartStore.instance;

  @override
  void initState() {
    super.initState();
    _carts.addListener(_onChanged);
    _carts.load();
  }

  @override
  void dispose() {
    _carts.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _openCart(StoreCart cart) async {
    final first = Uri.tryParse(cart.lines.first.productUrl);
    if (first == null) return;
    await showInAppBrowser(
      context,
      checkoutUriFor(first).toString(),
      title: '${cart.storeName} cart',
    );
  }

  @override
  Widget build(BuildContext context) {
    final carts = _carts.carts;
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.78,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'YOUR STORE CARTS',
                          style: TS.eyebrowOf(context).copyWith(fontSize: 9),
                        ),
                        Text(
                          carts.isEmpty
                              ? 'Nothing in a store cart yet'
                              : '${_carts.totalItemCount} ${_carts.totalItemCount == 1 ? 'item' : 'items'} across ${carts.length} ${carts.length == 1 ? 'shop' : 'shops'}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (carts.isNotEmpty)
                    TextButton(
                      key: const ValueKey('store-carts-clear-all'),
                      onPressed: _carts.clearAll,
                      child: const Text('Clear all'),
                    ),
                ],
              ),
            ),
            if (carts.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 26),
                child: Text(
                  'Ask Mr Scout to add something to a shop\'s cart "add the '
                  'cheapest 5kg braai pack to my Pick n Pay cart" and each '
                  'shop you fill shows up here.',
                  style: TextStyle(
                    color: TS.mutedOf(context),
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              )
            else
              Flexible(
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 22),
                  itemCount: carts.length,
                  itemBuilder: (context, index) => _StoreCartCard(
                    cart: carts[index],
                    onOpen: () => _openCart(carts[index]),
                    onClear: () => _carts.clearStore(carts[index].storeId),
                    onRemove: (line) => _carts.removeLine(
                      carts[index].storeId,
                      line.productUrl,
                    ),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
              child: Text(
                'This is what Mr Scout put in each shop. The shop\'s own cart is '
                'the final word open it to check quantities and pay.',
                style: TextStyle(
                  color: TS.mutedOf(context),
                  fontSize: 10,
                  height: 1.3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoreCartCard extends StatelessWidget {
  const _StoreCartCard({
    required this.cart,
    required this.onOpen,
    required this.onClear,
    required this.onRemove,
  });

  final StoreCart cart;
  final VoidCallback onOpen;
  final VoidCallback onClear;
  final ValueChanged<StoreCartLine> onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
      decoration: BoxDecoration(
        border: Border.all(color: TS.lineSoftOf(context)),
        borderRadius: BorderRadius.circular(TS.panelRadius),
        color: TS.surfaceOf(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: TS.surfaceSoftOf(context),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.storefront_outlined,
                    size: 18, color: TS.mutedOf(context)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      cart.storeName,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    Text(
                      '${cart.itemCount} ${cart.itemCount == 1 ? 'item' : 'items'}',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 18),
                onPressed: onClear,
                tooltip: 'Forget ${cart.storeName} list',
              ),
            ],
          ),
          const SizedBox(height: 6),
          for (final line in cart.lines)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Text(
                    '${line.quantity}x',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      line.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                  if (line.priceText != null) ...[
                    const SizedBox(width: 8),
                    Text(
                      line.priceText!,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.close, size: 15),
                    onPressed: () => onRemove(line),
                    tooltip: 'Remove from this list',
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onOpen,
              icon: const Icon(Icons.open_in_new, size: 18),
              label: Text('Open the ${cart.storeName} cart'),
            ),
          ),
        ],
      ),
    );
  }
}
