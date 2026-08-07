import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../currency.dart';
import '../member_state_sync.dart';
import '../theme.dart';
import '../trip_compare.dart';
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
  final _tripController = TextEditingController();
  List<Retailer> _retailers = const [];
  bool _busy = true;
  bool _searching = false;
  String? _error;
  List<String>? _selectedIds;
  ProductComparisonResult? _result;
  TripComparison? _tripResult;
  bool _tripMode = false;
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
    _tripController.dispose();
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
      _tripResult = null;
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

  void _replaceStores(List<String> ids) {
    final next = ids.toSet().take(_maxCompareRetailers).toList();
    setState(() {
      _error = null;
      _result = null;
      _tripResult = null;
      _selectedIds = next;
    });
    final updatedAt = math.max(
      DateTime.now().millisecondsSinceEpoch,
      _lastSelectionUpdatedAt + 1,
    );
    _lastSelectionUpdatedAt = updatedAt;
    final selection =
        _CompareRetailerSelection(ids: next, updatedAt: updatedAt);
    _localSelectionSaveQueue =
        _localSelectionSaveQueue.then((_) => _saveLocalSelection(selection));
    _remoteSelectionSaveQueue = _remoteSelectionSaveQueue.then(
      (_) => MemberStateSync.instance.push(
        MemberStateSync.compareRetailersKey,
        selection.toJson(),
      ),
    );
    unawaited(_localSelectionSaveQueue);
    unawaited(_remoteSelectionSaveQueue);
  }

  Future<void> _showStorePicker() async {
    var chosen = <String>{...?_selectedIds};
    String? pickerError;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => FractionallySizedBox(
        heightFactor: 0.86,
        child: StatefulBuilder(
          builder: (context, setPickerState) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 12, 8),
                child: Row(
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Choose stores',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text('Pick at least two for a useful comparison.'),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close store picker',
                      onPressed: () => Navigator.of(sheetContext).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${chosen.length} selected',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                    TextButton(
                      onPressed: chosen.length ==
                              math.min(_retailers.length, _maxCompareRetailers)
                          ? null
                          : () {
                              final all = _retailers
                                  .take(_maxCompareRetailers)
                                  .map((store) => store.id)
                                  .toList();
                              _replaceStores(all);
                              setPickerState(() {
                                chosen = all.toSet();
                                pickerError = null;
                              });
                            },
                      child: const Text('Select all'),
                    ),
                    TextButton(
                      onPressed: chosen.isEmpty
                          ? null
                          : () {
                              _replaceStores([]);
                              setPickerState(() {
                                chosen = {};
                                pickerError = null;
                              });
                            },
                      child: const Text('Clear'),
                    ),
                  ],
                ),
              ),
              if (pickerError != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  child: Text(
                    pickerError!,
                    style: TextStyle(
                      color: TS.redOf(context),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final retailer in _retailers)
                        FilterChip(
                          label: Text(retailer.name),
                          labelStyle: TextStyle(
                            color: chosen.contains(retailer.id)
                                ? TS.ink
                                : TS.inkOf(context),
                          ),
                          selected: chosen.contains(retailer.id),
                          selectedColor: TS.yellow,
                          showCheckmark: false,
                          onSelected: (selected) {
                            if (selected &&
                                chosen.length >= _maxCompareRetailers) {
                              setPickerState(() {
                                pickerError =
                                    'Choose up to $_maxCompareRetailers stores at a time.';
                              });
                              return;
                            }
                            _toggleStore(retailer.id);
                            setPickerState(() {
                              chosen = selected
                                  ? {...chosen, retailer.id}
                                  : (chosen..remove(retailer.id));
                              pickerError = null;
                            });
                          },
                        ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    minimumSize: const Size.fromHeight(52),
                  ),
                  onPressed: () => Navigator.of(sheetContext).pop(),
                  child: Text('Done with ${chosen.length} selected'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
      if (mounted) {
        setState(() {
          _error = error.statusCode == 401
              ? 'Sign in to compare live store prices.'
              : error.message;
        });
      }
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

  Future<void> _compareTrip() async {
    final picked = _selectedIds ?? const <String>[];
    final queries = parseTripQueries(_tripController.text);
    if (picked.length < 2 || queries.length < 2 || _searching) return;
    setState(() {
      _error = null;
      _result = null;
      _tripResult = null;
      _searching = true;
    });

    try {
      final results = <ProductComparisonResult>[];
      for (var index = 0; index < queries.length; index += 2) {
        final end = math.min(index + 2, queries.length);
        results.addAll(await Future.wait(
          queries.sublist(index, end).map(
                (query) => widget.api.searchProductPrices(
                  query: query,
                  retailerIds: picked,
                ),
              ),
        ));
      }
      if (mounted) setState(() => _tripResult = buildTripComparison(results));
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.statusCode == 401
              ? 'Sign in to compare a shopping trip.'
              : error.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not price this trip right now. Try again.';
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
        .map((row) =>
            identical(row, match) ? row.withAlternative(alternative) : row)
        .toList();

    final priced = swapped
        .where((row) => row.status == 'priced' && row.priceCents != null)
        .toList();
    final canCompare = priced.length >= 2;
    int? cheapestCents;
    int? dearestCents;
    for (final row in priced) {
      final price = row.priceCents!;
      cheapestCents = cheapestCents == null || price < cheapestCents
          ? price
          : cheapestCents;
      dearestCents =
          dearestCents == null || price > dearestCents ? price : dearestCents;
    }
    final flagged = swapped
        .map((row) => row.copyWithCheapest(canCompare &&
            row.priceCents != null &&
            row.priceCents == cheapestCents))
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
    final tripQueries = parseTripQueries(_tripController.text);
    final canCompareTrip =
        tripQueries.length >= 2 && picked.length >= 2 && !_searching;

    return Container(
      decoration: TS.card(context),
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('COMPARE', style: TS.eyebrowOf(context)),
          const SizedBox(height: 4),
          Text(
            _tripMode
                ? 'Plan the cheapest shopping trip'
                : 'Compare a product across stores',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            _tripMode
                ? 'Paste several products. We compare a split trip with a one-store trip and keep missing prices visible.'
                : 'Pick the stores you shop at and type what you are buying. We search regular products and promotions at those stores now.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
          ),
          const SizedBox(height: 12),
          _CompareModePicker(
            tripMode: _tripMode,
            onChanged: (tripMode) => setState(() {
              _tripMode = tripMode;
              _error = null;
              _result = null;
              _tripResult = null;
            }),
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
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: TS.surfaceSoftOf(context),
                border: Border.all(color: TS.lineOf(context), width: 2),
                borderRadius: BorderRadius.circular(TS.controlRadius),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${picked.length} stores selected',
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: _showStorePicker,
                        icon: const Icon(Icons.tune, size: 17),
                        label: const Text('Choose stores'),
                      ),
                    ],
                  ),
                  if (picked.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final id in picked.take(4))
                          Chip(
                            label: Text(
                              _retailers
                                  .firstWhere(
                                    (store) => store.id == id,
                                    orElse: () => _retailers.first,
                                  )
                                  .name,
                            ),
                            visualDensity: VisualDensity.compact,
                          ),
                        if (picked.length > 4)
                          Chip(
                            label: Text('+${picked.length - 4} more'),
                            visualDensity: VisualDensity.compact,
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 5),
                  Text(
                    'Your choice is saved across web and mobile.',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) {
                final field = _tripMode
                    ? TextField(
                        key: const ValueKey('trip-compare-input'),
                        controller: _tripController,
                        maxLength: 640,
                        maxLines: 7,
                        minLines: 5,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          alignLabelWithHint: true,
                          labelText: 'One product per line',
                          hintText: 'Milk 2L\nBrown bread 700g\nEggs 18 pack',
                          helperText:
                              '${tripQueries.length} of $kMaxTripItems products ready',
                          prefixIcon: const Padding(
                            padding: EdgeInsets.only(bottom: 92),
                            child: Icon(Icons.format_list_bulleted),
                          ),
                        ),
                        onChanged: (_) => setState(() {
                          _error = null;
                          _tripResult = null;
                        }),
                      )
                    : TextField(
                        controller: _queryController,
                        decoration: const InputDecoration(
                          labelText: 'Item to compare',
                          hintText: 'e.g. white bread',
                          prefixIcon: Icon(Icons.search),
                        ),
                        onChanged: (_) => setState(() {
                          _error = null;
                          _result = null;
                        }),
                        onSubmitted: (_) {
                          if (canCompare) _compare();
                        },
                      );
                final button = FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    minimumSize: const Size(112, 56),
                  ),
                  onPressed: _tripMode
                      ? (canCompareTrip ? _compareTrip : null)
                      : (canCompare ? _compare : null),
                  icon: _searching
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.compare_arrows, size: 18),
                  label: Text(_searching
                      ? _tripMode
                          ? 'Pricing ${tripQueries.length}'
                          : 'Searching'
                      : _tripMode
                          ? 'Plan trip'
                          : 'Compare'),
                );
                if (constraints.maxWidth < 350) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [field, const SizedBox(height: 8), button],
                  );
                }
                return Row(
                  children: [
                    Expanded(child: field),
                    const SizedBox(width: 8),
                    button,
                  ],
                );
              },
            ),
            if (_tripMode && tripQueries.length < 2)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Add at least two products, one per line.',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
                ),
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
            if (_tripResult != null)
              _TripCompareResult(comparison: _tripResult!),
          ],
        ],
      ),
    );
  }
}

class _CompareModePicker extends StatelessWidget {
  const _CompareModePicker({
    required this.onChanged,
    required this.tripMode,
  });

  final ValueChanged<bool> onChanged;
  final bool tripMode;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: TS.surfaceSoftOf(context),
          border: Border.all(color: TS.lineOf(context), width: 2),
          borderRadius: BorderRadius.circular(TS.cardRadius),
        ),
        child: Row(
          children: [
            Expanded(
              child: _CompareModeButton(
                icon: Icons.balance_outlined,
                label: 'One item',
                onTap: () => onChanged(false),
                selected: !tripMode,
              ),
            ),
            const SizedBox(width: 5),
            Expanded(
              child: _CompareModeButton(
                icon: Icons.playlist_add_check_circle_outlined,
                label: 'Shopping trip',
                onTap: () => onChanged(true),
                selected: tripMode,
              ),
            ),
          ],
        ),
      );
}

class _CompareModeButton extends StatelessWidget {
  const _CompareModeButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.selected,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) => Material(
        color: selected ? TS.surfaceOf(context) : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TS.controlRadius),
          side: BorderSide(
            color: selected ? TS.lineOf(context) : Colors.transparent,
            width: 2,
          ),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(TS.controlRadius),
          onTap: onTap,
          child: Semantics(
            button: true,
            selected: selected,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon,
                      size: 19,
                      color:
                          selected ? TS.inkOf(context) : TS.mutedOf(context)),
                  const SizedBox(width: 7),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.fade,
                      softWrap: false,
                      style: TextStyle(
                        color:
                            selected ? TS.inkOf(context) : TS.mutedOf(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class _TripCompareResult extends StatelessWidget {
  const _TripCompareResult({required this.comparison});

  final TripComparison comparison;

  @override
  Widget build(BuildContext context) {
    final country = comparison.country ??
        const CountryOption(
          code: 'ZA',
          currencyCode: 'ZAR',
          flag: '',
          name: 'South Africa',
        );
    final missingCount = comparison.items.length - comparison.pricedItemCount;
    final oneStore = comparison.bestOneStore;
    final cardWidth = (MediaQuery.sizeOf(context).width - 76) / 2;

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _TripSummaryCard(
                accent: true,
                label: 'CHEAPEST SPLIT',
                value: _formatMoneyExact(comparison.splitTotalCents, country),
                detail: comparison.isComplete
                    ? '${comparison.splitStoreCount} store ${comparison.splitStoreCount == 1 ? 'stop' : 'stops'}'
                    : '${comparison.pricedItemCount} of ${comparison.items.length} products priced',
                width: math.max(145, cardWidth),
              ),
              _TripSummaryCard(
                label: 'BEST ONE STORE',
                value: oneStore == null
                    ? 'More prices needed'
                    : _formatMoneyExact(oneStore.totalCents, country),
                detail:
                    oneStore?.retailerName ?? 'No store priced every product',
                width: math.max(145, cardWidth),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: TS.surfaceSoftOf(context),
              border: Border.all(color: TS.lineSoftOf(context)),
              borderRadius: BorderRadius.circular(TS.controlRadius),
            ),
            child: comparison.isComplete &&
                    oneStore != null &&
                    comparison.convenienceCostCents != null
                ? Text.rich(
                    TextSpan(children: [
                      const TextSpan(text: 'One stop at '),
                      TextSpan(
                        text: oneStore.retailerName,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const TextSpan(text: ' costs '),
                      TextSpan(
                        text:
                            '${_formatMoneyExact(comparison.convenienceCostCents!, country)} more',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const TextSpan(text: ' than splitting the trip.'),
                    ]),
                    style: const TextStyle(fontSize: 13),
                  )
                : Text(
                    'This is a known-price estimate. $missingCount '
                    '${missingCount == 1 ? 'product still needs' : 'products still need'} a verified price.',
                    style: const TextStyle(fontSize: 13),
                  ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Cheapest product stops',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 7),
          for (final item in comparison.items)
            InkWell(
              borderRadius: BorderRadius.circular(TS.controlRadius),
              onTap: item.match?.productUrl == null
                  ? null
                  : () => showInAppBrowser(
                        context,
                        item.match!.productUrl,
                        title: item.match!.retailerName,
                      ),
              child: Container(
                margin: const EdgeInsets.only(bottom: 7),
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: TS.surfaceOf(context),
                  border: Border.all(color: TS.lineSoftOf(context)),
                  borderRadius: BorderRadius.circular(TS.controlRadius),
                ),
                child: Row(
                  children: [
                    Icon(
                      item.match == null
                          ? Icons.help_outline
                          : Icons.check_circle,
                      color: item.match == null
                          ? TS.mutedOf(context)
                          : TS.greenOf(context),
                      size: 21,
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.query,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w900)),
                          Text(
                            item.match?.retailerName ??
                                'No verified price found',
                            style: TextStyle(
                                color: TS.mutedOf(context), fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    if (item.match?.priceCents != null)
                      Text(
                        _formatMoneyExact(item.match!.priceCents!, country),
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    if (item.match?.productUrl != null) ...[
                      const SizedBox(width: 6),
                      Icon(Icons.open_in_new,
                          color: TS.redOf(context), size: 17),
                    ],
                  ],
                ),
              ),
            ),
          const SizedBox(height: 8),
          const Text(
            'Store coverage',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 7),
          for (final store in comparison.stores)
            Container(
              margin: const EdgeInsets.only(bottom: 7),
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: TS.surfaceOf(context),
                border: Border.all(color: TS.lineSoftOf(context)),
                borderRadius: BorderRadius.circular(TS.controlRadius),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(store.retailerName,
                            style:
                                const TextStyle(fontWeight: FontWeight.w900)),
                        Text(
                          '${store.pricedItemCount} of ${comparison.items.length} products priced',
                          style: TextStyle(
                              color: TS.mutedOf(context), fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        store.pricedItemCount == 0
                            ? 'No prices'
                            : _formatMoneyExact(store.totalCents, country),
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        store.pricedItemCount == 0
                            ? 'nothing verified'
                            : store.pricedItemCount == comparison.items.length
                                ? 'complete total'
                                : 'known subtotal',
                        style:
                            TextStyle(color: TS.mutedOf(context), fontSize: 10),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _TripSummaryCard extends StatelessWidget {
  const _TripSummaryCard({
    required this.detail,
    required this.label,
    required this.value,
    required this.width,
    this.accent = false,
  });

  final bool accent;
  final String detail;
  final String label;
  final String value;
  final double width;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 126),
        padding: const EdgeInsets.all(14),
        width: width,
        decoration: BoxDecoration(
          color: accent
              ? Color.alphaBlend(
                  TS.greenOf(context).withValues(alpha: 0.1),
                  TS.surfaceOf(context),
                )
              : TS.surfaceOf(context),
          border: Border.all(
            color: accent ? TS.greenOf(context) : TS.lineOf(context),
            width: 2,
          ),
          borderRadius: BorderRadius.circular(TS.cardRadius),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TS.eyebrowOf(context)),
            const SizedBox(height: 7),
            Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 3),
            Text(
              detail,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: TS.mutedOf(context), fontSize: 11),
            ),
          ],
        ),
      );
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
    final bestPrice = cheapest?.priceCents;
    final ordered = [...result.matches]..sort((left, right) {
        final leftPrice = left.priceCents;
        final rightPrice = right.priceCents;
        if (leftPrice != null && rightPrice != null) {
          return leftPrice.compareTo(rightPrice);
        }
        if (leftPrice != null) return -1;
        if (rightPrice != null) return 1;
        if (left.status == 'found' && right.status == 'unavailable') return -1;
        if (right.status == 'found' && left.status == 'unavailable') return 1;
        return left.retailerName.compareTo(right.retailerName);
      });
    final green = TS.greenOf(context);
    final greenText =
        ThemeData.estimateBrightnessForColor(green) == Brightness.dark
            ? Colors.white
            : TS.ink;

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (result.pricedCount >= 2 && cheapest != null && bestPrice != null)
            Container(
              key: const ValueKey('price-comparison-winner'),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Color.alphaBlend(
                  green.withValues(alpha: 0.11),
                  TS.surfaceOf(context),
                ),
                border: Border.all(color: green, width: 2),
                borderRadius: BorderRadius.circular(TS.cardRadius),
              ),
              child: Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: green,
                      borderRadius: BorderRadius.circular(TS.controlRadius),
                    ),
                    child: Icon(Icons.verified_outlined, color: greenText),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('BEST LIVE PRICE', style: TS.eyebrowOf(context)),
                        Text(
                          cheapest.retailerName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          result.query,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: TS.mutedOf(context),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _formatMoney(bestPrice, result.country),
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (result.savingsCents > 0)
                        Text(
                          'Save up to ${_formatMoneyExact(result.savingsCents, result.country)}',
                          style: TextStyle(
                            color: green,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: TS.surfaceSoftOf(context),
                border: Border.all(color: TS.lineOf(context), width: 2),
                borderRadius: BorderRadius.circular(TS.controlRadius),
              ),
              child: Row(
                children: [
                  const Icon(Icons.storefront_outlined),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'More prices needed',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                        Text(
                          'We name a best price only after two stores return one.',
                          style: TextStyle(
                            color: TS.mutedOf(context),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${result.pricedCount} of ${result.matches.length} stores priced',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Icon(Icons.schedule, size: 14, color: TS.mutedOf(context)),
              const SizedBox(width: 4),
              Text(
                'Checked ${_checkedLabel(result.checkedAt)}',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final match in ordered)
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
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: match.isCheapest
                      ? Color.alphaBlend(
                          green.withValues(alpha: 0.08),
                          TS.surfaceOf(context),
                        )
                      : TS.surfaceOf(context),
                  border: Border.all(
                    color: match.isCheapest
                        ? TS.greenOf(context)
                        : TS.lineOf(context),
                    width: 2,
                  ),
                  borderRadius: BorderRadius.circular(TS.controlRadius),
                ),
                padding: const EdgeInsets.all(11),
                child: Row(
                  children: [
                    Container(
                      width: 30,
                      height: 30,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: match.isCheapest
                            ? green
                            : TS.surfaceSoftOf(context),
                        border: Border.all(
                          color: match.isCheapest ? green : TS.lineOf(context),
                        ),
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '${ordered.indexOf(match) + 1}',
                        style: TextStyle(
                          color:
                              match.isCheapest ? greenText : TS.inkOf(context),
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            match.retailerName,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          if (match.isCheapest)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                'BEST PRICE',
                                style: TextStyle(
                                  color: green,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                ),
                              ),
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        if (match.priceCents != null)
                          Text(
                            _formatMoney(match.priceCents!, result.country),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                            ),
                          )
                        else
                          Icon(
                            match.status == 'found'
                                ? Icons.visibility_off_outlined
                                : Icons.remove_circle_outline,
                            size: 18,
                            color: TS.mutedOf(context),
                          ),
                        if (bestPrice != null &&
                            match.priceCents != null &&
                            match.priceCents! > bestPrice)
                          Text(
                            '${_formatMoneyExact(match.priceCents! - bestPrice, result.country)} more',
                            style: TextStyle(
                              color: TS.mutedOf(context),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        if (match.productUrl != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Icon(
                              Icons.open_in_new,
                              size: 17,
                              color: TS.redOf(context),
                            ),
                          ),
                      ],
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

/// Store prices come back in the currency of the country they were read in, so
/// they are shown in that currency — never converted, never re-labelled.
String _checkedLabel(String value) {
  final checked = DateTime.tryParse(value)?.toLocal();
  if (checked == null) return 'just now';
  final hour = checked.hour.toString().padLeft(2, '0');
  final minute = checked.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

String _formatMoney(int cents, CountryOption country) =>
    Currency.of(country.currencyCode).formatShort(cents);

String _formatMoneyExact(int cents, CountryOption country) =>
    Currency.of(country.currencyCode).format(cents);
