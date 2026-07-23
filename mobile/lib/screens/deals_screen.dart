import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../catalogue_sort.dart';
import '../deal_categories.dart';
import '../deal_alert_background.dart';
import '../deal_alert_scheduler.dart';
import '../deal_filters.dart';
import '../discovery_cache.dart';
import '../notification_prefs_store.dart';
import '../notifications.dart';
import '../price_display.dart';
import '../taste_profile.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/common.dart' show validUntilInfo;
import '../widgets/login_gate_card.dart';
import '../widgets/scout_mascot.dart';
import '../widgets/skeleton.dart';
import '../widgets/sponsored_ad_card.dart';
import '../widgets/in_app_browser.dart';

class DealsScreen extends StatefulWidget {
  const DealsScreen({
    super.key,
    required this.api,
    this.isAuthenticated = false,
    this.onWatchesChanged,
    this.onWantsAuth,
    this.initialRetailerId,
    this.initialQuery,
    this.alertScheduler,
    this.requestNotificationPermission,
    this.openNotificationSettings,
  });
  final Api api;
  final bool isAuthenticated;
  final VoidCallback? onWatchesChanged;
  final VoidCallback? onWantsAuth;
  // When arriving from a Near-me store card, pre-filter to that store's deals.
  final String? initialRetailerId;
  final String? initialQuery;
  final DealAlertScheduler? alertScheduler;
  final Future<bool> Function()? requestNotificationPermission;
  final Future<bool> Function()? openNotificationSettings;

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  static const _perPage = 24;
  static const _cacheReuseDuration = Duration(hours: 3);
  Future<DiscoveryResult>? _future;
  int _page = 0;
  final Set<String> _savedDealIds = {};
  final Set<String> _addingDealIds = {};
  String _query = '';
  String _retailerId = 'all';
  String _sourceLabel = 'all';
  bool _imagesOnly = false;
  bool _savingsOnly = false;
  bool _advancedOpen = false;
  DealSort _sort = DealSort.store;
  DealCategory? _category;
  FoodSubcategory? _foodSubcategory;
  Timer? _searchDebounce;
  final _searchController = TextEditingController();
  bool _creatingWatch = false;
  final _cacheStore = DiscoveryCache();
  CachedDiscovery? _cached;
  Set<String> _previousDealIds = const {};
  static const _sampleLimit = 6;
  List<PublicAd> _ads = const [];
  List<Deal> _siteDeals = const [];
  final _notifPrefs = NotificationPrefsStore();
  late final DealAlertScheduler _alertScheduler;
  bool _notifyNewDeals = false;
  bool _notifBusy = false;
  final _tasteStore = TasteStore();
  TasteProfile _taste = const TasteProfile.empty();

  @override
  void initState() {
    super.initState();
    _alertScheduler = widget.alertScheduler ?? DealAlertScheduler();
    _query = widget.initialQuery ?? '';
    _retailerId = widget.initialRetailerId?.isNotEmpty == true
        ? widget.initialRetailerId!
        : 'all';
    _searchController.text = _query;
    _load();
    _loadAds();
    _loadSiteDeals();
    _restoreNotifyPref();
    _restoreTaste();
  }

  // Load the taste profile learned from Window Shopping. When the shopper has
  // shown taste, Find a deal defaults to "For you" so the list opens on what
  // they like — they can still switch sort manually.
  Future<void> _restoreTaste() async {
    final taste = await _tasteStore.load();
    if (!mounted || taste.isEmpty) return;
    setState(() {
      _taste = taste;
      if (_sort == DealSort.store) _sort = DealSort.forYou;
    });
  }

  Future<void> _loadAds() async {
    try {
      final ads = await widget.api.publicAds('feed');
      if (mounted) setState(() => _ads = ads);
    } catch (_) {
      // Sponsored slot simply stays empty if the feed is unreachable.
    }
  }

  // Flash deals from OneDayOnly, Hyperli, Daddy's Deals and MyRunway, folded
  // into the Find-a-deal list next to grocery specials.
  Future<void> _loadSiteDeals() async {
    if (widget.api.effectiveCountryCode != 'ZA') {
      if (mounted) setState(() => _siteDeals = const []);
      return;
    }
    try {
      final items = await widget.api.dealSites();
      if (mounted) {
        setState(
            () => _siteDeals = items.map((item) => item.toDeal()).toList());
      }
    } catch (_) {
      // The list still shows grocery deals if the deal-site feed is down.
    }
  }

  Future<void> _restoreNotifyPref() async {
    final local = await _notifPrefs.loadOptIn();
    if (mounted) setState(() => _notifyNewDeals = local);
    if (local) await _alertScheduler.setEnabled(true);
    // When signed in, the server is the source of truth across devices.
    if (widget.isAuthenticated) {
      try {
        final prefs = await widget.api.notificationPreferences();
        final enabledOnDevice = prefs.newDeals && local;
        if (mounted) setState(() => _notifyNewDeals = enabledOnDevice);
        await _notifPrefs.saveOptIn(enabledOnDevice);
        if (enabledOnDevice != local) {
          await _alertScheduler.setEnabled(enabledOnDevice);
        }
      } catch (_) {
        // Keep the local value.
      }
    }
  }

  Future<void> _toggleNotify(bool value) async {
    if (_notifBusy) return;
    setState(() => _notifBusy = true);
    try {
      if (value) {
        if (!widget.isAuthenticated) {
          widget.onWantsAuth?.call();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Log in to receive new-deal alerts.'),
            ));
          }
          return;
        }
        final granted = await (widget.requestNotificationPermission?.call() ??
            DealNotifications.instance.requestPermission());
        if (!granted) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: const Text('Notifications are off for Trolley Scout.'),
              action: SnackBarAction(
                label: 'Settings',
                onPressed: _openNotificationSettings,
              ),
            ));
          }
          return;
        }
      }

      var effectiveValue = value;
      if (widget.isAuthenticated) {
        try {
          final server = await widget.api.setNotificationPreferences(value);
          effectiveValue = server.newDeals;
        } catch (_) {
          if (mounted) {
            ScaffoldMessenger.of(context)
              ..hideCurrentSnackBar()
              ..showSnackBar(const SnackBar(
                content: Text('Could not update deal alerts. Try again.'),
              ));
          }
          return;
        }
      }

      await _notifPrefs.saveOptIn(effectiveValue);
      await _alertScheduler.setEnabled(effectiveValue);
      if (effectiveValue) {
        unawaited(DealAlertPoller(
          api: widget.api,
          preferences: _notifPrefs,
          scheduler: _alertScheduler,
        ).run());
      }
      if (mounted) {
        setState(() => _notifyNewDeals = effectiveValue);
        // Preview the reward chime the moment alerts are switched on.
        if (effectiveValue) {
          uxReward();
        } else {
          uxTap();
        }
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(
            content: Text(effectiveValue
                ? 'On. We’ll alert you when new deals land.'
                : 'Off. You won’t get new-deal alerts.'),
          ));
      }
    } finally {
      if (mounted) setState(() => _notifBusy = false);
    }
  }

  void _openNotificationSettings() {
    unawaited(
      (widget.openNotificationSettings?.call() ?? Geolocator.openAppSettings())
          .catchError((_) => false),
    );
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

  Future<DiscoveryResult> _loadStoredDiscovery() async {
    final countryCode = widget.api.effectiveCountryCode;
    final cached = await _cacheStore.load(countryCode);
    if (cached != null && mounted) {
      setState(() => _cached = cached);
    }
    _previousDealIds = cached?.dealIds ?? const {};
    if (cached != null) {
      final age = DateTime.now().toUtc().difference(cached.fetchedAt.toUtc());
      if (!age.isNegative && age < _cacheReuseDuration) {
        return cached.result;
      }
    }

    final result = await widget.api.discovery();
    unawaited(_cacheStore.save(result, DateTime.now(), countryCode));
    return result;
  }

  void _load() => _future = _loadStoredDiscovery();

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
    final allDeals = _sortByPage([...result.deals, ..._siteDeals]);
    final retailers = <String, String>{
      for (final deal in allDeals) deal.retailerId: deal.retailerName,
    };
    final sources = allDeals
        .map((deal) => deal.sourceLabel)
        .where((source) => source.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    final deals = sortDeals(
      filterDeals(
        allDeals,
        query: _query,
        retailerId: _retailerId,
        sourceLabel: _sourceLabel,
        imagesOnly: _imagesOnly,
        savingsOnly: _savingsOnly,
        category: _category,
        foodSubcategory: _foodSubcategory,
      ),
      _sort,
      taste: _taste,
    );
    if (deals.isEmpty) {
      return _dealBoard(result, deals, retailers, sources, const [], 0, 0,
          staleNote: staleNote);
    }

    // Logged-out shoppers see a taste of the list; a gate invites them in for
    // the rest. Real pagination only applies once they are signed in.
    if (!widget.isAuthenticated) {
      final sample = deals.take(_sampleLimit).toList();
      return _dealBoard(result, deals, retailers, sources, sample, 0, 1,
          staleNote: staleNote, sampled: deals.length > sample.length);
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
    bool sampled = false,
  }) {
    final catalogueGroups = _groupCatalogues(result.catalogues);

    return DefaultTabController(
      length: 2,
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
                    style:
                        TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
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
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _dealsTab(deals, retailers, sources, slice, page, pageCount,
                    sampled: sampled),
                _cataloguesTab(catalogueGroups),
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
    int pageCount, {
    bool sampled = false,
  }) {
    return RefreshIndicator(
      color: TS.redOf(context),
      onRefresh: () async {
        _loadSiteDeals();
        _loadAds();
        setState(() {
          _page = 0;
          _load();
        });
      },
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
          _advancedFilters(retailers, sources),
          const SizedBox(height: 8),
          _categoryChips(),
          if (_category == DealCategory.food) ...[
            const SizedBox(height: 6),
            _foodSubcategoryChips(),
          ],
          const SizedBox(height: 10),
          _notifyToggle(),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text('${deals.length} matching deals',
                    style: TS.eyebrowOf(context)),
              ),
              _sortControl(),
            ],
          ),
          const SizedBox(height: 8),
          if (_ads.isNotEmpty && page == 0) SponsoredAdCard(ad: _ads.first),
          if (deals.isEmpty)
            Container(
              decoration: TS.card(context),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Center(
                    child: ScoutMascot(
                      pose: ScoutMascotPose.search,
                      size: 104,
                    ),
                  ),
                  if (_query.trim().length < 3)
                    const Text('No deals match those filters.')
                  else ...[
                    Text('No deal for “${_query.trim()}” yet.',
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    Text(
                      widget.isAuthenticated
                          ? 'Watch it and Trolley Scout will alert you the moment '
                              'any scout or another shopper’s search finds one.'
                          : 'Log in and Trolley Scout can watch this item for you, '
                              'then alert you the moment a deal appears.',
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 13),
                    ),
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                          backgroundColor: TS.yellow, foregroundColor: TS.ink),
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
              isAddingToBasket: _addingDealIds.contains(deal.id),
              onAddToBasket:
                  widget.isAuthenticated ? () => _addToBasket(deal) : null,
            ),
          if (sampled && widget.onWantsAuth != null)
            LoginGateCard(
              message:
                  'You are seeing ${slice.length} of ${deals.length} deals. '
                  'Log in or sign up free to see them all, sort, and save.',
              onLogin: widget.onWantsAuth!,
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

  Widget _notifyToggle() {
    return Container(
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context), width: 2),
        borderRadius: BorderRadius.circular(TS.controlRadius),
      ),
      padding: const EdgeInsets.fromLTRB(12, 4, 8, 4),
      child: Row(
        children: [
          Icon(Icons.notifications_active_outlined,
              size: 20, color: TS.redOf(context)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Alert me about new deals',
                    style:
                        TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                Text('We’ll notify you when fresh deals land.',
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 11)),
              ],
            ),
          ),
          Switch(
            value: _notifyNewDeals,
            onChanged: _notifBusy ? null : _toggleNotify,
          ),
        ],
      ),
    );
  }

  Widget _advancedFilters(Map<String, String> retailers, List<String> sources) {
    final activeCount = [
      _retailerId != 'all',
      _sourceLabel != 'all',
      _imagesOnly,
      _savingsOnly,
    ].where((active) => active).length;

    return Container(
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context), width: 2),
      ),
      child: Column(
        children: [
          ListTile(
            title: const Text('Advanced filters',
                style: TextStyle(fontWeight: FontWeight.w900)),
            subtitle: activeCount == 0
                ? const Text('Retailer, source, images and savings')
                : Text('$activeCount active'),
            trailing:
                Icon(_advancedOpen ? Icons.expand_less : Icons.expand_more),
            onTap: () => setState(() => _advancedOpen = !_advancedOpen),
          ),
          if (_advancedOpen)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          key: ValueKey('retailer-$_retailerId'),
                          initialValue: retailers.containsKey(_retailerId)
                              ? _retailerId
                              : 'all',
                          decoration:
                              const InputDecoration(labelText: 'Retailer'),
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
                          initialValue: sources.contains(_sourceLabel)
                              ? _sourceLabel
                              : 'all',
                          decoration:
                              const InputDecoration(labelText: 'Source'),
                          items: [
                            const DropdownMenuItem(
                                value: 'all', child: Text('All sources')),
                            for (final source in sources)
                              DropdownMenuItem(
                                  value: source, child: Text(source)),
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
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _sortControl() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context), width: 2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.swap_vert, size: 16, color: TS.mutedOf(context)),
          const SizedBox(width: 4),
          DropdownButtonHideUnderline(
            child: DropdownButton<DealSort>(
              value: _sort,
              isDense: true,
              borderRadius: BorderRadius.circular(TS.controlRadius),
              style: TextStyle(
                color: TS.inkOf(context),
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
              items: [
                for (final option in dealSortOptions)
                  DropdownMenuItem(value: option.id, child: Text(option.label)),
              ],
              onChanged: (value) {
                if (value == null) return;
                uxTap();
                setState(() {
                  _sort = value;
                  _page = 0;
                });
              },
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
          _chip(
              'All',
              _category == null,
              () => setState(() {
                    _category = null;
                    _foodSubcategory = null;
                    _page = 0;
                  })),
          for (final option in categoryOptions)
            _chip(
                '${option.icon} ${option.label}',
                _category == option.id,
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
          _chip(
              'All food',
              _foodSubcategory == null,
              () => setState(() {
                    _foodSubcategory = null;
                    _page = 0;
                  }),
              small: true),
          for (final option in foodSubcategoryOptions)
            _chip(
                option.label,
                _foodSubcategory == option.id,
                () => setState(() {
                      _foodSubcategory = option.id;
                      _page = 0;
                    }),
                small: true),
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
                  color: active ? TS.surfaceOf(context) : TS.inkOf(context),
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

  // One entry per retailer; multiple branch catalogues collapse into it.
  List<_CatalogueGroup> _groupCatalogues(List<Catalogue> catalogues) {
    final byRetailer = <String, _CatalogueGroup>{};
    for (final catalogue in sortCataloguesMostRecent(catalogues)) {
      final name = catalogue.retailerName ?? catalogue.name;
      final key = name.toLowerCase();
      byRetailer.putIfAbsent(key, () => _CatalogueGroup(name, []));
      byRetailer[key]!.catalogues.add(catalogue);
    }
    return byRetailer.values.toList();
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
                style:
                    const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            for (final catalogue in group.catalogues)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading:
                    Icon(Icons.menu_book_outlined, color: TS.redOf(context)),
                title: Text(catalogue.name),
                subtitle: _catalogueValidToSubtitle(context, catalogue),
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

  Future<void> _addToBasket(Deal deal) async {
    uxSuccess();
    setState(() => _addingDealIds.add(deal.id));
    try {
      await widget.api.saveDealToBasket(deal);
      if (!mounted) return;
      setState(() => _savedDealIds.add(deal.id));
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Added to your basket.')));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _addingDealIds.remove(deal.id));
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

/// The catalogue-group sheet's "valid until" subtitle — flags an expired
/// catalogue instead of quietly showing a date that has already passed.
Widget? _catalogueValidToSubtitle(BuildContext context, Catalogue catalogue) {
  final info = validUntilInfo(catalogue.validTo);
  if (info == null) return null;
  return Text(
    info.label,
    style: info.isExpired
        ? TextStyle(color: TS.redOf(context), fontWeight: FontWeight.w700)
        : null,
  );
}

class _DealRow extends StatelessWidget {
  const _DealRow({
    required this.deal,
    required this.isSaved,
    this.isNew = false,
    this.onSave,
    this.onAddToBasket,
    this.isAddingToBasket = false,
  });
  final Deal deal;
  final bool isSaved;
  final bool isNew;
  final VoidCallback? onSave;
  final VoidCallback? onAddToBasket;
  final bool isAddingToBasket;

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
          : () => showInAppBrowser(
                context,
                deal.productUrl,
                title: deal.retailerName,
              ),
      child: Container(
        key: Key('deal-card-${deal.id}'),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: TS.card(context, width: 2),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _DealImage(imageUrl: deal.imageUrl),
                if (deal.imageUrl != null) const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            deal.retailerName.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TS.eyebrowOf(context),
                          ),
                        ),
                        if (isNew) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: TS.yellow,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text('NEW',
                                style: TextStyle(
                                    color: TS.ink,
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900)),
                          ),
                        ],
                        if (deal.pageNumber != null) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              border: Border.all(
                                  color: TS.lineSoftOf(context), width: 1.5),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text('Page ${deal.pageNumber}',
                                style: TextStyle(
                                    fontSize: 9,
                                    color: TS.mutedOf(context),
                                    fontWeight: FontWeight.w800)),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              deal.title,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 14.5, fontWeight: FontWeight.w700, height: 1.25),
            ),
            const SizedBox(height: 5),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 2,
              children: [
                if (deal.priceText != null)
                  Text(
                    deal.priceText!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: TS.redOf(context),
                        fontSize: 18,
                        fontWeight: FontWeight.w900),
                  ),
                if (meaningfulWasPrice(
                        deal.previousPriceText, deal.priceText) !=
                    null)
                  Text(
                    meaningfulWasPrice(deal.previousPriceText, deal.priceText)!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: TS.faintOf(context),
                        decoration: TextDecoration.lineThrough,
                        fontSize: 12),
                  ),
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
              key: Key('deal-actions-${deal.id}'),
              children: [
                if (deal.productUrl != null)
                  _DealActionIcon(
                    tooltip: 'Open source',
                    onPressed: () => showInAppBrowser(
                      context,
                      deal.productUrl,
                      title: deal.retailerName,
                    ),
                    icon: Icons.language,
                  ),
                const SizedBox(width: 8),
                _DealActionIcon(
                  tooltip: 'Share on WhatsApp',
                  onPressed: _share,
                  icon: Icons.share_outlined,
                ),
                if (onSave != null) ...[
                  const SizedBox(width: 8),
                  _DealActionIcon(
                    tooltip: isSaved ? 'Deal saved' : 'Save deal',
                    onPressed: isSaved ? null : onSave,
                    icon: isSaved ? Icons.bookmark : Icons.bookmark_outline,
                  ),
                ],
                if (onAddToBasket != null) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 48),
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        visualDensity: VisualDensity.compact,
                      ),
                      onPressed: isAddingToBasket ? null : onAddToBasket,
                      icon: const Icon(Icons.add_shopping_cart, size: 18),
                      label: Text(
                        isAddingToBasket ? 'Adding' : 'Add to basket',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DealActionIcon extends StatelessWidget {
  const _DealActionIcon({
    required this.tooltip,
    required this.onPressed,
    required this.icon,
  });

  final String tooltip;
  final VoidCallback? onPressed;
  final IconData icon;

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        constraints: const BoxConstraints.tightFor(width: 48, height: 48),
        padding: EdgeInsets.zero,
        style: IconButton.styleFrom(
          foregroundColor: TS.inkOf(context),
          disabledForegroundColor: TS.mutedOf(context),
          backgroundColor: TS.surfaceSoftOf(context),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(TS.controlRadius),
            side: BorderSide(color: TS.lineSoftOf(context), width: 1.5),
          ),
        ),
        icon: Icon(icon, size: 19),
      );
}

class _DealImage extends StatelessWidget {
  const _DealImage({required this.imageUrl});
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    if (imageUrl == null) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.network(
        imageUrl!,
        width: 56,
        height: 56,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => Container(
          width: 56,
          height: 56,
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
                              child: const Icon(Icons.menu_book_outlined,
                                  size: 34),
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
