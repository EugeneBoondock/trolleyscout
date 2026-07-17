import 'package:flutter/material.dart';

import '../api.dart';
import '../price_compare.dart';
import '../theme.dart';

/// Pick real stores we hold deals for, type an item, and we search our own
/// deal database for each store's price. Two stores by default; any number
/// can be compared.
class AutoCompareTool extends StatefulWidget {
  const AutoCompareTool({super.key, required this.api});
  final Api api;

  @override
  State<AutoCompareTool> createState() => _AutoCompareToolState();
}

class _AutoCompareToolState extends State<AutoCompareTool> {
  final _queryController = TextEditingController();
  List<Deal> _deals = const [];
  bool _busy = true;
  // Null until the store list loads; empty afterwards is a real "none picked"
  // choice, so deselecting every store must not resurrect the defaults.
  List<String>? _selectedIds;
  AutoComparison? _result;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final result = await widget.api.discovery();
      if (!mounted) return;
      setState(() {
        _deals = result.deals;
        _selectedIds ??= defaultStoreIds(result.deals);
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  void _toggleStore(String id) {
    setState(() {
      _result = null;
      final base = _selectedIds ?? const <String>[];
      _selectedIds =
          base.contains(id) ? (base.where((s) => s != id).toList()) : [...base, id];
    });
  }

  void _compare(List<StoreOption> options) {
    final picked = _selectedIds ?? const <String>[];
    final chosen = options.where((o) => picked.contains(o.id)).toList();
    setState(() => _result = autoComparePrices(_deals, _queryController.text, chosen));
  }

  @override
  Widget build(BuildContext context) {
    final options = storeOptionsFromDeals(_deals);
    final picked = _selectedIds ?? const <String>[];
    final canCompare = _queryController.text.trim().length > 1 && picked.length >= 2;

    return Container(
      decoration: TS.card(context),
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('COMPARE', style: TS.eyebrowOf(context)),
          const SizedBox(height: 4),
          const Text('Compare a product across stores',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(
            'Pick the stores you shop at, type what you are buying, and we check our '
            'deal database for each store’s price.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
          ),
          const SizedBox(height: 12),
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (options.isEmpty)
            Text('No store prices are loaded right now. Try again shortly.',
                style: TextStyle(color: TS.mutedOf(context)))
          else ...[
            Text('Stores to compare (${picked.length} picked)',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final option in options)
                  FilterChip(
                    label: Text(option.name),
                    selected: picked.contains(option.id),
                    onSelected: (_) => _toggleStore(option.id),
                    selectedColor: TS.yellow,
                    showCheckmark: false,
                    shape: const RoundedRectangleBorder(),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _queryController,
                    decoration: const InputDecoration(
                      labelText: 'Item to compare',
                      hintText: 'e.g. white bread',
                    ),
                    onChanged: (_) => setState(() => _result = null),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    shape: const RoundedRectangleBorder(),
                  ),
                  onPressed: canCompare ? () => _compare(options) : null,
                  icon: const Icon(Icons.search, size: 16),
                  label: const Text('Compare'),
                ),
              ],
            ),
            if (picked.length < 2)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Pick at least two stores to compare.',
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 12)),
              ),
            if (_result != null) _AutoCompareResult(result: _result!),
          ],
        ],
      ),
    );
  }
}

class _AutoCompareResult extends StatelessWidget {
  const _AutoCompareResult({required this.result});
  final AutoComparison result;

  @override
  Widget build(BuildContext context) {
    if (result.foundCount == 0) {
      return Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Text(
          'No current deals match “${result.query}” at the stores you picked. Try a '
          'simpler word, or add it to your watchlist.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
        ),
      );
    }

    final cheapest =
        result.matches.firstWhere((m) => m.retailerId == result.cheapestRetailerId);

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final match in result.matches)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              decoration: BoxDecoration(
                border: Border.all(
                  color: match.isCheapest ? TS.ink : TS.lineOf(context),
                  width: 2,
                ),
              ),
              padding: const EdgeInsets.all(9),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(match.retailerName,
                            style: const TextStyle(fontWeight: FontWeight.w900)),
                        Text(
                          match.deal?.title ?? 'No match found',
                          style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  if (match.priceCents != null)
                    Text(formatCents(match.priceCents!),
                        style: const TextStyle(fontWeight: FontWeight.w900)),
                ],
              ),
            ),
          Text.rich(
            TextSpan(children: [
              TextSpan(
                text: cheapest.retailerName,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              TextSpan(text: ' is cheapest for “${result.query}”'),
              if (result.savingsCents > 0)
                TextSpan(text: ', saving you ${formatCents(result.savingsCents)}'),
              const TextSpan(text: '.'),
              if (result.missingCount > 0)
                TextSpan(
                  text: ' We hold no match at ${result.missingCount} of the stores you picked.',
                ),
            ]),
            style: const TextStyle(fontSize: 13),
          ),
        ],
      ),
    );
  }
}
