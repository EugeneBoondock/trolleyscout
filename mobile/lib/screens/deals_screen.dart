import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../deal_categories.dart';
import '../deal_filters.dart';
import '../discovery_cache.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/skeleton.dart';

class DealsScreen extends StatefulWidget {
  const DealsScreen({
    super.key,
    required this.api,
    this.isAuthenticated = false,
    this.onWatchesChanged,
    this.onWantsAuth,
    this.initialRetailerId,
    this.initialQuery,
  });
  final Api api;
  final bool isAuthenticated;
  final VoidCallback? onWatchesChanged;
  final VoidCallback? onWantsAuth;
  // When arriving from a Near-me store card, pre-filter to that store's deals.
  final String? initialRetailerId;
  final String? initialQuery;

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  static const _perPage = 24;
  Future<DiscoveryResult>? _future;
  int _page = 0;
  final Set<String> _savedDealIds = {};
  String _query = '';
  String _retailerId = 'all';
  String _sourceLabel = 'all';
  bool _imagesOnly = false;
  bool _savingsOnly = false;
  DealCategory? _category;
  FoodSubcategory? _foodSubcategory;
  Timer? _searchDebounce;
  final _searchController = TextEditingController();
  bool _creatingWatch = false;
  final _cacheStore = DiscoveryCache();
  CachedDiscovery? _cached;
  Set<String> _previousDealIds = const {};

  @override
  void initState() {
    super.initState();
    _query = widget.initialQuery ?? '';
    _retailerId = widget.initialRetailerId?.isNotEmpty == true
        ? widget.initialRetailerId!
        : 'all';
    _searchController.text = _query;
    _restoreCache();
    _load();
  }

  @override
  void didUpdateWidget(covariant DealsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A fresh Near-me tap re-seeds the filter even if the screen stayed mounted.
    if (widget.initialRetailerId != oldWidget.initialRetailerId ||
        widget.initialQuery != oldWidget.initialQuery) {
      setState(() {
        _query = widget.initialQuery ?? '';
        _retailerId = widget.initialRetailerId?.isNotEmpty == true
            ? widget.initialRetailerId!
            : 'all';
        _searchController.text = _query;
        _page = 0;
      });
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _restoreCache() async {
    final cached = await _cacheStore.load();
    if (cached != null && mounted) {
      setState(() => _cached = cached);
    }
  }

  void _load() {
    _future = widget.api.discovery().then((result) {
      // Deals not in the previous visit's snapshot get a NEW tag.
      _previousDealIds = _cached?.dealIds ?? const {};
      _cacheStore.save(result, DateTime.now());
      return result;
    });
  }

  // Filtering re-runs only after the shopper pauses typing, so long lists
  // never stutter under the keyboard.
  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() {
        _query = value;
        _page = 0;
      });
    });
  }

  Future<void> _watchCurrentQuery() async {
    if (_creatingWatch) return;
    uxTap();
    setState(() => _creatingWatch = true);
    try {
      final result = await widget.api.createDealWatch(_query);
      widget.onWatchesChanged?.call();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(result.foundImmediately
              ? '${result.message} Check your alerts bell.'
              : result.message),
        ));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _creatingWatch = false);
    }
  }

  /// Grouped by retailer, then in catalogue page order, matching the web app.
  List<Deal> _sortByPage(List<Deal> deals) {
    final sorted = [...deals];
    sorted.sort((a, b) {
      if (a.retailerName != b.retailerName) {
        return a.retailerName.compareTo(b.retailerName);
      }
      return (a.pageNumber ?? 1 << 30).compareTo(b.pageNumber ?? 1 << 30);
    });
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DiscoveryResult>(
      future: _future,
      builder: (context, snap) {
        // Cache-first: last visit's deals render instantly (and offline),
        // with a freshness note, while the live copy loads behind them.
        if (snap.connectionState == ConnectionState.waiting) {
          if (_cached != null) {
            return _buildBoard(_cached!.result,
                staleNote:
                    '${_freshnessLabel(_cached!.fetchedAt)} · refreshing…');
          }
          return const SkeletonPane(rows: 6);
        }
        if (snap.hasError || snap.data == null) {
          if (_cached != null) {
            return _buildBoard(_cached!.result,
                staleNote:
                    'Offline · showing deals from ${_freshnessLabel(_cached!.fetchedAt).toLowerCase()}');
          }
          return _retry();
        }

        return _buildBoard(snap.data!);
      },
    );
  }

  Widget _buildBoard(DiscoveryResult result, {String? staleNote}) {
    final allDeals = _sortByPage(result.deals);
    final retailers = <String, String>{
      for (final deal in allDeals) deal.retailerId: deal.retailerName,
    };
    final sources = allDeals
        .map((deal) => deal.sourceLabel)
        .where((source) => source.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    final deals = filterDeals(
      allDeals,
      query: _query,
      retailerId: _retailerId,
      sourceLabel: _sourceLabel,
      imagesOnly: _imagesOnly,
      savingsOnly: _savingsOnly,
      category: _category,
      foodSubcategory: _foodSubcategory,
    );
    if (deals.isEmpty) {
      return _dealBoard(result, deals, retailers, sources, const [], 0, 0,
          staleNote: staleNote);
    }

    final pageCount = (deals.length / _perPage).ceil();
    final page = _page.clamp(0, pageCount - 1);
    final slice = deals.skip(page * _perPage).take(_perPage).toList();

    return _dealBoard(result, deals, retailers, sources, slice, page, pageCount,
        staleNote: staleNote);
  }

  static String _freshnessLabel(DateTime fetchedAt) {
    final age = DateTime.now().difference(fetchedAt.toLocal());
    if (age.inMinutes < 1) return 'Updated just now';
    if (age.inMinutes < 60) return 'Updated ${age.inMinutes} min ago';
    if (age.inHours < 24) {
      return 'Updated ${age.inHours} hour${age.inHours == 1 ? '' : 's'} ago';
    }
    return 'Updated ${age.inDays} day${age.inDays == 1 ? '' : 's'} ago';
  }

  Widget _dealBoard(
    DiscoveryResult result,
    List<Deal> deals,
    Map<String, String> retailers,
    List<String> sources,
    List<Deal> slice,
    int page,
    int pageCount, {
    String? staleNote,
  }) {
    final catalogueGroups = _groupCatalogues(result.catalogues);

    return DefaultTabController(
      length: 3,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('DEAL FINDER', style: TS.eyebrowOf(context)),
                const SizedBox(height: 4),
                const Text('Source-backed specials',
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
                if (staleNote != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: TS.mutedOf(context)),
                        ),
                        const SizedBox(width: 8),
                        Text(staleNote,
                            style: TextStyle(
                                color: TS.mutedOf(context),
                                fontSize: 12,
                                fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          TabBar(
            labelColor: TS.inkOf(context),
            unselectedLabelColor: TS.mutedOf(context),
            indicatorColor: TS.redOf(context),
            tabs: [
              Tab(text: 'Deals (${deals.length})'),
              Tab(text: 'Catalogues (${catalogueGroups.length})'),
              const Tab(text: 'Overview'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _dealsTab(deals, retailers, sources, slice, page, pageCount),
                _cataloguesTab(catalogueGroups),
                _overviewTab(result, catalogueGroups.length),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dealsTab(
    List<Deal> deals,
    Map<String, String> retailers,
    List<String> sources,
    List<Deal> slice,
    int page,
    int pageCount,
  ) {
    return RefreshIndicator(
      color: TS.redOf(context),
      onRefresh: () async => setState(() {
        _page = 0;
        _load();
      }),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _searchController,
            decoration: const InputDecoration(
              labelText: 'Search deals',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: _onSearchChanged,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: ValueKey('retailer-$_retailerId'),
                  initialValue:
                      retailers.containsKey(_retailerId) ? _retailerId : 'all',
                  decoration: const InputDecoration(labelText: 'Retailer'),
                  items: [
                    const DropdownMenuItem(
                        value: 'all', child: Text('All retailers')),
                    for (final entry in retailers.entries)
                      DropdownMenuItem(
                          value: entry.key, child: Text(entry.value)),
                  ],
                  onChanged: (value) => setState(() {
                    _retailerId = value ?? 'all';
                    _page = 0;
                  }),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: ValueKey('source-$_sourceLabel'),
                  initialValue:
                      sources.contains(_sourceLabel) ? _sourceLabel : 'all',
                  decoration: const InputDecoration(labelText: 'Source'),
                  items: [
                    const DropdownMenuItem(
                        value: 'all', child: Text('All sources')),
                    for (final source in sources)
                      DropdownMenuItem(value: source, child: Text(source)),
                  ],
                  onChanged: (value) => setState(() {
                    _sourceLabel = value ?? 'all';
                    _page = 0;
                  }),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _categoryChips(),
          if (_category == DealCategory.food) ...[
            const SizedBox(height: 6),
            _foodSubcategoryChips(),
          ],
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              FilterChip(
                label: const Text('Has image'),
                selected: _imagesOnly,
                onSelected: (selected) => setState(() {
                  _imagesOnly = selected;
                  _page = 0;
                }),
              ),
              FilterChip(
                label: const Text('Shows savings'),
                selected: _savingsOnly,
                onSelected: (selected) => setState(() {
                  _savingsOnly = selected;
                  _page = 0;
                }),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text('${deals.length} matching deals', style: TS.eyebrowOf(context)),
          const SizedBox(height: 8),
          if (deals.isEmpty)
            Container(
              decoration: TS.card(context),
              padding: const EdgeInsets.all(16),
              child: _query.trim().length < 3
                  ? const Text('No deals match those filters.')
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('No deal for "${_query.trim()}" yet.',
                            style:
                                const TextStyle(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 6),
                        Text(
                          widget.isAuthenticated
                              ? 'Watch it and Trolley Scout will alert you the moment '
                                  'any scout or another shopper\'s search finds one.'
                              : 'Log in and Trolley Scout can watch this item for you, '
                                  'then alert you the moment a deal appears.',
                          style: TextStyle(
                              color: TS.mutedOf(context), fontSize: 13),
                        ),
                        const SizedBox(height: 10),
                        FilledButton.icon(
                          style: FilledButton.styleFrom(
                              backgroundColor: TS.yellow,
                              foregroundColor: TS.ink),
                          onPressed: widget.isAuthenticated
                              ? (_creatingWatch ? null : _watchCurrentQuery)
                              : widget.onWantsAuth,
                          icon: Icon(widget.isAuthenticated
                              ? Icons.notifications_active_outlined
                              : Icons.person_outline),
                          label: Text(widget.isAuthenticated
                              ? (_creatingWatch
                                  ? 'Saving watch'
                                  : 'Watch this item')
                              : 'Log in to watch it'),
                        ),
                      ],
                    ),
            ),
          for (final deal in slice)
            _DealRow(
              deal: deal,
              isNew: _previousDealIds.isNotEmpty &&
                  deal.id.isNotEmpty &&
                  !_previousDealIds.contains(deal.id),
              isSaved: _savedDealIds.contains(deal.id),
              onSave: widget.isAuthenticated ? () => _save(deal) : null,
            ),
          if (pageCount > 1)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  OutlinedButton(
                    onPressed: page == 0
                        ? null
                        : () => setState(() => _page = page - 1),
                    child: const Text('Previous'),
                  ),
                  Text('Page ${page + 1} of $pageCount',
                      style: TextStyle(
                          color: TS.mutedOf(context),
                          fontWeight: FontWeight.w700)),
                  OutlinedButton(
                    onPressed: page >= pageCount - 1
                        ? null
                        : () => setState(() => _page = page + 1),
                    child: const Text('Next'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _categoryChips() {
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _chip('All', _category == null, () => setState(() {
                _category = null;
                _foodSubcategory = null;
                _page = 0;
              })),
          for (final option in categoryOptions)
            _chip('${option.icon} ${option.label}', _category == option.id,
                () => setState(() {
                  _category = option.id;
                  _foodSubcategory = null;
                  _page = 0;
                })),
        ],
      ),
    );
  }

  Widget _foodSubcategoryChips() {
    return SizedBox(
      height: 34,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _chip('All food', _foodSubcategory == null,
              () => setState(() {
                _foodSubcategory = null;
                _page = 0;
              }), small: true),
          for (final option in foodSubcategoryOptions)
            _chip(option.label, _foodSubcategory == option.id,
                () => setState(() {
                  _foodSubcategory = option.id;
                  _page = 0;
                }), small: true),
        ],
      ),
    );
  }

  Widget _chip(String label, bool active, VoidCallback onTap,
      {bool small = false}) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: () {
          uxTap();
          onTap();
        },
        child: Container(
          alignment: Alignment.center,
          padding: EdgeInsets.symmetric(horizontal: small ? 10 : 12),
          decoration: BoxDecoration(
            color: active ? TS.inkOf(context) : TS.surfaceOf(context),
            border: Border.all(color: TS.lineSoftOf(context), width: 2),
          ),
          child: Text(label,
              style: TextStyle(
                  color: active
                      ? TS.surfaceOf(context)
                      : TS.inkOf(context),
                  fontWeight: FontWeight.w700,
                  fontSize: small ? 12 : 13)),
        ),
      ),
    );
  }

  Widget _cataloguesTab(List<_CatalogueGroup> groups) {
    if (groups.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'No store catalogues loaded yet. Open Near me so the scouts find catalogues around you.',
            textAlign: TextAlign.center,
            style: TextStyle(color: TS.mutedOf(context)),
          ),
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 0.72,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: groups.length,
      itemBuilder: (context, index) => _CatalogueGroupCard(
        group: groups[index],
        onTap: () => _openCatalogueGroup(groups[index]),
      ),
    );
  }

  Widget _overviewTab(DiscoveryResult result, int catalogueRetailers) {
    final stats = <List<String>>[
      ['Live deals found', '${result.foundDealCount}'],
      ['Sources checked', '${result.checkedSourceCount}'],
      ['Store leaflets', '${result.leafletCount}'],
      ['Catalogue retailers', '$catalogueRetailers'],
    ];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final stat in stats)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: TS.card(context),
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(stat[0].toUpperCase(), style: TS.eyebrowOf(context)),
                Text(stat[1],
                    style: const TextStyle(
                        fontSize: 24, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        Text(
          'Deals come from official retailer feeds and store catalogues. '
          'Big chains publish weekly catalogues, not per-item prices, so open '
          'a catalogue to see every special.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
        ),
      ],
    );
  }

  // One entry per retailer; multiple branch catalogues collapse into it.
  List<_CatalogueGroup> _groupCatalogues(List<Catalogue> catalogues) {
    final byRetailer = <String, _CatalogueGroup>{};
    for (final catalogue in catalogues) {
      final name = catalogue.retailerName ?? catalogue.name;
      final key = name.toLowerCase();
      byRetailer.putIfAbsent(key, () => _CatalogueGroup(name, []));
      byRetailer[key]!.catalogues.add(catalogue);
    }
    final groups = byRetailer.values.toList()
      ..sort((a, b) => a.retailerName.compareTo(b.retailerName));
    return groups;
  }

  void _openCatalogueGroup(_CatalogueGroup group) {
    if (group.catalogues.length == 1) {
      showCatalogueReader(context, group.catalogues.first);
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: TS.bgOf(context),
      shape: Border(top: BorderSide(color: TS.lineOf(context), width: 3)),
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(20),
          children: [
            Text('${group.retailerName} catalogues',
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            for (final catalogue in group.catalogues)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.menu_book_outlined,
                    color: TS.redOf(context)),
                title: Text(catalogue.name),
                subtitle: catalogue.validTo != null
                    ? Text('Until ${catalogue.validTo!.substring(0, 10)}')
                    : null,
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.of(context).pop();
                  showCatalogueReader(context, catalogue);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _save(Deal deal) async {
    // Optimistic: the button flips instantly and reverts only on failure.
    uxSuccess();
    setState(() => _savedDealIds.add(deal.id));
    try {
      await widget.api.saveDeal(deal);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _savedDealIds.remove(deal.id));
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Widget _retry({String message = 'Could not load deals.'}) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, style: TextStyle(color: TS.mutedOf(context))),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: TS.yellow, foregroundColor: TS.ink),
            onPressed: () => setState(_load),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _DealRow extends StatelessWidget {
  const _DealRow({
    required this.deal,
    required this.isSaved,
    this.isNew = false,
    this.onSave,
  });
  final Deal deal;
  final bool isSaved;
  final bool isNew;
  final VoidCallback? onSave;

  // WhatsApp is how deals travel between South African households.
  Future<void> _share() async {
    final parts = [
      deal.title,
      if (deal.priceText != null) deal.priceText!,
      'at ${deal.retailerName}',
      if (deal.productUrl != null) deal.productUrl!,
      'found on https://trolleyscout.co.za',
    ];
    final text = Uri.encodeComponent(parts.join(' · '));
    await launchUrl(Uri.parse('https://wa.me/?text=$text'),
        mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: deal.productUrl == null
          ? null
          : () => launchUrl(Uri.parse(deal.productUrl!),
              mode: LaunchMode.externalApplication),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: TS.card(context, width: 2),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _DealImage(imageUrl: deal.imageUrl),
                if (deal.imageUrl != null) const SizedBox(width: 10),
                Text(deal.retailerName.toUpperCase(),
                    style: TS.eyebrowOf(context)),
                if (isNew) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 1),
                    color: TS.yellow,
                    child: const Text('NEW',
                        style: TextStyle(
                            color: TS.ink,
                            fontSize: 10,
                            fontWeight: FontWeight.w900)),
                  ),
                ],
                if (deal.pageNumber != null) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                        border: Border.all(
                            color: TS.lineSoftOf(context), width: 1.5)),
                    child: Text('Page ${deal.pageNumber}',
                        style: TextStyle(
                            fontSize: 10,
                            color: TS.mutedOf(context),
                            fontWeight: FontWeight.w800)),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 4),
            Text(deal.title,
                style:
                    const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                if (deal.priceText != null)
                  Text(deal.priceText!,
                      style: TextStyle(
                          color: TS.redOf(context),
                          fontSize: 20,
                          fontWeight: FontWeight.w900)),
                const SizedBox(width: 8),
                if (deal.previousPriceText != null)
                  Text(deal.previousPriceText!,
                      style: TextStyle(
                          color: TS.faintOf(context),
                          decoration: TextDecoration.lineThrough,
                          fontSize: 13)),
              ],
            ),
            if (deal.savingText != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(deal.savingText!,
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 12)),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (deal.productUrl != null)
                  const Text('Open official page',
                      style: TextStyle(decoration: TextDecoration.underline)),
                const Spacer(),
                IconButton(
                  tooltip: 'Share on WhatsApp',
                  onPressed: _share,
                  icon: const Icon(Icons.share_outlined, size: 19),
                ),
                if (onSave != null)
                  OutlinedButton.icon(
                    onPressed: isSaved ? null : onSave,
                    icon: Icon(
                        isSaved ? Icons.bookmark : Icons.bookmark_outline,
                        size: 18),
                    label: Text(isSaved ? 'Saved' : 'Save'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DealImage extends StatelessWidget {
  const _DealImage({required this.imageUrl});
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    if (imageUrl == null) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Image.network(
        imageUrl!,
        width: 62,
        height: 62,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => Container(
          width: 62,
          height: 62,
          color: TS.surfaceOf(context),
          child: const Icon(Icons.image_not_supported_outlined),
        ),
      ),
    );
  }
}

class _CatalogueGroup {
  _CatalogueGroup(this.retailerName, this.catalogues);
  final String retailerName;
  final List<Catalogue> catalogues;
}

class _CatalogueGroupCard extends StatelessWidget {
  const _CatalogueGroupCard({required this.group, required this.onTap});
  final _CatalogueGroup group;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cover = group.catalogues
        .map((catalogue) => catalogue.imageUrl)
        .firstWhere((url) => url != null, orElse: () => null);
    final count = group.catalogues.length;

    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: TS.card(context, width: 2),
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SizedBox(
                width: double.infinity,
                child: cover == null
                    ? ColoredBox(
                        color: TS.surfaceOf(context),
                        child: const Icon(Icons.menu_book_outlined, size: 34),
                      )
                    : Image.network(cover,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => ColoredBox(
                              color: TS.surfaceOf(context),
                              child:
                                  const Icon(Icons.menu_book_outlined, size: 34),
                            )),
              ),
            ),
            const SizedBox(height: 6),
            Text(group.retailerName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w900)),
            Text(
              count == 1 ? group.catalogues.first.name : '$count catalogues',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: TS.mutedOf(context)),
            ),
          ],
        ),
      ),
    );
  }
}
