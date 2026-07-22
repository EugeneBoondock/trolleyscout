import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'in_app_browser.dart';

/// Searches regular products and promotions at each selected retailer when
/// the shopper asks. Results come from official retailer APIs and pages.
class AutoCompareTool extends StatefulWidget {
  const AutoCompareTool({super.key, required this.api});
  final Api api;

  @override
  State<AutoCompareTool> createState() => _AutoCompareToolState();
}

class _AutoCompareToolState extends State<AutoCompareTool> {
  final _queryController = TextEditingController();
  List<Retailer> _retailers = const [];
  bool _busy = true;
  bool _searching = false;
  String? _error;
  List<String>? _selectedIds;
  ProductComparisonResult? _result;

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
      final result = await widget.api.retailers();
      if (!mounted) return;
      setState(() {
        _retailers = result.retailers;
        _selectedIds ??=
            result.retailers.take(2).map((store) => store.id).toList();
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  void _toggleStore(String id) {
    setState(() {
      _error = null;
      _result = null;
      final base = _selectedIds ?? const <String>[];
      _selectedIds = base.contains(id)
          ? base.where((storeId) => storeId != id).toList()
          : [...base, id];
    });
  }

  Future<void> _compare() async {
    final picked = _selectedIds ?? const <String>[];
    setState(() {
      _error = null;
      _result = null;
      _searching = true;
    });

    try {
      final result = await widget.api.searchProductPrices(
        query: _queryController.text,
        retailerIds: picked,
      );
      if (mounted) setState(() => _result = result);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not search those stores right now. Try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final picked = _selectedIds ?? const <String>[];
    final canCompare = _queryController.text.trim().length > 1 &&
        picked.length >= 2 &&
        !_searching;

    return Container(
      decoration: TS.card(context),
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('COMPARE', style: TS.eyebrowOf(context)),
          const SizedBox(height: 4),
          const Text(
            'Compare a product across stores',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'Pick the stores you shop at and type what you are buying. We search '
            'regular products and promotions at those stores now.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
          ),
          const SizedBox(height: 12),
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_retailers.isEmpty)
            Text(
              'No stores are available right now. Try again shortly.',
              style: TextStyle(color: TS.mutedOf(context)),
            )
          else ...[
            Text(
              'Stores to compare (${picked.length} picked)',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final retailer in _retailers)
                  FilterChip(
                    label: Text(retailer.name),
                    labelStyle: TextStyle(
                      color: picked.contains(retailer.id)
                          ? TS.ink
                          : TS.inkOf(context),
                    ),
                    selected: picked.contains(retailer.id),
                    onSelected: (_) => _toggleStore(retailer.id),
                    selectedColor: TS.yellow,
                    showCheckmark: false,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(TS.controlRadius),
                    ),
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
                    onChanged: (_) => setState(() {
                      _error = null;
                      _result = null;
                    }),
                    onSubmitted: (_) {
                      if (canCompare) _compare();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(TS.controlRadius),
                    ),
                  ),
                  onPressed: canCompare ? _compare : null,
                  icon: _searching
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.search, size: 16),
                  label: Text(_searching ? 'Searching' : 'Compare'),
                ),
              ],
            ),
            if (picked.length < 2)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Pick at least two stores to compare.',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  _error!,
                  style: TextStyle(color: TS.redOf(context), fontSize: 13),
                ),
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
  final ProductComparisonResult result;

  @override
  Widget build(BuildContext context) {
    final cheapestMatches = result.cheapestRetailerId == null
        ? const <RetailerProductSearchMatch>[]
        : result.matches
            .where((match) => match.retailerId == result.cheapestRetailerId)
            .toList();
    final cheapest = cheapestMatches.isEmpty ? null : cheapestMatches.first;

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final match in result.matches)
            InkWell(
              borderRadius: BorderRadius.circular(TS.controlRadius),
              onTap: match.productUrl == null
                  ? null
                  : () => showInAppBrowser(
                        context,
                        match.productUrl,
                        title: match.retailerName,
                      ),
              child: Container(
                margin: const EdgeInsets.only(bottom: 6),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: match.isCheapest
                        ? TS.greenOf(context)
                        : TS.lineOf(context),
                    width: 2,
                  ),
                  borderRadius: BorderRadius.circular(TS.controlRadius),
                ),
                padding: const EdgeInsets.all(9),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            match.retailerName,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            match.status == 'unavailable'
                                ? 'No verified live price returned'
                                : match.title ?? 'Product found',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: TS.mutedOf(context),
                              fontSize: 12,
                            ),
                          ),
                          if (match.status == 'found')
                            Text(
                              'Product found, live price unavailable',
                              style: TextStyle(
                                color: TS.mutedOf(context),
                                fontSize: 11,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (match.priceCents != null)
                      Text(
                        _formatMoney(match.priceCents!, result.country),
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                  ],
                ),
              ),
            ),
          if (result.pricedCount == 0)
            Text(
              result.foundCount > 0
                  ? 'We found an official product page for “${result.query}”, but no selected store returned a live price.'
                  : 'The selected stores returned no verified live price for “${result.query}” right now.',
              style: const TextStyle(fontSize: 13),
            )
          else if (result.pricedCount == 1)
            Text(
              'Only one selected store returned a live price for “${result.query}”. '
              'We need at least two live prices before naming the cheapest.',
              style: const TextStyle(fontSize: 13),
            )
          else if (cheapest != null)
            Text.rich(
              TextSpan(children: [
                TextSpan(
                  text: cheapest.retailerName,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                TextSpan(text: ' is cheapest for “${result.query}”'),
                if (result.savingsCents > 0)
                  TextSpan(
                    text:
                        ', saving you ${_formatMoney(result.savingsCents, result.country)}',
                  ),
                const TextSpan(text: '.'),
                if (result.unavailableCount > 0)
                  TextSpan(
                    text: ' ${result.unavailableCount} selected '
                        '${result.unavailableCount == 1 ? 'store did' : 'stores did'} '
                        'not return a verified live price.',
                  ),
              ]),
              style: const TextStyle(fontSize: 13),
            ),
        ],
      ),
    );
  }
}

String _formatMoney(int cents, CountryOption country) {
  const symbols = {
    'EUR': '€',
    'GBP': '£',
    'USD': r'$',
    'ZAR': 'R',
    'ZWG': 'ZiG ',
  };
  final symbol =
      symbols[country.currencyCode.toUpperCase()] ?? '${country.currencyCode} ';
  return '$symbol${(cents / 100).toStringAsFixed(2)}';
}
