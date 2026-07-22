import 'package:flutter/material.dart';

import '../shop_compare.dart';
import '../theme.dart';
import '../ux.dart';

/// "Which shop is cheapest?" — the shopper types the same items at each shop,
/// and Trolley Scout totals each shop, flags the cheapest per item, and names
/// the cheapest shop overall. Ephemeral: nothing is saved.
class ShopCompareTool extends StatefulWidget {
  const ShopCompareTool({super.key});

  @override
  State<ShopCompareTool> createState() => _ShopCompareToolState();
}

class _CompareRow {
  _CompareRow(this.id, int shops)
      : name = TextEditingController(),
        prices = List.generate(shops, (_) => TextEditingController());
  final String id;
  final TextEditingController name;
  final List<TextEditingController> prices;

  void addShop() => prices.add(TextEditingController());

  void dispose() {
    name.dispose();
    for (final c in prices) {
      c.dispose();
    }
  }
}

class _ShopCompareToolState extends State<ShopCompareTool> {
  int _nextId = 0;
  late List<TextEditingController> _shops;
  late List<_CompareRow> _rows;

  @override
  void initState() {
    super.initState();
    _shops = [
      TextEditingController(text: 'Shop A'),
      TextEditingController(text: 'Shop B'),
    ];
    _rows = [_newRow(), _newRow(), _newRow()];
  }

  _CompareRow _newRow() => _CompareRow('row-${_nextId++}', _shops.length);

  @override
  void dispose() {
    for (final c in _shops) {
      c.dispose();
    }
    for (final r in _rows) {
      r.dispose();
    }
    super.dispose();
  }

  void _addRow() => setState(() => _rows.add(_newRow()));

  void _removeRow(_CompareRow row) {
    setState(() {
      _rows.remove(row);
      row.dispose();
    });
  }

  void _addShop() {
    if (_shops.length >= 4) return;
    setState(() {
      _shops.add(TextEditingController(
          text: 'Shop ${String.fromCharCode(65 + _shops.length)}'));
      for (final row in _rows) {
        row.addShop();
      }
    });
  }

  void _clear() {
    setState(() {
      for (final c in _shops) {
        c.dispose();
      }
      for (final r in _rows) {
        r.dispose();
      }
      _shops = [
        TextEditingController(text: 'Shop A'),
        TextEditingController(text: 'Shop B'),
      ];
      _rows = [_newRow(), _newRow(), _newRow()];
    });
  }

  @override
  Widget build(BuildContext context) {
    final comparison = compareShops(
      _rows
          .map((row) => CompareItemDraft(
                id: row.id,
                name: row.name.text,
                priceCents:
                    row.prices.map((c) => parsePriceInput(c.text)).toList(),
              ))
          .toList(),
      _shops.length,
    );
    final pricedRowIds = _rows
        .where((row) => row.prices.any((c) => parsePriceInput(c.text) != null))
        .map((row) => row.id)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('LIST COMPARISON', style: TS.eyebrowOf(context)),
                  const SizedBox(height: 4),
                  const Text('Which shop is cheapest?',
                      style:
                          TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
            TextButton(onPressed: _clear, child: const Text('Clear')),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Enter the same items at each shop. Trolley Scout totals each shop and '
          'shows which is cheapest. Nothing is saved.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            const SizedBox(width: 120),
            for (var i = 0; i < _shops.length; i++)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: TextField(
                    controller: _shops[i],
                    textAlign: TextAlign.center,
                    onChanged: (_) => setState(() {}),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                    decoration: InputDecoration(
                      isDense: true,
                      filled: comparison.cheapestShopIndex == i,
                      fillColor: TS.greenOf(context),
                      contentPadding: const EdgeInsets.symmetric(
                          vertical: 8, horizontal: 4),
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        for (final row in _rows)
          _compareRowWidget(row, comparison, pricedRowIds),
        const SizedBox(height: 6),
        Row(
          children: [
            SizedBox(
              width: 120,
              child: Text('TOTAL', style: TS.eyebrowOf(context)),
            ),
            for (final shop in comparison.shopTotals)
              Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  color: comparison.cheapestShopIndex == shop.shopIndex
                      ? TS.greenOf(context)
                      : TS.surfaceOf(context),
                  child: Text(
                    shop.totalCents > 0 ? formatCents(shop.totalCents) : '·',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: comparison.cheapestShopIndex == shop.shopIndex
                          ? Theme.of(context).colorScheme.onTertiary
                          : TS.inkOf(context),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _addRow,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add item'),
            ),
            if (_shops.length < 4)
              OutlinedButton.icon(
                onPressed: _addShop,
                icon: const Icon(Icons.add_business_outlined, size: 18),
                label: const Text('Add shop'),
              ),
          ],
        ),
        if (comparison.cheapestShopIndex != null &&
            comparison.savingsCents > 0) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: TS.surfaceOf(context),
              border: Border.all(color: TS.greenOf(context), width: 2),
            ),
            child: Text(
              '${_shops[comparison.cheapestShopIndex!].text} is cheapest for this list, '
              'saving you ${formatCents(comparison.savingsCents)}'
              '${comparison.hasCompleteShop ? '' : ' (some items are not priced everywhere)'}.',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ],
    );
  }

  Widget _compareRowWidget(
      _CompareRow row, ShopComparison comparison, List<String> pricedRowIds) {
    final pricedIndex = pricedRowIds.indexOf(row.id);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: row.name,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      isDense: true,
                      hintText: 'Item',
                      contentPadding:
                          EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                if (_rows.length > 1)
                  InkWell(
                    onTap: () => _removeRow(row),
                    child:
                        Icon(Icons.close, size: 16, color: TS.faintOf(context)),
                  ),
              ],
            ),
          ),
          for (var i = 0; i < _shops.length; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: TextField(
                  controller: row.prices[i],
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textAlign: TextAlign.right,
                  onChanged: (_) {
                    uxTap();
                    setState(() {});
                  },
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: 'R0',
                    filled: pricedIndex >= 0 &&
                        comparison.cheapestShopByItem.length > pricedIndex &&
                        comparison.cheapestShopByItem[pricedIndex] == i,
                    fillColor: Color.lerp(
                        TS.surfaceOf(context), TS.greenOf(context), 0.18),
                    contentPadding:
                        const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
