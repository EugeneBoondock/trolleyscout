import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../member_state_sync.dart';
import '../theme.dart';
import 'common.dart' show formatMoney;
import 'in_app_browser.dart';

const _maxCompareRetailers = 16;

class _CompareRetailerSelection {
  const _CompareRetailerSelection({required this.ids, required this.updatedAt});

  final List<String> ids;
  final int updatedAt;

  Map<String, Object> toJson() => {'ids': ids, 'updatedAt': updatedAt};
}

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
  Future<void> _localSelectionSaveQueue = Future<void>.value();
  Future<void> _remoteSelectionSaveQueue = Future<void>.value();
  int _lastSelectionUpdatedAt = 0;

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
      final available = result.retailers.map((store) => store.id).toSet();
      final stored = await _loadStoredSelection(available);
      if (!mounted) return;
      _lastSelectionUpdatedAt = stored == null
          ? _lastSelectionUpdatedAt
          : math.max(_lastSelectionUpdatedAt, stored.updatedAt);
      setState(() {
        _retailers = result.retailers;
        _selectedIds ??= stored?.ids ??
            result.retailers.take(2).map((store) => store.id).toList();
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  void _toggleStore(String id) {
    final current = _selectedIds ?? const <String>[];
    if (!current.contains(id) && current.length >= _maxCompareRetailers) {
      setState(() {
        _error = 'Choose up to $_maxCompareRetailers stores at a time.';
        _result = null;
      });
      return;
    }
    final next = current.contains(id)
        ? current.where((storeId) => storeId != id).toList()
        : [...current, id];
    setState(() {
      _error = null;
      _result = null;
      _selectedIds = next;
    });
    final updatedAt = math.max(
      DateTime.now().millisecondsSinceEpoch,
      _lastSelectionUpdatedAt + 1,
    );
    _lastSelectionUpdatedAt = updatedAt;
    final selection = _CompareRetailerSelection(
      ids: next,
      updatedAt: updatedAt,
    );
    _localSelectionSaveQueue = _localSelectionSaveQueue.then(
      (_) => _saveLocalSelection(selection),
    );
    _remoteSelectionSaveQueue = _remoteSelectionSaveQueue.then(
      (_) => MemberStateSync.instance.push(
        MemberStateSync.compareRetailersKey,
        selection.toJson(),
      ),
    );
    unawaited(_localSelectionSaveQueue);
    unawaited(_remoteSelectionSaveQueue);
  }

  Future<_CompareRetailerSelection?> _loadStoredSelection(
      Set<String> available) async {
    SharedPreferences? preferences;
    _CompareRetailerSelection? local;
    try {
      preferences = await SharedPreferences.getInstance();
      final encoded =
          preferences.getString(MemberStateSync.compareRetailersKey);
      if (encoded != null) {
        local = _parseCompareRetailerSelection(jsonDecode(encoded), available);
      }
    } catch (_) {
      // The remote copy can still restore the choice.
    }

    Object? remoteValue;
    var remoteReadSucceeded = false;
    try {
      remoteValue = await widget.api
          .getMemberState(MemberStateSync.compareRetailersKey)
          .timeout(const Duration(seconds: 3));
      remoteReadSucceeded = true;
    } catch (_) {
      // Keep the local choice and retry on a later screen load.
    }
    final remote = _parseCompareRetailerSelection(remoteValue, available);
    final selected = _newerCompareRetailerSelection(remote, local);

    if (selected != null && preferences != null) {
      try {
        await preferences.setString(
          MemberStateSync.compareRetailersKey,
          jsonEncode(selected.toJson()),
        );
      } catch (_) {
        // The in-memory choice still remains usable.
      }
    }
    if (local != null &&
        remoteReadSucceeded &&
        (remote == null || local.updatedAt > remote.updatedAt)) {
      _remoteSelectionSaveQueue = _remoteSelectionSaveQueue.then(
        (_) => MemberStateSync.instance.push(
          MemberStateSync.compareRetailersKey,
          local!.toJson(),
        ),
      );
      unawaited(_remoteSelectionSaveQueue);
    }
    return selected;
  }

  Future<void> _saveLocalSelection(_CompareRetailerSelection selection) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        MemberStateSync.compareRetailersKey,
        jsonEncode(selection.toJson()),
      );
    } catch (_) {
      // The current in-memory choice remains usable when storage is unavailable.
    }
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

  /// Swaps a runner-up product in as a store's compared item and recomputes
  /// which store is cheapest. Purely local: the shopper is correcting our
  /// pick ("eggs" vs "marshmallow eggs"), not searching again.
  void _swapAlternative(
    RetailerProductSearchMatch match,
    RetailerProductAlternative alternative,
  ) {
    final current = _result;
    if (current == null) return;
    final swapped = current.matches
        .map((row) => identical(row, match) ? row.withAlternative(alternative) : row)
        .toList();

    final priced = swapped
        .where((row) => row.status == 'priced' && row.priceCents != null)
        .toList();
    final canCompare = priced.length >= 2;
    int? cheapestCents;
    int? dearestCents;
    for (final row in priced) {
      final price = row.priceCents!;
      cheapestCents =
          cheapestCents == null || price < cheapestCents ? price : cheapestCents;
      dearestCents =
          dearestCents == null || price > dearestCents ? price : dearestCents;
    }
    final flagged = swapped
        .map((row) => row.copyWithCheapest(
            canCompare && row.priceCents != null && row.priceCents == cheapestCents))
        .toList();
    setState(() {
      _result = ProductComparisonResult(
        checkedAt: current.checkedAt,
        country: current.country,
        foundCount: current.foundCount,
        matches: flagged,
        pricedCount: priced.length,
        query: current.query,
        savingsCents: canCompare ? dearestCents! - cheapestCents! : 0,
        unavailableCount: current.unavailableCount,
        cheapestRetailerId: canCompare
            ? flagged
                .firstWhere((row) => row.isCheapest,
                    orElse: () => flagged.first)
                .retailerId
            : null,
      );
    });
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
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'No stores are available right now. Try again shortly.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () {
                    setState(() => _busy = true);
                    _load();
                  },
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                ),
              ],
            )
          else ...[
            Text(
              'Stores shown in compare (${picked.length} selected)',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
            ),
            const SizedBox(height: 2),
            Text(
              'Choose up to $_maxCompareRetailers. Your choice is saved across web and mobile.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 11),
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
            if (_result != null)
              _AutoCompareResult(result: _result!, onSwap: _swapAlternative),
          ],
        ],
      ),
    );
  }
}

_CompareRetailerSelection? _parseCompareRetailerSelection(
  Object? value,
  Set<String> available,
) {
  final Object? rawIds = value is List
      ? value
      : value is Map<String, dynamic>
          ? value['ids']
          : value is Map
              ? value['ids']
              : null;
  if (rawIds is! List) return null;

  final ids = rawIds
      .whereType<String>()
      .where(available.contains)
      .toSet()
      .take(_maxCompareRetailers)
      .toList();
  if (rawIds.isNotEmpty && ids.isEmpty) return null;

  final rawUpdatedAt = value is Map ? value['updatedAt'] : null;
  final updatedAt =
      rawUpdatedAt is num && rawUpdatedAt.isFinite && rawUpdatedAt >= 0
          ? rawUpdatedAt.toInt()
          : 0;
  return _CompareRetailerSelection(ids: ids, updatedAt: updatedAt);
}

_CompareRetailerSelection? _newerCompareRetailerSelection(
  _CompareRetailerSelection? remote,
  _CompareRetailerSelection? local,
) {
  if (remote != null && local != null) {
    return local.updatedAt > remote.updatedAt ? local : remote;
  }
  return remote ?? local;
}

class _AutoCompareResult extends StatelessWidget {
  const _AutoCompareResult({required this.result, required this.onSwap});
  final ProductComparisonResult result;
  final void Function(RetailerProductSearchMatch, RetailerProductAlternative)
      onSwap;

  /// The tester's "eggs vs marshmallow eggs" fix: word overlap can pick the
  /// wrong product, so every store row with runners-up offers a swap sheet.
  Future<void> _showAlternatives(
    BuildContext context,
    RetailerProductSearchMatch match,
  ) async {
    final chosen = await showModalBottomSheet<RetailerProductAlternative>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
              child: Text(
                'Other matches at ${match.retailerName}',
                style:
                    const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: Text(
                'Comparing the wrong product? Pick the one you meant.',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
              ),
            ),
            for (final option in match.alternatives)
              ListTile(
                title: Text(option.title,
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: Text(
                  _formatMoney(option.priceCents, result.country),
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                onTap: () => Navigator.of(sheetContext).pop(option),
              ),
          ],
        ),
      ),
    );
    if (chosen != null) onSwap(match, chosen);
  }

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
                                ? 'No public price search we can read. Check in store.'
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
                              'Product found. The price is hidden, so open the product page.',
                              style: TextStyle(
                                color: TS.mutedOf(context),
                                fontSize: 11,
                              ),
                            ),
                          if (match.alternatives.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: InkWell(
                                onTap: () => _showAlternatives(context, match),
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 4),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.swap_horiz,
                                          size: 16, color: TS.redOf(context)),
                                      const SizedBox(width: 4),
                                      Text(
                                        'Wrong product? See '
                                        '${match.alternatives.length} other '
                                        '${match.alternatives.length == 1 ? 'match' : 'matches'}',
                                        style: TextStyle(
                                          color: TS.redOf(context),
                                          fontWeight: FontWeight.w800,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
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
  return formatMoney(cents, symbol: symbol);
}
