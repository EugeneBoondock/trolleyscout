import 'dart:async';

import 'package:flutter/material.dart';

import '../shopper_calculator.dart';
import '../theme.dart';
import '../ux.dart';

class ShopperCalculatorButton extends StatelessWidget {
  const ShopperCalculatorButton({
    super.key,
    required this.store,
  });

  final ShopperCalculatorStore store;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: store,
        builder: (context, _) => Semantics(
          button: true,
          label: store.totalCents == 0
              ? 'Open shopper calculator'
              : 'Open shopper calculator, current total ${formatShopperMoney(store.totalCents)}',
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              FloatingActionButton(
                key: const ValueKey('shopper-calculator-button'),
                tooltip: 'Open shopper calculator',
                backgroundColor: TS.yellow,
                foregroundColor: TS.ink,
                onPressed: () {
                  uxTap();
                  showShopperCalculator(context, store);
                },
                child: const Icon(Icons.calculate_outlined, size: 28),
              ),
              if (store.itemCount > 0)
                Positioned(
                  right: -7,
                  top: -7,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 24),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: TS.redOf(context),
                      border:
                          Border.all(color: TS.surfaceOf(context), width: 2),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      '${store.itemCount}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

Future<void> showShopperCalculator(
  BuildContext context,
  ShopperCalculatorStore store,
) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: TS.surfaceOf(context),
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.94,
        child: _ShopperCalculatorSheet(store: store),
      ),
    );

class _ShopperCalculatorSheet extends StatefulWidget {
  const _ShopperCalculatorSheet({required this.store});

  final ShopperCalculatorStore store;

  @override
  State<_ShopperCalculatorSheet> createState() =>
      _ShopperCalculatorSheetState();
}

class _ShopperCalculatorSheetState extends State<_ShopperCalculatorSheet> {
  final _label = TextEditingController();
  final _price = TextEditingController();
  final _quantity = TextEditingController(text: '1');
  final _packUnits = TextEditingController();
  late final _budget = TextEditingController(
    text: widget.store.budgetCents == null
        ? ''
        : (widget.store.budgetCents! / 100).toStringAsFixed(2),
  );
  int _discount = 0;
  bool _includeVat = true;
  bool? _zeroRatedOverride;

  int? get _enteredPrice => parseShopperMoneyToCents(_price.text);
  int? get _discountedPrice {
    final price = _enteredPrice;
    return price == null ? null : discountedShopperPrice(price, _discount);
  }

  bool get _zeroRated =>
      _zeroRatedOverride ?? isLikelyZeroRatedShopperItem(_label.text);

  int? get _vatCents {
    final price = _discountedPrice;
    if (price == null || _zeroRated) return price == null ? null : 0;
    return _includeVat
        ? shopperVatFromInclusive(price)
        : shopperVatOnExclusive(price);
  }

  int? get _payPrice {
    final price = _discountedPrice;
    final vat = _vatCents;
    if (price == null || vat == null) return null;
    return _includeVat ? price : price + vat;
  }

  int? get _unitPrice {
    final pay = _payPrice;
    final units = num.tryParse(_packUnits.text.replaceAll(',', '.'));
    return pay == null || units == null ? null : shopperUnitPrice(pay, units);
  }

  @override
  void dispose() {
    _label.dispose();
    _price.dispose();
    _quantity.dispose();
    _packUnits.dispose();
    _budget.dispose();
    super.dispose();
  }

  void _addItem() {
    final payPrice = _payPrice;
    final quantity = int.tryParse(_quantity.text.trim());
    if (payPrice == null || payPrice <= 0) {
      _notice('Enter a valid item price.');
      return;
    }
    if (quantity == null || quantity < 1 || quantity > 99) {
      _notice('Use a quantity from 1 to 99.');
      return;
    }
    unawaited(widget.store.addLine(
      label: _label.text,
      priceCents: payPrice,
      quantity: quantity,
      vatCents: _vatCents ?? 0,
      vatAdded: !_includeVat && !_zeroRated,
      zeroRated: _zeroRated,
    ));
    uxSuccess();
    setState(() {
      _label.clear();
      _price.clear();
      _quantity.text = '1';
      _packUnits.clear();
      _discount = 0;
      _includeVat = true;
      _zeroRatedOverride = null;
    });
  }

  void _setBudget() {
    final budget = parseShopperMoneyToCents(_budget.text);
    if (_budget.text.trim().isNotEmpty && budget == null) {
      _notice('Enter a valid budget.');
      return;
    }
    unawaited(widget.store.setBudgetCents(budget));
    uxTap();
    FocusScope.of(context).unfocus();
  }

  void _notice(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: widget.store,
        builder: (context, _) => Column(
          key: const ValueKey('shopper-calculator-sheet'),
          children: [
            _buildHeader(context),
            Divider(height: 1, color: TS.lineSoftOf(context)),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
                children: [
                  _buildBudget(context),
                  const SizedBox(height: 12),
                  _buildItemEntry(context),
                  const SizedBox(height: 12),
                  _buildTrolley(context),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _buildHeader(BuildContext context) {
    final remaining = widget.store.remainingBudgetCents;
    final overBudget = remaining != null && remaining < 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: TS.yellow,
                  border: Border.all(color: TS.ink),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Icon(Icons.calculate_outlined, color: TS.ink),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Shopper calculator',
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.merge(TS.display),
                    ),
                    Text(
                      'Track your trolley as you shop',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Close calculator',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: TS.surfaceSoftOf(context),
              border: Border.all(color: TS.lineSoftOf(context)),
              borderRadius: BorderRadius.circular(TS.controlRadius),
            ),
            child: Row(
              children: [
                _SummaryValue(
                  label: 'TROLLEY TOTAL',
                  value: formatShopperMoney(widget.store.totalCents),
                ),
                _summaryDivider(context),
                _SummaryValue(
                  label: 'ITEMS',
                  value: '${widget.store.itemCount}',
                ),
                _summaryDivider(context),
                _SummaryValue(
                  label: overBudget ? 'OVER BUDGET' : 'BUDGET LEFT',
                  value: remaining == null
                      ? 'Set one'
                      : formatShopperMoney(remaining.abs()),
                  valueColor: overBudget ? TS.redOf(context) : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryDivider(BuildContext context) => Container(
        width: 1,
        height: 38,
        color: TS.lineSoftOf(context),
        margin: const EdgeInsets.symmetric(horizontal: 8),
      );

  Widget _buildBudget(BuildContext context) => _CalculatorCard(
        title: 'Stay on budget',
        subtitle: 'See what remains before reaching the till.',
        icon: Icons.account_balance_wallet_outlined,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                key: const Key('calculator-budget'),
                controller: _budget,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _setBudget(),
                decoration: const InputDecoration(
                  labelText: 'Shopping budget',
                  prefixText: 'R ',
                ),
              ),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: FilledButton(
                key: const Key('calculator-set-budget'),
                onPressed: _setBudget,
                child: const Text('Set'),
              ),
            ),
          ],
        ),
      );

  Widget _buildItemEntry(BuildContext context) {
    final payPrice = _payPrice;
    final unitPrice = _unitPrice;
    return _CalculatorCard(
      title: 'Add an item',
      subtitle: 'Check a discount or unit price before it enters your total.',
      icon: Icons.add_shopping_cart_rounded,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const Key('calculator-item-label'),
            controller: _label,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() => _zeroRatedOverride = null),
            decoration: const InputDecoration(
              labelText: 'Item name (optional)',
              hintText: 'Milk, bread, soap...',
            ),
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 2,
                child: TextField(
                  key: const Key('calculator-item-price'),
                  controller: _price,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Shelf price',
                    prefixText: 'R ',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  key: const Key('calculator-item-quantity'),
                  controller: _quantity,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'Qty'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text('QUICK DISCOUNT',
              style: TS.eyebrowOf(context).copyWith(fontSize: 9)),
          const SizedBox(height: 7),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              for (final percent in const [0, 10, 20, 25, 30, 50])
                ChoiceChip(
                  key: Key('calculator-discount-$percent'),
                  label: Text(percent == 0 ? 'Shelf price' : '-$percent%'),
                  selected: _discount == percent,
                  onSelected: (_) => setState(() => _discount = percent),
                ),
            ],
          ),
          if (payPrice != null) ...[
            const SizedBox(height: 9),
            Text(
              _discount == 0
                  ? 'Shelf price ${formatShopperMoney(payPrice)} each'
                  : 'Pay ${formatShopperMoney(payPrice)} each',
              style: TextStyle(
                color:
                    _discount == 0 ? TS.mutedOf(context) : TS.greenOf(context),
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: TS.surfaceSoftOf(context),
              border: Border.all(color: TS.lineSoftOf(context)),
              borderRadius: BorderRadius.circular(TS.controlRadius),
            ),
            child: Column(
              children: [
                CheckboxListTile(
                  key: const Key('calculator-include-vat'),
                  value: _includeVat,
                  onChanged: (value) =>
                      setState(() => _includeVat = value ?? true),
                  title: const Text(
                    'Include VAT',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: const Text(
                    'Checked for normal shelf prices. Untick when the entered price excludes VAT.',
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                Divider(height: 1, color: TS.lineSoftOf(context)),
                CheckboxListTile(
                  key: const Key('calculator-zero-rated'),
                  value: _zeroRated,
                  onChanged: (value) =>
                      setState(() => _zeroRatedOverride = value ?? false),
                  title: const Text(
                    'Zero-rated item',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    isLikelyZeroRatedShopperItem(_label.text)
                        ? 'Detected from the item name. Check the shelf label if the product is prepared or flavoured.'
                        : 'Use for qualifying basic foods and other zero-rated goods.',
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                ),
              ],
            ),
          ),
          if (payPrice != null && _vatCents != null) ...[
            const SizedBox(height: 9),
            Text(
              _zeroRated
                  ? 'VAT 0% · no VAT added'
                  : _includeVat
                      ? 'Includes ${formatShopperMoney(_vatCents!)} VAT at 15%'
                      : 'Adds ${formatShopperMoney(_vatCents!)} VAT at 15%',
              style: TextStyle(
                color: _zeroRated ? TS.greenOf(context) : TS.mutedOf(context),
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _packUnits,
            key: const Key('calculator-pack-units'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.done,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Pack size for unit check (optional)',
              hintText: '6 cans, 12 rolls, 1.5 kg',
              helperText: unitPrice == null
                  ? 'Enter the number of units in one pack.'
                  : '${formatShopperMoney(unitPrice)} per unit',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const Key('calculator-add-item'),
            onPressed: _addItem,
            icon: const Icon(Icons.add_rounded),
            label: Text(payPrice == null
                ? 'Add to trolley total'
                : 'Add ${formatShopperMoney(payPrice)} each'),
          ),
        ],
      ),
    );
  }

  Widget _buildTrolley(BuildContext context) => _CalculatorCard(
        title: 'Your trolley',
        subtitle: widget.store.lines.isEmpty
            ? 'Items you add will appear here.'
            : '${widget.store.itemCount} items tracked during this shop.',
        icon: Icons.shopping_cart_checkout_rounded,
        trailing: widget.store.lines.isEmpty
            ? null
            : PopupMenuButton<String>(
                tooltip: 'Trolley actions',
                onSelected: (value) {
                  if (value == 'undo') unawaited(widget.store.undo());
                  if (value == 'clear') unawaited(widget.store.clear());
                },
                itemBuilder: (context) => [
                  PopupMenuItem(
                    value: 'undo',
                    enabled: widget.store.canUndo,
                    child: const Text('Undo removal'),
                  ),
                  const PopupMenuItem(
                    value: 'clear',
                    child: Text('Clear trolley'),
                  ),
                ],
              ),
        child: widget.store.lines.isEmpty
            ? Container(
                padding: const EdgeInsets.symmetric(vertical: 18),
                alignment: Alignment.center,
                child: Text(
                  'Start with the next item you pick up.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
              )
            : Column(
                children: [
                  for (final line in widget.store.lines.reversed.take(12))
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        line.label,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text(
                        '${formatShopperMoney(line.priceCents)} × ${line.quantity}'
                        '${line.zeroRated ? ' · VAT 0%' : line.vatCents > 0 ? ' · VAT ${line.vatAdded ? 'added' : 'included'}' : ''}',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            formatShopperMoney(line.lineTotalCents),
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          IconButton(
                            tooltip: 'Remove ${line.label}',
                            onPressed: () {
                              unawaited(widget.store.removeLine(line.id));
                              uxTap();
                            },
                            icon: const Icon(Icons.close_rounded, size: 19),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
      );
}

class _CalculatorCard extends StatelessWidget {
  const _CalculatorCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.child,
    this.trailing,
  });

  final Widget child;
  final IconData icon;
  final String subtitle;
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          border: Border.all(color: TS.lineSoftOf(context)),
          borderRadius: BorderRadius.circular(TS.panelRadius),
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0x44000000)
                  : const Color(0x101C1710),
              offset: const Offset(0, 3),
              blurRadius: 10,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: TS.redOf(context), size: 21),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(fontWeight: FontWeight.w900)),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontSize: 12,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: 12),
            child,
          ],
        ),
      );
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TS.eyebrowOf(context).copyWith(fontSize: 8),
            ),
            const SizedBox(height: 3),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: valueColor,
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      );
}
