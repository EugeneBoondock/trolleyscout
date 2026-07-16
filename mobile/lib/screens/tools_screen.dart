import 'package:flutter/material.dart';
import '../theme.dart';
import '../unit_price.dart';

/// "Pay less at the shelf" — a unit-price checker. Shoppers punch in the price
/// and size of two or more packs and instantly see which is genuinely cheaper
/// per kg / L / unit, cutting through misleading pack sizes.
class ToolsScreen extends StatefulWidget {
  const ToolsScreen({super.key});

  @override
  State<ToolsScreen> createState() => _ToolsScreenState();
}

class _ToolsScreenState extends State<ToolsScreen> {
  int _nextId = 0;
  late final List<_PackEntry> _entries;

  @override
  void initState() {
    super.initState();
    _entries = [_newEntry(), _newEntry()];
  }

  _PackEntry _newEntry() => _PackEntry(id: 'pack-${_nextId++}', unit: PackUnit.g);

  @override
  void dispose() {
    for (final entry in _entries) {
      entry.dispose();
    }
    super.dispose();
  }

  void _addPack() => setState(() => _entries.add(_newEntry()));

  void _removePack(_PackEntry entry) {
    setState(() {
      _entries.remove(entry);
      entry.dispose();
    });
  }

  @override
  Widget build(BuildContext context) {
    final comparison = compareUnitPrices(
      _entries
          .map((e) => PackDraft(
                id: e.id,
                priceText: e.price.text,
                quantityText: e.quantity.text,
                unit: e.unit,
              ))
          .toList(),
    );
    final resultsById = {for (final r in comparison.results) r.id: r};

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('SHELF TOOLS', style: TS.eyebrow),
        const SizedBox(height: 4),
        const Text('Which pack is really cheaper?',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        const Text(
          'Big packs are not always the better deal. Enter each price and size, and Trolley Scout '
          'works out the true cost per kg, litre or unit, so you can pick the cheapest with confidence.',
          style: TextStyle(color: TS.muted),
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < _entries.length; i++)
          _PackCard(
            index: i,
            entry: _entries[i],
            result: resultsById[_entries[i].id],
            canRemove: _entries.length > 2,
            onChanged: () => setState(() {}),
            onRemove: () => _removePack(_entries[i]),
          ),
        const SizedBox(height: 4),
        OutlinedButton.icon(
          onPressed: _addPack,
          icon: const Icon(Icons.add),
          label: const Text('Add another pack'),
          style: OutlinedButton.styleFrom(
            foregroundColor: TS.ink,
            side: const BorderSide(color: TS.line, width: 2),
            shape: const RoundedRectangleBorder(),
          ),
        ),
        const SizedBox(height: 16),
        if (comparison.hasMixedUnits)
          _note('Mixing weights and volumes, compare like with like (all in g/kg, or all in ml/L).',
              TS.redBright)
        else if (comparison.bestId != null)
          _note('Cheapest per unit is highlighted below. The rest show how much more you would pay.',
              TS.green)
        else
          _note('Fill in at least two packs to see which is cheaper per unit.', TS.line),
      ],
    );
  }

  Widget _note(String text, Color color) {
    return Container(
      decoration: BoxDecoration(color: TS.surface, border: Border.all(color: color, width: 2)),
      padding: const EdgeInsets.all(12),
      child: Text(text, style: const TextStyle(color: TS.muted, fontSize: 13)),
    );
  }
}

class _PackEntry {
  _PackEntry({required this.id, required this.unit});

  final String id;
  final TextEditingController price = TextEditingController();
  final TextEditingController quantity = TextEditingController();
  PackUnit unit;

  void dispose() {
    price.dispose();
    quantity.dispose();
  }
}

class _PackCard extends StatelessWidget {
  const _PackCard({
    required this.index,
    required this.entry,
    required this.result,
    required this.canRemove,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final _PackEntry entry;
  final PackResult? result;
  final bool canRemove;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final isBest = result?.isBest ?? false;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: TS.card(color: isBest ? const Color(0xFFF2FBF5) : null),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('PACK ${index + 1}', style: TS.eyebrow),
              if (isBest) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  color: TS.green,
                  child: const Text('CHEAPEST',
                      style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                ),
              ],
              const Spacer(),
              if (canRemove)
                InkWell(
                  onTap: onRemove,
                  child: const Icon(Icons.close, size: 18, color: TS.faint),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: entry.price,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => onChanged(),
                  decoration: const InputDecoration(
                    labelText: 'Price',
                    prefixText: 'R ',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: entry.quantity,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => onChanged(),
                  decoration: const InputDecoration(
                    labelText: 'Size',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              DropdownButton<PackUnit>(
                value: entry.unit,
                underline: const SizedBox.shrink(),
                onChanged: (unit) {
                  if (unit != null) {
                    entry.unit = unit;
                    onChanged();
                  }
                },
                items: [
                  for (final unit in PackUnit.values)
                    DropdownMenuItem(value: unit, child: Text(packUnitLabel(unit))),
                ],
              ),
            ],
          ),
          if (result != null) ...[
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  formatUnitPrice(result!.unitPriceCents, result!.baseUnit),
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: isBest ? TS.green : TS.ink,
                  ),
                ),
                const SizedBox(width: 8),
                if (result!.percentMoreThanBest != null)
                  Text('${result!.percentMoreThanBest}% more',
                      style: const TextStyle(color: TS.redBright, fontSize: 13, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
