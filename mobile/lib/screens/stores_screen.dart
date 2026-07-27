import 'package:flutter/material.dart';

import '../api.dart';
import '../saved_addresses_store.dart';
import '../catalogue_sort.dart';
import '../favourite_stores_store.dart';
import '../store_grouping.dart';
import '../theme.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/common.dart';
import '../widgets/store_map_view.dart';
import '../widgets/in_app_browser.dart';

class StoresScreen extends StatefulWidget {
  const StoresScreen(
      {super.key, required this.api, required this.isAuthenticated});

  final Api api;
  final bool isAuthenticated;

  @override
  State<StoresScreen> createState() => _StoresScreenState();
}

class _StoresScreenState extends State<StoresScreen> {
  static const _pageSize = 60;

  late Future<_StoresData> _future;
  final _savedUrls = <String>{};
  final _addressesStore = SavedAddressesStore();
  final _favouriteStore = FavouriteStoresStore();
  List<FavouriteStore> _favourites = const [];
  String _query = '';
  String _storeTab = 'all';
  bool _loadingMore = false;

  // Where the shopper is, taken from the address they most recently saved on
  // Near me. Null means they have not told us yet, and the directory stays
  // national rather than guessing at a location for them.
  SavedAddress? _origin;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_StoresData> _load() async {
    final addresses = await _addressesStore.load();
    final favourites = await _favouriteStore.load();
    _origin = addresses.isEmpty ? null : addresses.first;
    _favourites = favourites;

    final results = await Future.wait<dynamic>([
      widget.api.retailers(),
      widget.api.discoveredStores(
        limit: _pageSize,
        includeDetails: false,
        lat: _origin?.lat,
        lon: _origin?.lon,
      ),
    ]);
    return _StoresData(
      catalog: results[0] as RetailerCatalog,
      discovered: results[1] as DiscoveredStoresResult,
    );
  }

  void _reload() => setState(() {
        _future = _load();
      });

  // Typing filters the already-loaded stores and retailers instantly on the
  // client — no per-keystroke server round trip, so results never flicker
  // between a locally filtered list and a server-filtered one. The server is
  // only asked for more results via "Load more" (pagination) or the initial
  // load, so search only reaches what's already been fetched.
  void _search(String value) {
    setState(() => _query = value.trim().toLowerCase());
  }

  Future<void> _loadMore(_StoresData current) async {
    if (_loadingMore || !current.discovered.hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final next = await widget.api.discoveredStores(
        limit: _pageSize,
        offset: current.discovered.stores.length,
        includeDetails: false,
        lat: _origin?.lat,
        lon: _origin?.lon,
      );
      final byId = <String, NearbyStore>{
        for (final store in current.discovered.stores) store.placeId: store,
        for (final store in next.stores) store.placeId: store,
      };
      final merged = DiscoveredStoresResult(
        stores: byId.values.toList(),
        storeCount: next.storeCount,
        areaCount: next.areaCount,
        knownChainCount: next.knownChainCount,
        withPromotionsCount: next.withPromotionsCount,
        hasMore: next.hasMore,
        limit: next.limit,
        offset: next.offset,
        country: next.country ?? current.discovered.country,
      );
      if (mounted) {
        setState(() {
          _future = Future.value(
            _StoresData(catalog: current.catalog, discovered: merged),
          );
        });
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _save(Retailer retailer, RetailerSource source) async {
    if (!widget.isAuthenticated) {
      showNotice(context, 'Log in to save official sources.');
      return;
    }
    try {
      await widget.api.saveSource(retailer.id, source.url);
      if (mounted) setState(() => _savedUrls.add(source.url));
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  bool _isFavourite(String id) =>
      _favourites.any((favourite) => favourite.id == id);

  Future<void> _toggleFavourite(StoreGroup group) async {
    final next = await _favouriteStore.toggle(FavouriteStore(
      id: group.id,
      displayName: group.displayName,
      savedAt: DateTime.now().millisecondsSinceEpoch,
    ));
    if (mounted) setState(() => _favourites = next);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_StoresData>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Could not load the store directory.', onRetry: _reload);
        }
        final data = snapshot.data!;
        final catalog = data.catalog;
        final country = catalog.country ?? data.discovered.country;
        final retailers = catalog.retailers.where((retailer) {
          final matchesQuery = _query.isEmpty ||
              retailer.name.toLowerCase().contains(_query) ||
              retailer.group.toLowerCase().contains(_query) ||
              retailer.program.toLowerCase().contains(_query);
          return matchesQuery;
        }).toList();
        final allDiscoveredGroups = groupNearbyStores(data.discovered.stores);
        final discovered = allDiscoveredGroups.where((group) {
          if (_storeTab == 'favourites' && !_isFavourite(group.id)) {
            return false;
          }
          if (_query.isEmpty) return true;
          return group.displayName.toLowerCase().contains(_query) ||
              group.branches.any((store) =>
                  store.name.toLowerCase().contains(_query) ||
                  (store.address?.toLowerCase().contains(_query) ?? false));
        }).toList();

        return CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ScreenHeader(
                      eyebrow: 'Official sources',
                      title: 'Source directory',
                      description:
                          'Showing ${allDiscoveredGroups.length} store groups from ${data.discovered.storeCount} locations'
                          '${_origin == null ? '' : ' near ${_origin!.label}'}'
                          '${country == null ? '' : ' in ${country.name}'}, plus official specials pages and store finders.',
                      action: IconButton(
                          tooltip: 'Refresh stores',
                          onPressed: _reload,
                          icon: const Icon(Icons.refresh)),
                    ),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Search stores',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: _search,
                    ),
                    const SizedBox(height: 16),
                    SegmentedButton<String>(
                      segments: [
                        const ButtonSegment(
                          value: 'all',
                          label: Text('All stores'),
                          icon: Icon(Icons.storefront_outlined),
                        ),
                        ButtonSegment(
                          value: 'favourites',
                          label: Text('Favourites ${_favourites.length}'),
                          icon: const Icon(Icons.favorite_outline),
                        ),
                      ],
                      selected: {_storeTab},
                      onSelectionChanged: (selection) =>
                          setState(() => _storeTab = selection.first),
                    ),
                    const SizedBox(height: 16),
                    Text('Stores found near shoppers',
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display)),
                    const SizedBox(height: 4),
                    Text(
                      'Saved from successful Near Me searches in the selected country.',
                      style: TextStyle(color: TS.mutedOf(context)),
                    ),
                    const SizedBox(height: 10),
                    if (discovered.isEmpty)
                      EmptyCard(
                        message: _storeTab == 'favourites'
                            ? 'No favourite stores yet.'
                            : 'No discovered stores match this search yet.',
                        icon: _storeTab == 'favourites'
                            ? Icons.favorite_outline
                            : Icons.travel_explore_outlined,
                      ),
                  ],
                ),
              ),
            ),
            if (discovered.isNotEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.builder(
                  itemCount: discovered.length,
                  itemBuilder: (context, index) => _DiscoveredGroupCard(
                    group: discovered[index],
                    api: widget.api,
                    isFavourite: _isFavourite(discovered[index].id),
                    onToggleFavourite: () =>
                        _toggleFavourite(discovered[index]),
                  ),
                ),
              ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (data.discovered.hasMore) ...[
                      const SizedBox(height: 2),
                      OutlinedButton.icon(
                        onPressed: _loadingMore ? null : () => _loadMore(data),
                        icon: _loadingMore
                            ? const SizedBox.square(
                                dimension: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.expand_more),
                        label: Text(_loadingMore
                            ? 'Loading stores…'
                            : 'Load more stores'),
                      ),
                    ],
                    const SizedBox(height: 20),
                    Text('Official retailer sources',
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display)),
                    const SizedBox(height: 10),
                    if (retailers.isEmpty)
                      const EmptyCard(
                          message: 'No stores match those filters.',
                          icon: Icons.storefront_outlined),
                  ],
                ),
              ),
            ),
            if (retailers.isNotEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.builder(
                  itemCount: retailers.length,
                  itemBuilder: (context, index) => _RetailerCard(
                    retailer: retailers[index],
                    savedUrls: _savedUrls,
                    onSave: _save,
                  ),
                ),
              ),
            const SliverPadding(padding: EdgeInsets.only(bottom: 16)),
          ],
        );
      },
    );
  }
}

class _DiscoveredGroupCard extends StatelessWidget {
  const _DiscoveredGroupCard({
    required this.group,
    required this.api,
    required this.isFavourite,
    required this.onToggleFavourite,
  });

  final StoreGroup group;
  final Api api;
  final bool isFavourite;
  final VoidCallback onToggleFavourite;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _StoreLogo(imageUrl: group.logoUrl, label: group.displayName),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(group.displayName,
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w900)),
                    Text(
                      '${group.branches.length} ${group.branches.length == 1 ? 'location' : 'locations'}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${group.offerCount} current offer${group.offerCount == 1 ? '' : 's'}',
                      style: TS.eyebrowOf(context),
                    ),
                    if (group.nearestDistanceM != null)
                      Text(
                        'Nearest ${_distance(group.nearestDistanceM!)}',
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
              IconButton(
                tooltip: isFavourite
                    ? 'Remove ${group.displayName} from favourites'
                    : 'Add ${group.displayName} to favourites',
                onPressed: onToggleFavourite,
                icon: Icon(
                  isFavourite ? Icons.favorite : Icons.favorite_border,
                  color: isFavourite ? TS.redOf(context) : TS.mutedOf(context),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => _showStoreGroup(context),
            icon: const Icon(Icons.storefront_outlined),
            label: const Text('Enter store'),
          ),
        ],
      ),
    );
  }

  Future<void> _showStoreGroup(BuildContext context) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: TS.bgOf(context),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TS.controlRadius),
        ),
        builder: (_) => FractionallySizedBox(
          heightFactor: 0.92,
          child: _StoreGroupSheet(group: group, api: api),
        ),
      );
}

class _RetailerCard extends StatelessWidget {
  const _RetailerCard({
    required this.retailer,
    required this.savedUrls,
    required this.onSave,
  });

  final Retailer retailer;
  final Set<String> savedUrls;
  final Future<void> Function(Retailer, RetailerSource) onSave;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _StoreLogo(imageUrl: retailer.logoUrl, label: retailer.name),
              const SizedBox(width: 10),
              Expanded(
                child: Text(retailer.name,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.merge(TS.display)),
              ),
            ],
          ),
          Text('${retailer.group} · ${retailer.program}',
              style: TextStyle(color: TS.mutedOf(context))),
          const SizedBox(height: 6),
          Text(retailer.sourceNote),
          const SizedBox(height: 10),
          for (final source in retailer.sources)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.link),
              title: Text(source.label),
              subtitle: Text(_kindLabel(source.kind)),
              onTap: () => showInAppBrowser(
                context,
                source.url,
                title: retailer.name,
              ),
              trailing: OutlinedButton(
                onPressed: savedUrls.contains(source.url)
                    ? null
                    : () => onSave(retailer, source),
                child: Text(savedUrls.contains(source.url) ? 'Saved' : 'Save'),
              ),
            ),
        ],
      ),
    );
  }
}

class _StoresData {
  const _StoresData({required this.catalog, required this.discovered});

  final RetailerCatalog catalog;
  final DiscoveredStoresResult discovered;
}

class _StoreLogo extends StatelessWidget {
  const _StoreLogo({required this.imageUrl, required this.label});

  final String? imageUrl;
  final String label;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      color: TS.surfaceOf(context),
      alignment: Alignment.center,
      child: Text(
        label.isEmpty ? '?' : label.characters.first.toUpperCase(),
        style: const TextStyle(fontWeight: FontWeight.w900),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: SizedBox(
        width: 46,
        height: 46,
        child: imageUrl == null
            ? fallback
            : Image.network(imageUrl!,
                fit: BoxFit.contain,
                cacheWidth: 138,
                cacheHeight: 138,
                errorBuilder: (_, __, ___) => fallback),
      ),
    );
  }
}

class _StoreGroupSheet extends StatelessWidget {
  const _StoreGroupSheet({required this.group, required this.api});

  final StoreGroup group;
  final Api api;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
          child: Row(
            children: [
              _StoreLogo(imageUrl: group.logoUrl, label: group.displayName),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(group.displayName,
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display)),
                    Text(
                      '${group.branches.length} ${group.branches.length == 1 ? 'location' : 'locations'}',
                      style: TextStyle(color: TS.mutedOf(context)),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Close locations',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
        Divider(height: 1, color: TS.lineSoftOf(context)),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: group.branches.length,
            itemBuilder: (context, index) =>
                _BranchCard(branch: group.branches[index], api: api),
          ),
        ),
      ],
    );
  }
}

class _BranchCard extends StatelessWidget {
  const _BranchCard({required this.branch, required this.api});

  final NearbyStore branch;
  final Api api;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => _BranchDetailScreen(branch: branch, api: api),
      )),
      child: PaperCard(
        margin: const EdgeInsets.only(bottom: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(branch.name,
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w900)),
                  if (branch.address != null) ...[
                    const SizedBox(height: 2),
                    Text(branch.address!,
                        style: TextStyle(color: TS.mutedOf(context))),
                  ],
                  if (branch.distanceM != null)
                    Text(_distance(branch.distanceM!),
                        style: TextStyle(
                            color: TS.mutedOf(context), fontSize: 12)),
                  const SizedBox(height: 8),
                  Text(
                    '${branch.promotionCount} current offer${branch.promotionCount == 1 ? '' : 's'}',
                    style: TS.eyebrowOf(context),
                  ),
                  if (branch.promotionCount == 0)
                    Text('No current deals found yet.',
                        style: TextStyle(color: TS.mutedOf(context))),
                ],
              ),
            ),
            const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Enter store',
                    style: TextStyle(fontWeight: FontWeight.w800)),
                Icon(Icons.chevron_right),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _BranchDetailScreen extends StatefulWidget {
  const _BranchDetailScreen({required this.branch, required this.api});

  final NearbyStore branch;
  final Api api;

  @override
  State<_BranchDetailScreen> createState() => _BranchDetailScreenState();
}

class _BranchDetailScreenState extends State<_BranchDetailScreen> {
  late Future<NearbyStore> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<NearbyStore> _load() async {
    if (widget.branch.detailsLoaded) return widget.branch;
    final result = await widget.api.discoveredStores(
      limit: 1,
      placeId: widget.branch.placeId,
    );
    if (result.stores.isEmpty) {
      throw const ApiException('This store is no longer available.');
    }
    return result.stores.first;
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      appBar: AppBar(title: Text(widget.branch.name)),
      body: FutureBuilder<NearbyStore>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const LoadingPane();
          }
          if (snapshot.hasError || snapshot.data == null) {
            return ErrorPane(
              message: 'Could not load this store’s current offers.',
              onRetry: _retry,
            );
          }
          return _BranchDetailBody(branch: snapshot.data!, api: widget.api);
        },
      ),
    );
  }
}

class _BranchDetailBody extends StatelessWidget {
  const _BranchDetailBody({required this.branch, required this.api});

  final NearbyStore branch;
  final Api api;

  bool get _hasLocation => branch.lat != 0 && branch.lon != 0;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (branch.address != null)
          Text(branch.address!, style: TextStyle(color: TS.mutedOf(context))),
        if (branch.distanceM != null)
          Text(_distance(branch.distanceM!),
              style: TextStyle(color: TS.mutedOf(context))),
        if (_hasLocation) ...[
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () => StoreMapView.open(
                context,
                api: api,
                storeName: branch.name,
                lat: branch.lat.toDouble(),
                lon: branch.lon.toDouble(),
                storeAddress: branch.address,
              ),
              icon: const Icon(Icons.map_outlined, size: 18),
              label: const Text('View on map'),
            ),
          ),
        ],
        if (branch.website != null) ...[
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () => showInAppBrowser(
                context,
                branch.website,
                title: branch.name,
              ),
              icon: const Icon(Icons.language, size: 18),
              label: const Text('Open official website'),
            ),
          ),
        ],
        const SizedBox(height: 18),
        Text('Current deals', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        if (branch.deals.isEmpty)
          const EmptyCard(
            message: 'No current deals have been found for this store yet.',
            icon: Icons.local_offer_outlined,
          )
        else
          for (final deal in branch.deals) _BranchDealRow(deal: deal),
        const SizedBox(height: 18),
        Text('Catalogues', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        if (branch.catalogues.isEmpty)
          const EmptyCard(
            message:
                'No current catalogues have been found for this store yet.',
            icon: Icons.menu_book_outlined,
          )
        else
          for (final catalogue in sortCataloguesMostRecent(branch.catalogues))
            _CatalogueCard(catalogue: catalogue),
      ],
    );
  }
}

class _CatalogueCard extends StatelessWidget {
  const _CatalogueCard({required this.catalogue});

  final Catalogue catalogue;

  @override
  Widget build(BuildContext context) {
    final cover = catalogue.coverImageUrl;
    final format = catalogue.pages.length > 1
        ? '${catalogue.pages.length} pages'
        : catalogue.pagesUrl != null
            ? 'Multi-page catalogue'
            : catalogue.isDirectPdf
                ? 'Full PDF'
                : catalogue.pages.length == 1
                    ? '1 page'
                    : 'Store catalogue';
    final fallback = ColoredBox(
      color: TS.surfaceSoftOf(context),
      child: Center(
        child: Icon(
          Icons.menu_book_outlined,
          color: TS.mutedOf(context),
          size: 34,
        ),
      ),
    );

    return InkWell(
      onTap: () => showCatalogueReader(context, catalogue),
      child: PaperCard(
        margin: const EdgeInsets.only(bottom: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 86,
              height: 116,
              child: cover == null
                  ? fallback
                  : Image.network(
                      cover,
                      fit: BoxFit.contain,
                      cacheWidth: 258,
                      errorBuilder: (_, __, ___) => fallback,
                    ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    catalogue.name,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(format, style: TS.eyebrowOf(context)),
                  if (catalogue.validTo != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      'Valid until ${_shortDate(catalogue.validTo!)}',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text(
                        'Read catalogue',
                        style: TextStyle(
                          color: TS.redOf(context),
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        Icons.arrow_forward,
                        color: TS.redOf(context),
                        size: 17,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BranchDealRow extends StatelessWidget {
  const _BranchDealRow({required this.deal});

  final Deal deal;

  @override
  Widget build(BuildContext context) {
    final fallback = ColoredBox(
      color: TS.surfaceSoftOf(context),
      child: Icon(Icons.local_offer_outlined, color: TS.mutedOf(context)),
    );
    return InkWell(
      onTap: deal.productUrl == null
          ? null
          : () => showInAppBrowser(
                context,
                deal.productUrl,
                title: deal.retailerName,
              ),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: SizedBox(
                width: 44,
                height: 44,
                child: deal.imageUrl == null
                    ? fallback
                    : Image.network(
                        deal.imageUrl!,
                        fit: BoxFit.contain,
                        cacheWidth: 132,
                        cacheHeight: 132,
                        errorBuilder: (_, __, ___) => fallback,
                      ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(deal.title),
                  if (deal.savingText != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      deal.savingText!,
                      style: TextStyle(
                        color: TS.greenOf(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                  if (deal.validTo != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      'Valid until ${_shortDate(deal.validTo!)}',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (deal.priceText != null)
              Text(
                deal.priceText!,
                style: TextStyle(
                  color: TS.redOf(context),
                  fontWeight: FontWeight.w900,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _distance(num metres) => metres < 1000
    ? '${metres.round()} m'
    : '${(metres / 1000).toStringAsFixed(1)} km';

String _shortDate(String value) =>
    value.length <= 10 ? value : value.substring(0, 10);

String _kindLabel(String kind) => switch (kind) {
      'app' => 'App',
      'loyalty' => 'Loyalty',
      'store-finder' => 'Store finder',
      'specials' => 'Specials',
      _ => 'All',
    };
