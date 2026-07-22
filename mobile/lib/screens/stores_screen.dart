import 'package:flutter/material.dart';

import '../api.dart';
import '../catalogue_sort.dart';
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
  late Future<_StoresData> _future = _load();
  final _savedUrls = <String>{};
  String _query = '';
  String _kind = 'all';

  Future<_StoresData> _load() async {
    final results = await Future.wait<dynamic>([
      widget.api.retailers(),
      widget.api.discoveredStores(),
    ]);
    return _StoresData(
      catalog: results[0] as RetailerCatalog,
      discovered: results[1] as DiscoveredStoresResult,
    );
  }

  void _reload() => setState(() => _future = _load());

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
        final retailers = catalog.retailers.where((retailer) {
          final matchesQuery = _query.isEmpty ||
              retailer.name.toLowerCase().contains(_query) ||
              retailer.group.toLowerCase().contains(_query) ||
              retailer.program.toLowerCase().contains(_query);
          final matchesKind = _kind == 'all' ||
              retailer.sources.any((source) => source.kind == _kind);
          return matchesQuery && matchesKind;
        }).toList();
        final allDiscoveredGroups = groupNearbyStores(data.discovered.stores);
        final discovered = allDiscoveredGroups.where((group) {
          if (_query.isEmpty) return true;
          return group.displayName.toLowerCase().contains(_query) ||
              group.branches.any((store) =>
                  store.name.toLowerCase().contains(_query) ||
                  (store.address?.toLowerCase().contains(_query) ?? false));
        }).toList();
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ScreenHeader(
              eyebrow: 'Official sources',
              title: 'Source directory',
              description:
                  '${allDiscoveredGroups.length} store groups covering ${data.discovered.storeCount} locations, plus official specials pages and store finders.',
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
              onChanged: (value) =>
                  setState(() => _query = value.trim().toLowerCase()),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final kind in ['all', ...catalog.sourceKinds])
                  ChoiceChip(
                    label: Text(_kindLabel(kind)),
                    selected: _kind == kind,
                    onSelected: (_) => setState(() => _kind = kind),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Text('Stores found near shoppers',
                style:
                    Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
            const SizedBox(height: 4),
            Text(
              'Saved from successful Near Me searches in the selected country.',
              style: TextStyle(color: TS.mutedOf(context)),
            ),
            const SizedBox(height: 10),
            if (discovered.isEmpty)
              const EmptyCard(
                message: 'No discovered stores match this search yet.',
                icon: Icons.travel_explore_outlined,
              )
            else
              for (final group in discovered)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _StoreLogo(
                              imageUrl: group.logoUrl,
                              label: group.displayName),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(group.displayName,
                                    style: const TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w900)),
                                Text(
                                  '${group.branches.length} ${group.branches.length == 1 ? 'location' : 'locations'}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${group.dealCount} deal${group.dealCount == 1 ? '' : 's'} · ${group.catalogueCount} catalogue${group.catalogueCount == 1 ? '' : 's'}',
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
                        ],
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: () => _showStoreGroup(group),
                        icon: const Icon(Icons.location_on_outlined),
                        label: Text(group.branches.length == 1
                            ? 'View location'
                            : 'View ${group.branches.length} locations'),
                      ),
                    ],
                  ),
                ),
            const SizedBox(height: 20),
            Text('Official retailer sources',
                style:
                    Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
            const SizedBox(height: 10),
            if (retailers.isEmpty)
              const EmptyCard(
                  message: 'No stores match those filters.',
                  icon: Icons.storefront_outlined)
            else
              for (final retailer in retailers)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _StoreLogo(
                              imageUrl: retailer.logoUrl, label: retailer.name),
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
                      for (final source in retailer.sources.where(
                          (source) => _kind == 'all' || source.kind == _kind))
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
                            onPressed: _savedUrls.contains(source.url)
                                ? null
                                : () => _save(retailer, source),
                            child: Text(_savedUrls.contains(source.url)
                                ? 'Saved'
                                : 'Save'),
                          ),
                        ),
                    ],
                  ),
                ),
          ],
        );
      },
    );
  }

  Future<void> _showStoreGroup(StoreGroup group) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: TS.bgOf(context),
        shape: const RoundedRectangleBorder(),
        builder: (_) => FractionallySizedBox(
          heightFactor: 0.92,
          child: _StoreGroupSheet(group: group, api: widget.api),
        ),
      );
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
                fit: BoxFit.contain, errorBuilder: (_, __, ___) => fallback),
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
                    '${branch.deals.length} current deal${branch.deals.length == 1 ? '' : 's'} · '
                    '${branch.catalogues.length} catalogue${branch.catalogues.length == 1 ? '' : 's'}',
                    style: TS.eyebrowOf(context),
                  ),
                  if (!branch.hasSomething)
                    Text('No current deals found yet.',
                        style: TextStyle(color: TS.mutedOf(context))),
                ],
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}

class _BranchDetailScreen extends StatelessWidget {
  const _BranchDetailScreen({required this.branch, required this.api});

  final NearbyStore branch;
  final Api api;

  bool get _hasLocation => branch.lat != 0 && branch.lon != 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      appBar: AppBar(title: Text(branch.name)),
      body: ListView(
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
              PaperCard(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: _StoreLogo(
                    imageUrl: catalogue.coverImageUrl,
                    label: catalogue.name,
                  ),
                  title: Text(catalogue.name),
                  subtitle: catalogue.validTo == null
                      ? null
                      : Text('Valid until ${_shortDate(catalogue.validTo!)}'),
                  trailing: const Icon(Icons.menu_book_outlined),
                  onTap: () => showCatalogueReader(context, catalogue),
                ),
              ),
        ],
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
                        errorBuilder: (_, __, ___) => fallback,
                      ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(deal.title)),
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
