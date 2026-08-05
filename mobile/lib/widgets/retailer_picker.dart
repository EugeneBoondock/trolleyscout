import 'package:flutter/material.dart';

import '../api_models.dart';
import '../retailer_identity.dart';
import '../theme.dart';
import '../ux.dart';
import 'scout_mascot.dart';

/// The sentinel retailer id meaning "no store filter" — the same value
/// Find-a-deal has always handed to `filterDeals`.
const allRetailersId = 'all';

/// How many stores the "Most deals" shortcut section lists.
const _topStoreCount = 6;

/// One row in the store picker: a retailer, and how many of the deals currently
/// loaded on screen belong to it.
class RetailerOption {
  RetailerOption({
    required this.id,
    required this.name,
    required this.dealCount,
    this.catalogueCount = 0,
    this.offerStatus,
  }) : searchKey = foldStoreName(name);

  final String id;
  final String name;
  final int dealCount;
  final int catalogueCount;
  final String? offerStatus;

  /// The folded name, computed once at build time so filtering a few hundred
  /// stores per keystroke stays a plain substring scan.
  final String searchKey;

  int get contentCount => dealCount + catalogueCount;

  String get dealCountLabel {
    if (dealCount > 0 && catalogueCount > 0) {
      return '${_dealCountLabel(dealCount)} · '
          '${_catalogueCountLabel(catalogueCount)}';
    }
    if (dealCount > 0) return _dealCountLabel(dealCount);
    if (catalogueCount > 0) return _catalogueCountLabel(catalogueCount);
    return switch (offerStatus) {
      'available' => 'Offers found',
      'checking' => 'Checking source',
      'not-checked' => 'Queued for checking',
      'temporarily-unavailable' => 'Source unavailable',
      'unverified' => 'Source needs verification',
      _ => 'No current offers',
    };
  }
}

String _dealCountLabel(int count) => '$count deal${count == 1 ? '' : 's'}';
String _catalogueCountLabel(int count) =>
    '$count catalogue${count == 1 ? '' : 's'}';

/// Builds the picker's store list from the deals already on screen, plus every
/// shop we scout, whether or not it has anything on today.
///
/// Built from the deals alone, a shop that happens to be running no promotion
/// vanished from the list entirely, which reads as "not covered" rather than
/// "nothing on today" — Mr Price prices its markdowns without ever recording a
/// previous price, so it would never once have appeared. A shop with nothing on
/// says so, and its count keeps the list honest either way.
///
/// Sorted by the folded name so the A–Z sections come out in order.
List<RetailerOption> retailerOptionsFromDeals(
  Iterable<Deal> deals, {
  Iterable<Retailer> catalog = const [],
  Iterable<Catalogue> catalogues = const [],
}) {
  final names = <String, String>{};
  final counts = <String, int>{};
  final catalogueCounts = <String, int>{};
  final catalogById = <String, Retailer>{};
  final catalogNameIds = <String, String>{};

  for (final retailer in catalog) {
    if (retailer.name.trim().isEmpty) continue;
    catalogById[retailer.id] = retailer;
    names[retailer.id] = retailer.name;
    counts[retailer.id] = 0;
    catalogueCounts[retailer.id] = 0;
    for (final value in [
      retailer.name,
      retailer.shortName,
      ...retailer.aliases
    ]) {
      final key = retailerNameKey(value);
      if (key.isNotEmpty) catalogNameIds[key] = retailer.id;
    }
  }

  for (final deal in deals) {
    if (deal.retailerName.trim().isEmpty) continue;
    final retailerId = canonicalRetailerId(deal.retailerId, deal.retailerName);
    if (retailerId.isEmpty) continue;
    if (retailerId == deal.retailerId || !catalogById.containsKey(retailerId)) {
      names[retailerId] = deal.retailerName;
    }
    counts[retailerId] = (counts[retailerId] ?? 0) + 1;
    catalogueCounts.putIfAbsent(retailerId, () => 0);
  }

  for (final catalogue in catalogues) {
    final retailerName = catalogue.retailerName?.trim() ?? '';
    final suppliedRetailerId = catalogue.retailerId?.trim() ?? '';
    if (retailerName.isEmpty && suppliedRetailerId.isEmpty) continue;
    var retailerId = canonicalRetailerId(suppliedRetailerId, retailerName);
    if (retailerId.isEmpty || !catalogById.containsKey(retailerId)) {
      retailerId = catalogNameIds[retailerNameKey(retailerName)] ?? retailerId;
    }
    if (retailerId.isEmpty) continue;
    names.putIfAbsent(
      retailerId,
      () => catalogById[retailerId]?.name ?? retailerName,
    );
    counts.putIfAbsent(retailerId, () => 0);
    catalogueCounts[retailerId] = (catalogueCounts[retailerId] ?? 0) + 1;
  }

  return [
    for (final entry in names.entries)
      RetailerOption(
        id: entry.key,
        name: entry.value,
        dealCount: counts[entry.key] ?? 0,
        catalogueCount: catalogueCounts[entry.key] ?? 0,
        offerStatus: catalogById[entry.key]?.offerStatus,
      ),
  ]..sort((a, b) => a.searchKey.compareTo(b.searchKey));
}

/// Case- and diacritic-insensitive fold applied to both store names and the
/// typed query, so "cafe" finds "Café" and "pick n" finds "Pick 'n Pay".
String foldStoreName(String value) {
  final folded = StringBuffer();
  for (final rune in value.toLowerCase().runes) {
    final char = String.fromCharCode(rune);
    folded.write(_diacriticFolds[char] ?? char);
  }
  return folded.toString().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();
}

/// Latin accents seen in South African and regional store names, folded to
/// their plain letters. Anything outside this map passes through untouched.
const _diacriticFolds = <String, String>{
  'à': 'a',
  'á': 'a',
  'â': 'a',
  'ã': 'a',
  'ä': 'a',
  'å': 'a',
  'ā': 'a',
  'ă': 'a',
  'ą': 'a',
  'æ': 'ae',
  'ç': 'c',
  'ć': 'c',
  'č': 'c',
  'ď': 'd',
  'đ': 'd',
  'è': 'e',
  'é': 'e',
  'ê': 'e',
  'ë': 'e',
  'ē': 'e',
  'ė': 'e',
  'ę': 'e',
  'ě': 'e',
  'ì': 'i',
  'í': 'i',
  'î': 'i',
  'ï': 'i',
  'ī': 'i',
  'į': 'i',
  'ł': 'l',
  'ñ': 'n',
  'ń': 'n',
  'ň': 'n',
  'ò': 'o',
  'ó': 'o',
  'ô': 'o',
  'õ': 'o',
  'ö': 'o',
  'ø': 'o',
  'ō': 'o',
  'ő': 'o',
  'œ': 'oe',
  'ř': 'r',
  'ś': 's',
  'š': 's',
  'ß': 'ss',
  'ť': 't',
  'þ': 'th',
  'ù': 'u',
  'ú': 'u',
  'û': 'u',
  'ü': 'u',
  'ū': 'u',
  'ů': 'u',
  'ű': 'u',
  'ý': 'y',
  'ÿ': 'y',
  'ź': 'z',
  'ż': 'z',
  'ž': 'z',
};

/// Substring match on the folded store name. An empty (or punctuation-only)
/// query keeps every store.
List<RetailerOption> filterRetailerOptions(
  List<RetailerOption> options,
  String query,
) {
  final needle = foldStoreName(query);
  if (needle.isEmpty) return options;
  return [
    for (final option in options)
      if (option.searchKey.contains(needle)) option,
  ];
}

/// The busiest stores, so the common choice needs no typing. Ties break on name
/// so the shortcut list is stable between rebuilds.
List<RetailerOption> topRetailerOptions(
  List<RetailerOption> options, {
  int limit = _topStoreCount,
}) {
  final ranked = [...options]..sort((a, b) {
      final byCount = b.dealCount.compareTo(a.dealCount);
      return byCount != 0 ? byCount : a.searchKey.compareTo(b.searchKey);
    });
  return ranked.take(limit).toList();
}

/// The A–Z section a store falls under; anything that does not start with a
/// letter lands under "#".
String retailerSectionLetter(RetailerOption option) {
  final key = option.searchKey;
  if (key.isEmpty) return '#';
  final first = key.substring(0, 1);
  return RegExp('[a-z]').hasMatch(first) ? first.toUpperCase() : '#';
}

/// The Find-a-deal store control: a form-field-shaped button that opens the
/// searchable picker. It replaces a flat dropdown that had grown to hundreds of
/// rows once the catalogue spread across the region.
class RetailerFilterField extends StatelessWidget {
  const RetailerFilterField({
    super.key,
    required this.options,
    required this.selectedId,
    required this.totalDealCount,
    required this.onChanged,
  });

  final List<RetailerOption> options;
  final String selectedId;

  /// Deals across every store, shown against the "All retailers" choice.
  final int totalDealCount;

  final ValueChanged<String> onChanged;

  RetailerOption? get _selected {
    for (final option in options) {
      if (option.id == selectedId) return option;
    }
    return null;
  }

  Future<void> _open(BuildContext context) async {
    final chosen = await showRetailerPicker(
      context,
      options: options,
      selectedId: selectedId,
      totalDealCount: totalDealCount,
    );
    if (chosen != null) onChanged(chosen);
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final name = selected?.name ?? 'All retailers';
    final countLabel =
        selected?.dealCountLabel ?? _dealCountLabel(totalDealCount);

    // Merged so a screen reader announces "Retailer, All retailers, 128 deals,
    // button" as one node instead of four fragments.
    return MergeSemantics(
      child: InkWell(
        key: const Key('retailer-filter-trigger'),
        borderRadius: BorderRadius.circular(TS.controlRadius),
        onTap: () => _open(context),
        child: InputDecorator(
          decoration: const InputDecoration(labelText: 'Retailer'),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      countLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.unfold_more, size: 20, color: TS.mutedOf(context)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Opens the searchable store picker. Resolves to the chosen retailer id
/// ([allRetailersId] clears the filter), or null when the sheet is dismissed
/// without a choice.
Future<String?> showRetailerPicker(
  BuildContext context, {
  required List<RetailerOption> options,
  required String selectedId,
  required int totalDealCount,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: TS.bgOf(context),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(TS.panelRadius)),
    ),
    builder: (context) => _RetailerPickerSheet(
      options: options,
      selectedId: selectedId,
      totalDealCount: totalDealCount,
    ),
  );
}

/// A single tappable line in the sheet. "All retailers" is modelled as one of
/// these too, so one row builder covers every case.
class _StoreRow {
  const _StoreRow({
    required this.id,
    required this.name,
    required this.countLabel,
  });

  _StoreRow.from(RetailerOption option)
      : id = option.id,
        name = option.name,
        countLabel = option.dealCountLabel;

  final String id;
  final String name;
  final String countLabel;
}

/// A run of rows under one (optional) pinned header.
class _PickerSection {
  const _PickerSection({required this.rows, this.title, this.shortcut = false});

  final String? title;
  final List<_StoreRow> rows;

  /// True for "Most deals", whose rows repeat further down under their letter.
  /// Those copies never carry the scroll anchor or the A–Z row key.
  final bool shortcut;
}

class _RetailerPickerSheet extends StatefulWidget {
  const _RetailerPickerSheet({
    required this.options,
    required this.selectedId,
    required this.totalDealCount,
  });

  final List<RetailerOption> options;
  final String selectedId;
  final int totalDealCount;

  @override
  State<_RetailerPickerSheet> createState() => _RetailerPickerSheetState();
}

class _RetailerPickerSheetState extends State<_RetailerPickerSheet> {
  final _searchController = TextEditingController();
  final _selectedRowKey = GlobalKey();
  String _query = '';
  bool _revealScheduled = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // No debounce: the whole store list is already in memory and each keystroke
  // is one substring scan over pre-folded names, so filtering lands in the same
  // frame as the character.
  void _onQueryChanged(String value) => setState(() => _query = value);

  void _clearSearch() {
    _searchController.clear();
    setState(() => _query = '');
  }

  void _choose(String id) {
    uxTap();
    Navigator.of(context).pop(id);
  }

  /// Opens on the current pick rather than at the top: with hundreds of stores
  /// the chosen one is usually far down. The jump uses estimated row heights,
  /// then `ensureVisible` lands it exactly once the row has been built. If the
  /// estimate lands more than a viewport away the list simply stays where it
  /// jumped — still the right neighbourhood, never an error.
  void _revealSelection(ScrollController controller) {
    if (!mounted || !controller.hasClients) return;
    final target = _estimatedOffsetTo(widget.selectedId);
    if (target > 0) {
      controller.jumpTo(target.clamp(0.0, controller.position.maxScrollExtent));
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final rowContext = _selectedRowKey.currentContext;
      if (!mounted || rowContext == null) return;
      Scrollable.ensureVisible(rowContext,
          alignment: 0.25, duration: Duration.zero);
    });
  }

  double _estimatedOffsetTo(String id) {
    if (id == allRetailersId) return 0;
    final headerExtent = _headerExtent(context);
    final rowExtent = _rowExtent(context);
    var offset = 0.0;
    for (final section in _sections()) {
      if (section.title != null) offset += headerExtent;
      for (final row in section.rows) {
        if (!section.shortcut && row.id == id) return offset;
        offset += rowExtent;
      }
    }
    return 0;
  }

  static double _headerExtent(BuildContext context) =>
      (MediaQuery.textScalerOf(context).scale(12) * 1.4 + 16).clamp(32.0, 96.0);

  static double _rowExtent(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    return (scaler.scale(15) + scaler.scale(12) + 34).clamp(72.0, 220.0);
  }

  /// The sheet's whole list model: a flat run of matches while searching,
  /// otherwise "All retailers", the "Most deals" shortcuts, then A–Z.
  List<_PickerSection> _sections() {
    if (foldStoreName(_query).isNotEmpty) {
      return [
        _PickerSection(rows: [
          for (final option in filterRetailerOptions(widget.options, _query))
            _StoreRow.from(option),
        ]),
      ];
    }

    final sections = <_PickerSection>[
      _PickerSection(rows: [
        _StoreRow(
          id: allRetailersId,
          name: 'All retailers',
          countLabel: _dealCountLabel(widget.totalDealCount),
        ),
      ]),
    ];

    final top = topRetailerOptions(widget.options);
    if (widget.options.length > top.length) {
      sections.add(_PickerSection(
        title: 'Most deals',
        shortcut: true,
        rows: [for (final option in top) _StoreRow.from(option)],
      ));
    }

    String? letter;
    var rows = <_StoreRow>[];
    for (final option in widget.options) {
      final section = retailerSectionLetter(option);
      if (section != letter) {
        if (letter != null) {
          sections.add(_PickerSection(title: letter, rows: rows));
        }
        letter = section;
        rows = [];
      }
      rows.add(_StoreRow.from(option));
    }
    if (letter != null) {
      sections.add(_PickerSection(title: letter, rows: rows));
    }
    return sections;
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.92,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      builder: (context, controller) {
        // One-shot: the sheet's scroll controller only exists inside this
        // builder, and the position it needs only exists after the first frame.
        if (!_revealScheduled) {
          _revealScheduled = true;
          WidgetsBinding.instance
              .addPostFrameCallback((_) => _revealSelection(controller));
        }
        return Column(
          children: [
            _grabHandle(context),
            _header(context),
            _searchField(context),
            const SizedBox(height: 6),
            Expanded(child: _list(context, controller)),
          ],
        );
      },
    );
  }

  Widget _grabHandle(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Container(
          width: 44,
          height: 4,
          decoration: BoxDecoration(color: TS.lineSoftOf(context)),
        ),
      );

  Widget _header(BuildContext context) {
    final storeCount = widget.options.length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('FILTER BY STORE', style: TS.eyebrowOf(context)),
          const SizedBox(height: 2),
          Text(
            'Choose a store',
            style: Theme.of(context).textTheme.headlineSmall?.merge(TS.display),
          ),
          const SizedBox(height: 2),
          Text(
            storeCount == 0
                ? 'No deals loaded yet'
                : '$storeCount store${storeCount == 1 ? '' : 's'} · '
                    '${_dealCountLabel(widget.totalDealCount)}',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _searchField(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: TextField(
          key: const Key('retailer-picker-search'),
          controller: _searchController,
          autofocus: true,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search stores',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    key: const Key('retailer-picker-clear'),
                    tooltip: 'Clear search',
                    icon: const Icon(Icons.close),
                    onPressed: _clearSearch,
                  ),
          ),
          onChanged: _onQueryChanged,
        ),
      );

  Widget _list(BuildContext context, ScrollController controller) {
    final sections = _sections();
    // The keyboard covers the bottom of a sheet that never resizes, so the
    // inset becomes list padding: nothing shifts, and every row stays reachable.
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final empty = widget.options.isEmpty
        ? _noStores(context)
        : (sections.every((section) => section.rows.isEmpty)
            ? _noMatch(context)
            : null);

    return CustomScrollView(
      controller: controller,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        if (empty != null)
          SliverFillRemaining(hasScrollBody: false, child: empty)
        else
          for (final section in sections)
            if (section.title == null)
              SliverList.list(children: _rowsOf(context, section))
            else
              SliverMainAxisGroup(
                slivers: [
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _SectionHeaderDelegate(
                      label: section.title!,
                      extent: _headerExtent(context),
                    ),
                  ),
                  SliverList.list(children: _rowsOf(context, section)),
                ],
              ),
        SliverToBoxAdapter(child: SizedBox(height: bottomInset + 24)),
      ],
    );
  }

  List<Widget> _rowsOf(BuildContext context, _PickerSection section) => [
        for (final row in section.rows) _row(context, row, section.shortcut),
      ];

  Widget _row(BuildContext context, _StoreRow row, bool shortcut) {
    final selected = row.id == widget.selectedId;
    final tile = ListTile(
      key: Key('${shortcut ? 'retailer-top' : 'retailer-option'}-${row.id}'),
      selected: selected,
      selectedColor: TS.redOf(context),
      selectedTileColor: TS.surfaceSoftOf(context),
      title: Text(
        row.name,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(row.countLabel, maxLines: 1, overflow: TextOverflow.clip),
      trailing:
          selected ? Icon(Icons.check_circle, color: TS.redOf(context)) : null,
      onTap: () => _choose(row.id),
    );
    // Only the A–Z copy anchors the opening scroll — a GlobalKey may live in
    // exactly one place in the tree.
    return selected && !shortcut
        ? KeyedSubtree(key: _selectedRowKey, child: tile)
        : tile;
  }

  Widget _noMatch(BuildContext context) => _emptyPane(
        context,
        title: 'No store matches “${_query.trim()}”.',
        message: 'Check the spelling, or try a shorter word.',
        action: FilledButton.icon(
          style: FilledButton.styleFrom(
              backgroundColor: TS.yellow, foregroundColor: TS.ink),
          onPressed: _clearSearch,
          icon: const Icon(Icons.backspace_outlined, size: 18),
          label: const Text('Clear search'),
        ),
      );

  Widget _noStores(BuildContext context) => _emptyPane(
        context,
        title: 'No stores yet.',
        message: 'Deals are still loading. Every store with a deal shows up '
            'here the moment they land.',
        action: OutlinedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      );

  Widget _emptyPane(
    BuildContext context, {
    required String title,
    required String message,
    required Widget action,
  }) =>
      Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const ScoutMascot(pose: ScoutMascotPose.search, size: 96),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
            ),
            const SizedBox(height: 14),
            action,
          ],
        ),
      );
}

/// Section headers stay pinned while their letter is on screen, so an A–Z scan
/// through hundreds of stores never loses its place.
class _SectionHeaderDelegate extends SliverPersistentHeaderDelegate {
  const _SectionHeaderDelegate({required this.label, required this.extent});

  final String label;
  final double extent;

  @override
  double get minExtent => extent;

  @override
  double get maxExtent => extent;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlaps) {
    return Semantics(
      header: true,
      child: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(
          color: TS.bgOf(context),
          border: Border(
            bottom: BorderSide(color: TS.lineSoftOf(context), width: 1.5),
          ),
        ),
        child: Text(
          label.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TS.eyebrowOf(context),
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(_SectionHeaderDelegate oldDelegate) =>
      oldDelegate.label != label || oldDelegate.extent != extent;
}
