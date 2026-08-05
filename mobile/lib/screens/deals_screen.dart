import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../catalogue_sort.dart';
import '../deal_categories.dart';
import '../data_saver_store.dart';
import '../deal_alert_background.dart';
import '../deal_alert_scheduler.dart';
import '../deal_filters.dart';
import '../favourite_stores_store.dart';
import '../discovery_cache.dart';
import '../notification_prefs_store.dart';
import '../notifications.dart';
import '../price_display.dart';
import '../retailer_identity.dart';
import '../similar_deals.dart';
import '../taste_profile.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/common.dart' show validUntilInfo;
import '../widgets/login_gate_card.dart';
import '../widgets/retailer_picker.dart';
import '../widgets/scout_mascot.dart';
import '../widgets/share_card.dart';
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
    this.initialCatalogueId,
    this.alertScheduler,
    this.requestNotificationPermission,
    this.openNotificationSettings,
    this.cacheStore,
  });
  final Api api;
  final bool isAuthenticated;
  final VoidCallback? onWatchesChanged;
  final VoidCallback? onWantsAuth;
  // When arriving from a Near-me store card, pre-filter to that store's deals.
  final String? initialRetailerId;
  final String? initialQuery;
  final String? initialCatalogueId;
  final DealAlertScheduler? alertScheduler;
  final Future<bool> Function()? requestNotificationPermission;
  final Future<bool> Function()? openNotificationSettings;
  final DiscoveryCache? cacheStore;

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  static const _perPage = 24;
  static const _seasonCalendarExpandedKey =
      'marketplace_season_calendar_expanded_v1';
  static const _cacheReuseDuration = Duration(hours: 3);
  static const _dataSaverCacheReuseDuration = Duration(hours: 12);
  Future<DiscoveryResult>? _future;
  int _page = 0;
  final Set<String> _savedDealIds = {};
  final Set<String> _addingDealIds = {};
  final Set<String> _reportingDealIds = {};
  final DealClassificationCache _classificationCache =
      DealClassificationCache();
  String _query = '';
  String _retailerId = 'all';
  String _sourceLabel = 'all';
  // The image and savings chips came off the filter panel with the disclosure
  // that held them. The filter itself stays, so a future entry point can set
  // it without the plumbing having to be rebuilt.
  final bool _imagesOnly = false;
  final bool _savingsOnly = false;
  bool _hideSoldOut = false;
  bool _hideBids = false;
  DealSort _sort = DealSort.store;
  DealCategory? _category;
  FoodSubcategory? _foodSubcategory;
  Timer? _searchDebounce;
  final _searchController = TextEditingController();
  final _catalogueSearchController = TextEditingController();
  String _catalogueQuery = '';
  CatalogueSort _catalogueSort = CatalogueSort.latest;
  CatalogueTimingFilter _catalogueTiming = CatalogueTimingFilter.current;
  bool _creatingWatch = false;
  late final DiscoveryCache _cacheStore = widget.cacheStore ?? DiscoveryCache();
  CachedDiscovery? _cached;
  bool _refreshingFullFeed = false;
  bool _showingPreview = false;
  bool _backgroundRefreshFailed = false;
  Set<String> _previousDealIds = const {};
  static const _sampleLimit = 6;
  List<PublicAd> _ads = const [];
  List<Deal> _siteDeals = const [];
  bool _handledInitialCatalogue = false;

  // Every shop we scout, so the picker can list one that happens to have
  // nothing on today rather than dropping it and reading as "not covered".
  List<Retailer> _catalog = const [];
  final _notifPrefs = NotificationPrefsStore();
  late final DealAlertScheduler _alertScheduler;
  bool _notifyNewDeals = false;
  bool _notifBusy = false;
  final _tasteStore = TasteStore();
  TasteProfile _taste = const TasteProfile.empty();
  final _favouriteStoresStore = FavouriteStoresStore();
  List<FavouriteStore> _favouriteStores = const [];
  bool _favouritesOnly = false;
  List<RetailHoliday> _retailHolidays = const [];
  String? _selectedSeasonId;
  bool _seasonCalendarExpanded = true;

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
    _loadCatalog();
    _restoreNotifyPref();
    _restoreTaste();
    _restoreFavourites();
    _loadRetailHolidays();
    _restoreSeasonCalendarPreference();
  }

  Future<void> _restoreSeasonCalendarPreference() async {
    final preferences = await SharedPreferences.getInstance();
    final expanded = preferences.getBool(_seasonCalendarExpandedKey) ?? true;
    if (mounted) setState(() => _seasonCalendarExpanded = expanded);
  }

  Future<void> _setSeasonCalendarExpanded(bool expanded) async {
    setState(() => _seasonCalendarExpanded = expanded);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_seasonCalendarExpandedKey, expanded);
  }

  Future<void> _loadRetailHolidays() async {
    try {
      final holidays = await widget.api.retailHolidays();
      if (mounted) setState(() => _retailHolidays = holidays);
    } catch (_) {
      // Major shopping periods stay available from the offline calendar.
    }
  }

  Future<void> _restoreFavourites() async {
    final favourites = await _favouriteStoresStore.load();
    if (mounted) setState(() => _favouriteStores = favourites);
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

  Future<void> _reportDeal(Deal deal) async {
    var reason = 'price_wrong';
    var note = '';
    final selected = await showModalBottomSheet<({String note, String reason})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              4,
              20,
              20 + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Report an issue',
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  Text(
                    '${deal.retailerName} · ${deal.title}',
                    style: TextStyle(color: TS.mutedOf(context)),
                  ),
                  const SizedBox(height: 14),
                  RadioGroup<String>(
                    groupValue: reason,
                    onChanged: (value) =>
                        setSheetState(() => reason = value ?? reason),
                    child: Column(
                      children: [
                        for (final option in const [
                          ('price_wrong', 'Price is wrong'),
                          ('expired', 'Offer has ended'),
                          ('unavailable', 'Item is unavailable'),
                          ('wrong_item', 'Wrong item or description'),
                          ('other', 'Something else'),
                        ])
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            title: Text(option.$2),
                            value: option.$1,
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    maxLength: 500,
                    maxLines: 3,
                    onChanged: (value) => setSheetState(() => note = value),
                    decoration: InputDecoration(
                      labelText: reason == 'other'
                          ? 'Short note'
                          : 'Short note (optional)',
                      hintText: 'Tell the reviewer what you found',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'The reviewer receives the retailer source link shown with this deal.',
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      key: const Key('submit-deal-report'),
                      onPressed: reason == 'other' && note.trim().isEmpty
                          ? null
                          : () => Navigator.pop(
                                sheetContext,
                                (reason: reason, note: note.trim()),
                              ),
                      icon: const Icon(Icons.flag_outlined),
                      label: const Text('Send report'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    if (selected == null || !mounted) return;
    setState(() => _reportingDealIds.add(deal.id));
    try {
      await widget.api.reportDeal(deal, selected.reason, note: selected.note);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Report received. An admin can review the source.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _reportingDealIds.remove(deal.id));
    }
  }

  // The shops we scout, whether or not they are running anything today. Loaded
  // beside the deals rather than blocking them: a picker missing a quiet shop
  // is a smaller problem than a list that will not open.
  Future<void> _loadCatalog() async {
    try {
      final catalog = await widget.api.retailers();
      if (mounted) setState(() => _catalog = catalog.retailers);
    } catch (_) {
      // The picker falls back to the shops present in the deals themselves.
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
    _catalogueSearchController.dispose();
    super.dispose();
  }

  Future<CachedDiscovery?> _loadCachedDiscovery() async {
    final countryCode = widget.api.effectiveCountryCode;
    final cached = await _cacheStore.load(
      countryCode,
      widget.api.discoveryCacheScope,
    );
    if (cached != null && mounted) {
      setState(() => _cached = cached);
    }
    _previousDealIds = cached?.dealIds ?? const {};
    return cached;
  }

  Future<DiscoveryResult> _loadWithPreferences() async {
    await DataSaverStore.instance.load();
    final cached = await _loadCachedDiscovery();
    if (cached != null) {
      final age = DateTime.now().toUtc().difference(cached.fetchedAt.toUtc());
      final reuseDuration = DataSaverStore.instance.enabled
          ? _dataSaverCacheReuseDuration
          : _cacheReuseDuration;
      if (!age.isNegative && age < reuseDuration && !widget.isAuthenticated) {
        return cached.result;
      }

      // Signed-in limits can be changed by an administrator at any time. Keep
      // the cached board instant, then re-read the authoritative access block.
      _startFullFeedRefresh();
      return cached.result;
    }

    try {
      final preview = await widget.api.discovery(summary: true);
      _showingPreview = true;
      _startFullFeedRefresh();
      return preview;
    } catch (_) {
      // Older deployments may not have the summary endpoint. Fall back to the
      // full response so Marketplace still opens.
      return widget.api.discovery();
    }
  }

  void _startFullFeedRefresh() {
    if (_refreshingFullFeed) return;
    _refreshingFullFeed = true;
    _backgroundRefreshFailed = false;
    unawaited(_refreshFullFeed());
  }

  Future<void> _refreshFullFeed() async {
    try {
      final result = await widget.api.discovery();
      final fetchedAt = DateTime.now();
      unawaited(_cacheStore.save(
        result,
        fetchedAt,
        widget.api.effectiveCountryCode,
        widget.api.discoveryCacheScope,
      ));
      if (!mounted) return;
      setState(() {
        _cached = CachedDiscovery(result: result, fetchedAt: fetchedAt);
        _previousDealIds = _cached!.dealIds;
        _refreshingFullFeed = false;
        _showingPreview = false;
        _backgroundRefreshFailed = false;
        _future = Future.value(result);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _refreshingFullFeed = false;
        _backgroundRefreshFailed = true;
      });
    }
  }

  void _load() => _future = _loadWithPreferences();

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
            return _buildBoard(
              _cached!.result,
              staleNote: '${_freshnessLabel(_cached!.fetchedAt)} · refreshing…',
              staleIsRefreshing: true,
            );
          }
          return const SkeletonPane(rows: 6);
        }
        if (snap.hasError || snap.data == null) {
          if (_cached != null) {
            return _buildBoard(
              _cached!.result,
              staleNote:
                  'Couldn’t refresh · showing deals from ${_freshnessLabel(_cached!.fetchedAt).toLowerCase()}',
            );
          }
          return _retry();
        }

        if (_backgroundRefreshFailed) {
          return _buildBoard(
            snap.data!,
            staleNote: _cached == null
                ? 'Couldn’t load the full marketplace. Showing a quick preview.'
                : 'Couldn’t refresh · showing deals from ${_freshnessLabel(_cached!.fetchedAt).toLowerCase()}',
          );
        }
        if (_refreshingFullFeed) {
          return _buildBoard(
            snap.data!,
            staleNote: _showingPreview
                ? 'Quick preview · loading all deals…'
                : '${_freshnessLabel(_cached!.fetchedAt)} · refreshing…',
            staleIsRefreshing: true,
          );
        }
        return _buildBoard(snap.data!);
      },
    );
  }

  Widget _buildBoard(
    DiscoveryResult result, {
    String? staleNote,
    bool staleIsRefreshing = false,
  }) {
    final mergedDeals = _sortByPage([...result.deals, ..._siteDeals]);
    final dealLimit = result.access?.dealLimit;
    final allDeals =
        dealLimit == null ? mergedDeals : mergedDeals.take(dealLimit).toList();
    // The picker lists the shops in these deals plus every shop we scout, so a
    // shop with nothing on today still appears, saying so.
    final retailers = retailerOptionsFromDeals(
      allDeals,
      catalog: _catalog,
      catalogues: result.catalogues,
    );
    final sources = allDeals
        .map((deal) => deal.sourceLabel)
        .where((source) => source.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    var filteredDeals = filterDeals(
      allDeals,
      query: _query,
      retailerId: _retailerId,
      sourceLabel: _sourceLabel,
      imagesOnly: _imagesOnly,
      savingsOnly: _savingsOnly,
      hideSoldOut: _hideSoldOut,
      hideBids: _hideBids,
      category: _category,
      foodSubcategory: _foodSubcategory,
      classificationCache: _classificationCache,
    );
    if (_favouritesOnly) {
      filteredDeals = filteredDeals
          .where((deal) => isDealFromFavouriteStores(deal, _favouriteStores))
          .toList();
    }
    final seasons = buildRetailSeasons(
      widget.api.effectiveCountryCode,
      holidays: _retailHolidays,
    );
    RetailSeason? selectedSeason;
    for (final season in seasons) {
      if (season.id == _selectedSeasonId) {
        selectedSeason = season;
        break;
      }
    }
    if (selectedSeason != null) {
      filteredDeals = filteredDeals
          .where((deal) => matchesRetailSeason(deal, selectedSeason!))
          .toList();
    }
    final deals = sortDeals(
      filteredDeals,
      _sort,
      taste: _taste,
    );
    if (deals.isEmpty) {
      return _dealBoard(result, deals, retailers, sources, const [], 0, 0,
          seasons: seasons,
          totalDealCount: allDeals.length,
          staleNote: staleNote,
          staleIsRefreshing: staleIsRefreshing);
    }

    // Logged-out shoppers see a taste of the list; a gate invites them in for
    // the rest. Real pagination only applies once they are signed in.
    if (!widget.isAuthenticated) {
      final sample = deals.take(_sampleLimit).toList();
      return _dealBoard(result, deals, retailers, sources, sample, 0, 1,
          seasons: seasons,
          totalDealCount: allDeals.length,
          staleNote: staleNote,
          staleIsRefreshing: staleIsRefreshing,
          sampled: deals.length > sample.length);
    }

    final pageCount = (deals.length / _perPage).ceil();
    final page = _page.clamp(0, pageCount - 1);
    final slice = deals.skip(page * _perPage).take(_perPage).toList();

    return _dealBoard(result, deals, retailers, sources, slice, page, pageCount,
        seasons: seasons,
        totalDealCount: allDeals.length,
        staleNote: staleNote,
        staleIsRefreshing: staleIsRefreshing);
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
    List<RetailerOption> retailers,
    List<String> sources,
    List<Deal> slice,
    int page,
    int pageCount, {
    required List<RetailSeason> seasons,
    required int totalDealCount,
    String? staleNote,
    bool staleIsRefreshing = false,
    bool sampled = false,
  }) {
    final allCatalogueGroups = _groupCatalogues(
      result.catalogues,
      retailerId: _retailerId,
      timing: CatalogueTimingFilter.all,
    );
    final catalogueGroups = _groupCatalogues(
      result.catalogues,
      retailerId: _retailerId,
      timing: _catalogueTiming,
    );
    final catalogueCount = catalogueGroups.fold<int>(
      0,
      (total, group) => total + group.catalogues.length,
    );
    _openInitialCatalogue(result.catalogues, result.deals);
    RetailerOption? selectedRetailer;
    for (final retailer in retailers) {
      if (retailer.id == _retailerId) {
        selectedRetailer = retailer;
        break;
      }
    }

    return DefaultTabController(
      length: 2,
      initialIndex: widget.initialCatalogueId == null ? 0 : 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Marketplace',
                  style: Theme.of(context)
                      .textTheme
                      .headlineMedium
                      ?.merge(TS.display),
                ),
                if (staleNote != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      children: [
                        if (staleIsRefreshing)
                          SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: TS.mutedOf(context)),
                          )
                        else
                          Icon(
                            Icons.sync_problem_outlined,
                            size: 16,
                            color: TS.mutedOf(context),
                          ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            staleNote,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: TS.mutedOf(context),
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (result.access?.isLimited == true) ...[
                  const SizedBox(height: 10),
                  _accessLimitNotice(result.access!),
                ],
              ],
            ),
          ),
          TabBar(
            labelColor: TS.inkOf(context),
            unselectedLabelColor: TS.mutedOf(context),
            indicatorColor: TS.redOf(context),
            tabs: [
              Tab(text: 'Deals (${deals.length})'),
              Tab(text: 'Catalogues ($catalogueCount)'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                Builder(
                  builder: (tabContext) => _dealsTab(
                    deals,
                    retailers,
                    sources,
                    slice,
                    page,
                    pageCount,
                    totalDealCount: totalDealCount,
                    selectedRetailer: selectedRetailer,
                    onOpenCatalogues: () =>
                        DefaultTabController.of(tabContext).animateTo(1),
                    sampled: sampled,
                    seasons: seasons,
                  ),
                ),
                _cataloguesTab(
                  catalogueGroups,
                  result.deals,
                  allGroups: allCatalogueGroups,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _accessLimitNotice(DiscoveryAccess access) {
    final planName = switch (access.planId) {
      'organization' => 'Organisation',
      'household' => 'Household',
      'scout' => 'Scout',
      _ => 'Free',
    };

    return Container(
      key: const Key('marketplace-access-limit'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: TS.yellow.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(TS.controlRadius),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.workspace_premium_outlined, color: TS.ink, size: 19),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$planName plan: up to ${_wholeCount(access.dealLimit)} deals '
              'and ${_wholeCount(access.catalogueLimit)} catalogues. '
              '${_wholeCount(access.availableDealCount)} deals and '
              '${_wholeCount(access.availableCatalogueCount)} catalogues '
              'are available.',
              style: const TextStyle(
                color: TS.ink,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _wholeCount(int value) {
    final digits = value.toString();
    final firstGroup = digits.length % 3;
    final parts = <String>[];
    if (firstGroup > 0) {
      parts.add(digits.substring(0, firstGroup));
    }
    for (var index = firstGroup; index < digits.length; index += 3) {
      parts.add(digits.substring(index, index + 3));
    }
    return parts.join(',');
  }

  void _openInitialCatalogue(List<Catalogue> catalogues, List<Deal> deals) {
    final catalogueId = widget.initialCatalogueId;
    if (_handledInitialCatalogue || catalogueId == null) return;
    for (final catalogue in catalogues) {
      if (catalogue.id != catalogueId) continue;
      _handledInitialCatalogue = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          showCatalogueReader(context, catalogue, deals: deals);
        }
      });
      return;
    }
  }

  Widget _seasonalCalendar(List<RetailSeason> seasons) {
    final floatingCalculatorClearance =
        MediaQuery.sizeOf(context).width < 600 ? 52.0 : 0.0;
    final selected =
        seasons.where((season) => season.id == _selectedSeasonId).firstOrNull;
    final nextSeason = seasons.firstOrNull;
    return Container(
      key: const Key('retail-season-calendar'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TS.surfaceSoftOf(context),
        border: Border.all(color: TS.lineSoftOf(context)),
        borderRadius: BorderRadius.circular(TS.cardRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.calendar_month_outlined,
                  color: TS.redOf(context), size: 24),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'YOUR LOCAL SHOPPING CALENDAR',
                      style: TS.eyebrowOf(context).copyWith(
                            color: TS.redOf(context),
                            fontSize: 11,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'What’s happening now',
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Local holidays and major shopping periods. Open an event to see matching deals.',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              IconButton(
                key: const Key('retail-season-calendar-toggle'),
                onPressed: () =>
                    _setSeasonCalendarExpanded(!_seasonCalendarExpanded),
                tooltip: _seasonCalendarExpanded
                    ? 'Collapse shopping calendar'
                    : 'Expand shopping calendar',
                icon: Icon(
                  _seasonCalendarExpanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  color: TS.inkOf(context),
                ),
              ),
              SizedBox(width: floatingCalculatorClearance),
            ],
          ),
          if (!_seasonCalendarExpanded && nextSeason != null) ...[
            const SizedBox(height: 10),
            InkWell(
              key: const Key('retail-season-calendar-summary'),
              borderRadius: BorderRadius.circular(TS.controlRadius),
              onTap: () => _setSeasonCalendarExpanded(true),
              child: Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: TS.surfaceOf(context),
                  border: Border.all(color: TS.lineSoftOf(context)),
                  borderRadius: BorderRadius.circular(TS.controlRadius),
                ),
                child: Row(
                  children: [
                    Icon(
                      _seasonIcon(nextSeason.icon),
                      color: TS.redOf(context),
                      size: 20,
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        '${nextSeason.timingLabel}: ${nextSeason.title}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: TS.inkOf(context),
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Open calendar',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (_seasonCalendarExpanded) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 190,
              child: ListView.separated(
                key: const Key('retail-season-track'),
                scrollDirection: Axis.horizontal,
                itemCount: seasons.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final season = seasons[index];
                  final isSelected = season.id == _selectedSeasonId;
                  return Container(
                    key: Key('retail-season-${season.id}'),
                    width: 250,
                    decoration: TS.card(
                      context,
                      color: isSelected ? TS.yellow : TS.surfaceOf(context),
                      border: isSelected ? TS.ink : TS.lineSoftOf(context),
                      width: isSelected ? 2 : 1,
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(TS.cardRadius),
                        onTap: () {
                          uxTap();
                          setState(() {
                            _selectedSeasonId = isSelected ? null : season.id;
                            _page = 0;
                          });
                        },
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? Colors.white.withValues(alpha: 0.68)
                                      : TS.surfaceSoftOf(context),
                                  borderRadius:
                                      BorderRadius.circular(TS.controlRadius),
                                ),
                                child: Icon(
                                  _seasonIcon(season.icon),
                                  color:
                                      isSelected ? TS.red : TS.redOf(context),
                                  size: 22,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      season.timingLabel.toUpperCase(),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: isSelected
                                            ? const Color(0xFF6B241B)
                                            : TS.redOf(context),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.4,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      season.title,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: isSelected
                                            ? TS.ink
                                            : TS.inkOf(context),
                                        fontSize: 15,
                                        fontWeight: FontWeight.w900,
                                        height: 1.15,
                                      ),
                                    ),
                                    const SizedBox(height: 5),
                                    Expanded(
                                      child: Text(
                                        season.subtitle,
                                        maxLines: 3,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: isSelected
                                              ? const Color(0xFF4E431F)
                                              : TS.mutedOf(context),
                                          fontSize: 11,
                                          height: 1.35,
                                        ),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: isSelected
                                            ? TS.ink
                                            : TS.surfaceSoftOf(context),
                                        borderRadius: BorderRadius.circular(
                                            TS.pillRadius),
                                      ),
                                      child: Text(
                                        isSelected
                                            ? 'Showing matching deals'
                                            : 'View matching deals',
                                        style: TextStyle(
                                          color: isSelected
                                              ? const Color(0xFFFFFDF4)
                                              : TS.inkOf(context),
                                          fontSize: 10,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            if (selected != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Showing ${selected.title.toLowerCase()} matches',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  TextButton(
                    key: const Key('clear-retail-season'),
                    onPressed: () => setState(() {
                      _selectedSeasonId = null;
                      _page = 0;
                    }),
                    child: const Text('Clear'),
                  ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }

  static IconData _seasonIcon(RetailSeasonIcon icon) => switch (icon) {
        RetailSeasonIcon.gift => Icons.card_giftcard_outlined,
        RetailSeasonIcon.graduation => Icons.school_outlined,
        RetailSeasonIcon.travel => Icons.flight_takeoff_outlined,
        RetailSeasonIcon.school => Icons.menu_book_outlined,
        RetailSeasonIcon.tag => Icons.local_offer_outlined,
        RetailSeasonIcon.calendar => Icons.event_outlined,
      };

  Widget _dealsTab(
    List<Deal> deals,
    List<RetailerOption> retailers,
    List<String> sources,
    List<Deal> slice,
    int page,
    int pageCount, {
    required List<RetailSeason> seasons,
    required int totalDealCount,
    required VoidCallback onOpenCatalogues,
    RetailerOption? selectedRetailer,
    bool sampled = false,
  }) {
    SimilarDealsIndex? similarDealsIndex;
    List<Deal> similarDealsFor(Deal deal) =>
        (similarDealsIndex ??= SimilarDealsIndex(deals)).find(deal);
    Widget dealRow(Deal deal) => _DealRow(
          api: widget.api,
          deal: deal,
          similarDealsFor: () => similarDealsFor(deal),
          isNew: _previousDealIds.isNotEmpty &&
              deal.id.isNotEmpty &&
              !_previousDealIds.contains(deal.id),
          isSaved: _savedDealIds.contains(deal.id),
          onSave: widget.isAuthenticated ? () => _save(deal) : null,
          isAddingToBasket: _addingDealIds.contains(deal.id),
          onAddToBasket:
              widget.isAuthenticated ? () => _addToBasket(deal) : null,
          isReporting: _reportingDealIds.contains(deal.id),
          onReport: widget.isAuthenticated ? () => _reportDeal(deal) : null,
        );
    return RefreshIndicator(
      color: TS.redOf(context),
      onRefresh: () async {
        _loadSiteDeals();
        _loadCatalog();
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
          _advancedFilters(retailers, sources, totalDealCount),
          const SizedBox(height: 8),
          _categoryChips(),
          if (_category == DealCategory.food) ...[
            const SizedBox(height: 6),
            _foodSubcategoryChips(),
          ],
          const SizedBox(height: 10),
          _notifyToggle(),
          if (_favouriteStores.isNotEmpty) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: FilterChip(
                key: const Key('favourite-stores-filter'),
                avatar: const Icon(Icons.favorite_outline, size: 18),
                label: Text('My favourite stores (${_favouriteStores.length})'),
                selected: _favouritesOnly,
                onSelected: (value) => setState(() {
                  _favouritesOnly = value;
                  _page = 0;
                }),
              ),
            ),
          ],
          const SizedBox(height: 10),
          // Two controls and the count do not fit one phone-width row, so the
          // count drops to its own line rather than overflowing.
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            runSpacing: 8,
            spacing: 8,
            children: [
              Text('${deals.length} matching deals',
                  style: TS.eyebrowOf(context)),
              _visibilityFilterMenu(),
              _sortControl(),
            ],
          ),
          const SizedBox(height: 8),
          if (_ads.isNotEmpty && page == 0) SponsoredAdCard(ad: _ads.first),
          if (slice.isEmpty) ...[
            _seasonalCalendar(seasons),
            const SizedBox(height: 10),
          ],
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
                  if (_query.trim().length < 3 &&
                      (selectedRetailer?.catalogueCount ?? 0) > 0) ...[
                    Text(
                      '${selectedRetailer!.name} has '
                      '${selectedRetailer.catalogueCount} '
                      'catalogue${selectedRetailer.catalogueCount == 1 ? '' : 's'} '
                      'ready to browse.',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      key: const Key('open-store-catalogues'),
                      style: FilledButton.styleFrom(
                        backgroundColor: TS.yellow,
                        foregroundColor: TS.ink,
                      ),
                      onPressed: onOpenCatalogues,
                      icon: const Icon(Icons.menu_book_outlined),
                      label: const Text('Open catalogues'),
                    ),
                  ] else if (_query.trim().length < 3)
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
          if (slice.isNotEmpty) dealRow(slice.first),
          if (slice.isNotEmpty) ...[
            const SizedBox(height: 6),
            _seasonalCalendar(seasons),
            const SizedBox(height: 6),
          ],
          for (final deal in slice.skip(1)) dealRow(deal),
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
    // An invitation already accepted is just furniture. Once alerts are on,
    // this row comes off the page; it is turned back off from notification
    // settings, where every other alert already lives.
    if (_notifyNewDeals) return const SizedBox.shrink();

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

  Widget _advancedFilters(
    List<RetailerOption> retailers,
    List<String> sources,
    int totalDealCount,
  ) {
    // Two form fields side by side stop fitting once the shopper scales text
    // up, so they stack instead of squeezing — same rule ScreenHeader uses.
    final stacked = MediaQuery.textScalerOf(context).scale(1) > 1.3 ||
        MediaQuery.sizeOf(context).width < 360;
    final retailerField = RetailerFilterField(
      options: retailers,
      // Parity with the old dropdown: an id that no loaded deal carries (a
      // Near-me store with nothing on special) reads as "All retailers".
      selectedId: retailers.any((option) => option.id == _retailerId)
          ? _retailerId
          : allRetailersId,
      totalDealCount: totalDealCount,
      onChanged: (value) => setState(() {
        _retailerId = value;
        _page = 0;
      }),
    );
    final sourceField = DropdownButtonFormField<String>(
      key: ValueKey('source-$_sourceLabel'),
      initialValue: sources.contains(_sourceLabel) ? _sourceLabel : 'all',
      decoration: const InputDecoration(labelText: 'Source'),
      // Source labels are free text ("Food and grocery specials"), so the field
      // has to ellipsize rather than push its arrow off a half-width column.
      isExpanded: true,
      items: [
        const DropdownMenuItem(value: 'all', child: Text('All sources')),
        for (final source in sources)
          DropdownMenuItem(
            value: source,
            child: Text(source, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (value) => setState(() {
        _sourceLabel = value ?? 'all';
        _page = 0;
      }),
    );

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context), width: 2),
        borderRadius: BorderRadius.circular(TS.cardRadius),
      ),
      child: Column(
        children: [
          // Straight to the two filters that get used. They sat behind an
          // "Advanced filters" disclosure that had to be opened on every
          // visit, which is a tap and a title spent on hiding a store picker.
          Padding(
            padding: const EdgeInsets.all(12),
            child: stacked
                ? Column(
                    children: [
                      retailerField,
                      const SizedBox(height: 8),
                      sourceField,
                    ],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: retailerField),
                      const SizedBox(width: 8),
                      Expanded(child: sourceField),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  /// Hide-this, hide-that toggles, gathered into one menu beside the sort.
  ///
  /// They were chips pinned above the list, which cost a row of the screen
  /// permanently to two settings most shoppers set once and forget.
  Widget _visibilityFilterMenu() {
    final hasActiveFilter = _hideSoldOut || _hideBids;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        // An active filter glows rather than adding a count to the label.
        // A changing label changes the button's width, so it slid sideways
        // under the thumb that had just tapped it.
        border: Border.all(
          color: hasActiveFilter ? TS.yellow : TS.lineSoftOf(context),
          width: 2,
        ),
        borderRadius: BorderRadius.circular(TS.controlRadius),
        boxShadow: hasActiveFilter
            ? [
                BoxShadow(
                  color: TS.yellow.withValues(alpha: 0.55),
                  blurRadius: 8,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
      child: PopupMenuButton<String>(
        key: const Key('visibility-filter-menu'),
        tooltip: 'Filters',
        position: PopupMenuPosition.under,
        borderRadius: BorderRadius.circular(TS.controlRadius),
        // The menu stays open so both toggles can be set in one visit.
        onSelected: (value) {
          uxTap();
          setState(() {
            if (value == 'sold-out') _hideSoldOut = !_hideSoldOut;
            if (value == 'bids') _hideBids = !_hideBids;
            _page = 0;
          });
        },
        itemBuilder: (context) => [
          CheckedPopupMenuItem(
            key: const Key('hide-sold-out-filter'),
            value: 'sold-out',
            checked: _hideSoldOut,
            child: const Text('Hide sold out'),
          ),
          CheckedPopupMenuItem(
            key: const Key('hide-bids-filter'),
            value: 'bids',
            checked: _hideBids,
            child: const Text('Hide bids'),
          ),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.filter_list,
                size: 16,
                color:
                    hasActiveFilter ? TS.inkOf(context) : TS.mutedOf(context),
              ),
              const SizedBox(width: 4),
              // The label never changes, so the button never resizes and never
              // moves out from under the thumb.
              Text(
                'Filters',
                style: TextStyle(
                  color: TS.inkOf(context),
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sortControl() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context), width: 2),
        borderRadius: BorderRadius.circular(TS.controlRadius),
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
            borderRadius: BorderRadius.circular(TS.pillRadius),
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

  Widget _cataloguesTab(
    List<_CatalogueGroup> groups,
    List<Deal> deals, {
    required List<_CatalogueGroup> allGroups,
  }) {
    if (allGroups.isEmpty) {
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

    final query = _catalogueQuery.trim().toLowerCase();
    final visibleGroups = groups
        .map((group) {
          if (query.isEmpty ||
              group.retailerName.toLowerCase().contains(query)) {
            return group;
          }
          final matchingCatalogues = group.catalogues
              .where(
                  (catalogue) => catalogue.name.toLowerCase().contains(query))
              .toList();
          if (matchingCatalogues.isEmpty) return null;
          return _CatalogueGroup(
            group.retailerId,
            group.retailerName,
            matchingCatalogues,
            logoUrl: group.logoUrl,
          );
        })
        .whereType<_CatalogueGroup>()
        .toList();
    final totalCatalogueCount = groups.fold<int>(
      0,
      (total, group) => total + group.catalogues.length,
    );
    final visibleCatalogueCount = visibleGroups.fold<int>(
      0,
      (total, group) => total + group.catalogues.length,
    );
    final allCatalogues =
        allGroups.expand((group) => group.catalogues).toList(growable: false);
    final timingCounts = {
      for (final timing in CatalogueTimingFilter.values)
        timing: filterCataloguesByTiming(allCatalogues, timing).length,
    };
    final retailerGroups = [...groups]..sort((left, right) {
        final countOrder =
            right.catalogues.length.compareTo(left.catalogues.length);
        if (countOrder != 0) return countOrder;
        return left.retailerName
            .toLowerCase()
            .compareTo(right.retailerName.toLowerCase());
      });

    return CustomScrollView(
      key: const Key('catalogue-directory-list'),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        SliverToBoxAdapter(
          child: _CatalogueDirectoryHeader(
            controller: _catalogueSearchController,
            query: _catalogueQuery,
            sort: _catalogueSort,
            timing: _catalogueTiming,
            timingCounts: timingCounts,
            totalCatalogueCount: totalCatalogueCount,
            visibleCatalogueCount: visibleCatalogueCount,
            onChanged: (value) => setState(() => _catalogueQuery = value),
            onSortChanged: (value) => setState(() => _catalogueSort = value),
            onTimingChanged: (value) => setState(() {
              _catalogueTiming = value;
            }),
            onClear: () {
              _catalogueSearchController.clear();
              setState(() => _catalogueQuery = '');
            },
          ),
        ),
        if (query.isEmpty && retailerGroups.length > 1)
          SliverToBoxAdapter(
            child: _CatalogueRetailerShelf(
              groups: retailerGroups,
              onSelect: (group) {
                FocusManager.instance.primaryFocus?.unfocus();
                _catalogueSearchController.text = group.retailerName;
                setState(() => _catalogueQuery = group.retailerName);
              },
            ),
          ),
        if (visibleGroups.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: _CatalogueSearchEmpty(
              query: _catalogueQuery,
              timing: _catalogueTiming,
              onClear: () {
                _catalogueSearchController.clear();
                setState(() => _catalogueQuery = '');
              },
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final group = visibleGroups[index];
                  final letter = group.retailerName.isEmpty
                      ? '#'
                      : group.retailerName.characters.first.toUpperCase();
                  final previousLetter = index == 0
                      ? null
                      : visibleGroups[index - 1]
                          .retailerName
                          .characters
                          .first
                          .toUpperCase();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 18),
                    child: _CatalogueStoreSection(
                      group: group,
                      sectionLetter: letter == previousLetter ? null : letter,
                      onOpen: (catalogue) => showCatalogueReader(
                        context,
                        catalogue,
                        deals: deals,
                      ),
                    ),
                  );
                },
                childCount: visibleGroups.length,
              ),
            ),
          ),
      ],
    );
  }

  // One entry per retailer; multiple branch catalogues collapse into it.
  List<_CatalogueGroup> _groupCatalogues(
    List<Catalogue> catalogues, {
    String retailerId = allRetailersId,
    CatalogueTimingFilter timing = CatalogueTimingFilter.current,
  }) {
    final byRetailer = <String, _CatalogueGroup>{};
    final timedCatalogues = filterCataloguesByTiming(catalogues, timing);
    for (final catalogue in sortCatalogues(timedCatalogues, _catalogueSort)) {
      final name = catalogue.retailerName ?? catalogue.name;
      var key = canonicalRetailerId(catalogue.retailerId ?? '', name);
      Retailer? knownRetailer;
      for (final retailer in _catalog) {
        final exactName =
            retailerNameKey(retailer.name) == retailerNameKey(name);
        final exactShortName =
            retailerNameKey(retailer.shortName) == retailerNameKey(name);
        if (retailer.id == key || exactName || exactShortName) {
          knownRetailer = retailer;
          key = retailer.id;
          break;
        }
      }
      if (key.isEmpty) key = retailerNameKey(name);
      if (retailerId != allRetailersId && key != retailerId) continue;
      byRetailer.putIfAbsent(
        key,
        () => _CatalogueGroup(
          key,
          knownRetailer?.name ?? name,
          [],
          logoUrl: catalogue.retailerLogoUrl ?? knownRetailer?.logoUrl,
        ),
      );
      final group = byRetailer[key]!;
      group.logoUrl ??= catalogue.retailerLogoUrl ?? knownRetailer?.logoUrl;
      group.catalogues.add(catalogue);
    }
    final groups = byRetailer.values.toList();
    if (_catalogueSort == CatalogueSort.store) {
      groups.sort((left, right) => left.retailerName
          .toLowerCase()
          .compareTo(right.retailerName.toLowerCase()));
    }
    return groups;
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

class _DealRow extends StatelessWidget {
  const _DealRow({
    required this.api,
    required this.deal,
    this.similarDealsFor,
    required this.isSaved,
    this.isNew = false,
    this.onSave,
    this.onAddToBasket,
    this.onReport,
    this.isAddingToBasket = false,
    this.isReporting = false,
  });
  final Api api;
  final Deal deal;
  final List<Deal> Function()? similarDealsFor;
  final bool isSaved;
  final bool isNew;
  final VoidCallback? onSave;
  final VoidCallback? onAddToBasket;
  final VoidCallback? onReport;
  final bool isAddingToBasket;
  final bool isReporting;

  // Deals travel between South African households as a picture now: preview
  // the card, then send it through whichever app the shopper already uses.
  Future<void> _share(BuildContext context) =>
      showShareCardSheet(context, ShareCardData.fromDeal(deal));

  @override
  Widget build(BuildContext context) {
    void openDetails() {
      unawaited(api.recordUsage('deal_view'));
      showMarketplaceProductViewer(
        context,
        deal,
        similarDeals: similarDealsFor?.call() ?? const [],
      );
    }

    return InkWell(
      onTap: openDetails,
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
                _DealImage(deal: deal, onTap: openDetails),
                if (deal.hasImage) const SizedBox(width: 10),
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
                if (deal.unitText != null)
                  Container(
                    key: Key('deal-price-qualifier-${deal.id}'),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: TS.yellow.withValues(alpha: 0.28),
                      borderRadius: BorderRadius.circular(7),
                      border:
                          Border.all(color: TS.lineSoftOf(context), width: 1),
                    ),
                    child: Text(
                      deal.unitText!,
                      style: TextStyle(
                        color: TS.inkOf(context),
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
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
            // Said before the shopper taps, not after they reach the shop and
            // find it gone. Only shown when the shop itself said so.
            if (deal.soldOut)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Container(
                  key: Key('deal-sold-out-${deal.id}'),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: TS.mutedOf(context).withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'SOLD OUT',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
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
                  tooltip: 'Share this deal',
                  onPressed: () => _share(context),
                  icon: Icons.share_outlined,
                ),
                if (onReport != null) ...[
                  const SizedBox(width: 8),
                  KeyedSubtree(
                    key: Key('report-deal-${deal.id}'),
                    child: _DealActionIcon(
                      tooltip: isReporting ? 'Sending report' : 'Report issue',
                      onPressed: isReporting ? null : onReport,
                      icon: Icons.flag_outlined,
                    ),
                  ),
                ],
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
                      onPressed: deal.soldOut || isAddingToBasket
                          ? null
                          : onAddToBasket,
                      icon: const Icon(Icons.add_shopping_cart, size: 18),
                      label: Text(
                        deal.soldOut
                            ? 'Sold out'
                            : isAddingToBasket
                                ? 'Adding'
                                : 'Add to basket',
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
  const _DealImage({required this.deal, required this.onTap});
  final Deal deal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (!deal.hasImage) return const SizedBox.shrink();
    return Semantics(
      button: true,
      label: 'View images for ${deal.title}',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: Key('deal-image-${deal.id}'),
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.network(
              deal.gallery.first,
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
          ),
        ),
      ),
    );
  }
}

Future<void> showMarketplaceProductViewer(
  BuildContext context,
  Deal deal, {
  List<Deal> similarDeals = const [],
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _MarketplaceProductViewer(
      deal: deal,
      similarDeals: similarDeals,
    ),
  );
}

class _MarketplaceProductViewer extends StatefulWidget {
  const _MarketplaceProductViewer({
    required this.deal,
    required this.similarDeals,
  });

  final Deal deal;
  final List<Deal> similarDeals;

  @override
  State<_MarketplaceProductViewer> createState() =>
      _MarketplaceProductViewerState();
}

class _MarketplaceProductViewerState extends State<_MarketplaceProductViewer> {
  final _controller = PageController();
  late Deal _deal;
  late List<Deal> _similarDeals;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _deal = widget.deal;
    _similarDeals = widget.similarDeals;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final deal = _deal;
    final images = deal.gallery;
    final height = MediaQuery.sizeOf(context).height * 0.9;
    final validInfo = validUntilInfo(deal.validTo);

    return Container(
      key: const Key('marketplace-product-viewer'),
      height: height,
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: TS.lineOf(context), width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 10, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Deal details',
                        style: TS.eyebrowOf(context),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        key: Key('deal-detail-title-${deal.id}'),
                        deal.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Close deal details',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: TS.lineOf(context)),
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                if (images.isNotEmpty)
                  SizedBox(
                    height: 280,
                    child: Stack(
                      children: [
                        ColoredBox(
                          color: TS.surfaceSoftOf(context),
                          child: PageView.builder(
                            key: const Key('marketplace-product-gallery'),
                            controller: _controller,
                            itemCount: images.length,
                            onPageChanged: (value) =>
                                setState(() => _index = value),
                            itemBuilder: (context, imageIndex) => Padding(
                              padding: const EdgeInsets.all(18),
                              child: InteractiveViewer(
                                minScale: 1,
                                maxScale: 4,
                                child: Center(
                                  child: Image.network(
                                    images[imageIndex],
                                    fit: BoxFit.contain,
                                    errorBuilder: (_, __, ___) => Container(
                                      width: double.infinity,
                                      color: TS.surfaceOf(context),
                                      child: Icon(
                                        Icons.image_not_supported_outlined,
                                        size: 48,
                                        color: TS.mutedOf(context),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          right: 14,
                          bottom: 14,
                          child: _CountPill(
                            label: '${_index + 1} of ${images.length}',
                          ),
                        ),
                      ],
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  deal.retailerName,
                                  style: TextStyle(
                                    color: TS.mutedOf(context),
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                if (deal.sourceLabel.isNotEmpty) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    deal.sourceLabel,
                                    style: TextStyle(
                                      color: TS.faintOf(context),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          if (deal.priceText != null)
                            Text(
                              deal.priceText!,
                              style: TextStyle(
                                color: TS.redOf(context),
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                        ],
                      ),
                      if (validInfo != null || deal.soldOut) ...[
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (validInfo != null)
                              _DealDetailPill(
                                icon: validInfo.isExpired
                                    ? Icons.event_busy_outlined
                                    : Icons.event_available_outlined,
                                label: validInfo.label,
                                warning: validInfo.isExpired,
                              ),
                            if (deal.soldOut)
                              const _DealDetailPill(
                                icon: Icons.remove_shopping_cart_outlined,
                                label: 'Sold out',
                                warning: true,
                              ),
                          ],
                        ),
                      ],
                      if (deal.productUrl != null) ...[
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          key: Key('view-product-${deal.id}'),
                          onPressed: () => showInAppBrowser(
                            context,
                            deal.productUrl,
                            title: deal.retailerName,
                          ),
                          icon: const Icon(Icons.verified_outlined),
                          label: const Text('View official source'),
                        ),
                      ],
                    ],
                  ),
                ),
                if (_similarDeals.isNotEmpty) ...[
                  Divider(height: 24, color: TS.lineOf(context)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 8),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: TS.card(context, width: 1.5),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Compare before you buy',
                              style: TS.eyebrowOf(context)),
                          const SizedBox(height: 4),
                          Text(
                            'Similar live deals from other stores',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 10),
                          for (final alternative in _similarDeals)
                            _SimilarDealTile(
                              deal: alternative,
                              onTap: () => _selectAlternative(alternative),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 10),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _selectAlternative(Deal deal) {
    final candidates = <Deal>[_deal, ..._similarDeals];
    setState(() {
      _deal = deal;
      _similarDeals = findSimilarDeals(deal, candidates);
      _index = 0;
    });
    if (_controller.hasClients) _controller.jumpToPage(0);
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          border: Border.all(color: TS.lineOf(context)),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(label,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
      );
}

class _DealDetailPill extends StatelessWidget {
  const _DealDetailPill({
    required this.icon,
    required this.label,
    this.warning = false,
  });

  final IconData icon;
  final String label;
  final bool warning;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: warning
              ? TS.redOf(context).withValues(alpha: 0.12)
              : TS.surfaceSoftOf(context),
          border: Border.all(
            color: warning ? TS.redOf(context) : TS.lineSoftOf(context),
          ),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 15,
                color: warning ? TS.redOf(context) : TS.mutedOf(context)),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                  color: warning ? TS.redOf(context) : TS.inkOf(context),
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                )),
          ],
        ),
      );
}

class _SimilarDealTile extends StatelessWidget {
  const _SimilarDealTile({required this.deal, required this.onTap});
  final Deal deal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Material(
          color: TS.surfaceSoftOf(context),
          borderRadius: BorderRadius.circular(TS.controlRadius),
          child: InkWell(
            key: Key('similar-deal-${deal.id}'),
            onTap: onTap,
            borderRadius: BorderRadius.circular(TS.controlRadius),
            child: Padding(
              padding: const EdgeInsets.all(11),
              child: Row(
                children: [
                  if (deal.hasImage) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        deal.gallery.first,
                        width: 48,
                        height: 48,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(deal.retailerName,
                            style: TS.eyebrowOf(context),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 3),
                        Text(deal.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style:
                                const TextStyle(fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                  if (deal.priceText != null) ...[
                    const SizedBox(width: 8),
                    Text(deal.priceText!,
                        style: TextStyle(
                            color: TS.redOf(context),
                            fontWeight: FontWeight.w900)),
                  ],
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ),
        ),
      );
}

class _CatalogueGroup {
  _CatalogueGroup(
    this.retailerId,
    this.retailerName,
    this.catalogues, {
    this.logoUrl,
  });

  final String retailerId;
  final String retailerName;
  final List<Catalogue> catalogues;
  String? logoUrl;
}

class _CatalogueDirectoryHeader extends StatelessWidget {
  const _CatalogueDirectoryHeader({
    required this.controller,
    required this.query,
    required this.sort,
    required this.timing,
    required this.timingCounts,
    required this.totalCatalogueCount,
    required this.visibleCatalogueCount,
    required this.onChanged,
    required this.onSortChanged,
    required this.onTimingChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final String query;
  final CatalogueSort sort;
  final CatalogueTimingFilter timing;
  final Map<CatalogueTimingFilter, int> timingCounts;
  final int totalCatalogueCount;
  final int visibleCatalogueCount;
  final ValueChanged<String> onChanged;
  final ValueChanged<CatalogueSort> onSortChanged;
  final ValueChanged<CatalogueTimingFilter> onTimingChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final isSearching = query.trim().isNotEmpty;
    return Container(
      key: const Key('catalogue-directory-header'),
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            TS.surfaceOf(context),
            TS.surfaceSoftOf(context),
          ],
        ),
        border: Border.all(color: TS.lineSoftOf(context), width: 1.5),
        borderRadius: BorderRadius.circular(TS.panelRadius),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).shadowColor.withValues(alpha: 0.12),
            blurRadius: 24,
            offset: const Offset(0, 9),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Fresh from stores', style: TS.eyebrowOf(context)),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      timing.title,
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.merge(TS.display),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      'Open a cover to read every available page in order.',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
                decoration: BoxDecoration(
                  color: TS.yellow,
                  border: Border.all(color: TS.ink, width: 1.5),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  isSearching
                      ? '$visibleCatalogueCount shown'
                      : '$totalCatalogueCount available',
                  style: const TextStyle(
                    color: TS.ink,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SingleChildScrollView(
            key: const Key('catalogue-timing-scroll'),
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final option in CatalogueTimingFilter.values) ...[
                  FilterChip(
                    key: Key('catalogue-timing-${option.name}'),
                    label: Text(
                      '${option.label} ${timingCounts[option] ?? 0}',
                    ),
                    selected: timing == option,
                    onSelected: (_) => onTimingChanged(option),
                  ),
                  if (option != CatalogueTimingFilter.values.last)
                    const SizedBox(width: 7),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            key: const Key('catalogue-search-field'),
            controller: controller,
            onChanged: onChanged,
            textInputAction: TextInputAction.search,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: 'Search catalogues',
              hintText: 'Store or catalogue name',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: isSearching
                  ? IconButton(
                      tooltip: 'Clear catalogue search',
                      onPressed: onClear,
                      icon: const Icon(Icons.close),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<CatalogueSort>(
            key: const Key('catalogue-sort-field'),
            initialValue: sort,
            decoration: const InputDecoration(
              labelText: 'Sort catalogues',
              prefixIcon: Icon(Icons.swap_vert),
            ),
            isExpanded: true,
            items: [
              for (final option in CatalogueSort.values)
                DropdownMenuItem(
                  value: option,
                  child: Text(option.label),
                ),
            ],
            onChanged: (value) {
              if (value != null) onSortChanged(value);
            },
          ),
        ],
      ),
    );
  }
}

class _CatalogueSearchEmpty extends StatelessWidget {
  const _CatalogueSearchEmpty({
    required this.query,
    required this.timing,
    required this.onClear,
  });

  final String query;
  final CatalogueTimingFilter timing;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final isSearching = query.trim().isNotEmpty;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.menu_book_outlined,
              size: 52,
              color: TS.mutedOf(context),
            ),
            const SizedBox(height: 14),
            Text(
              isSearching
                  ? 'No matching catalogues'
                  : 'No ${timing.label.toLowerCase()} catalogues',
              style: const TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              isSearching
                  ? 'No store or catalogue matches “${query.trim()}”.'
                  : 'Choose another date view to see the available store catalogues.',
              textAlign: TextAlign.center,
              style: TextStyle(color: TS.mutedOf(context)),
            ),
            if (isSearching) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: onClear,
                icon: const Icon(Icons.close),
                label: const Text('Clear search'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CatalogueRetailerShelf extends StatelessWidget {
  const _CatalogueRetailerShelf({
    required this.groups,
    required this.onSelect,
  });

  final List<_CatalogueGroup> groups;
  final ValueChanged<_CatalogueGroup> onSelect;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Shop by retailer',
              style: Theme.of(context).textTheme.titleLarge?.merge(TS.display),
            ),
            const SizedBox(height: 3),
            Text(
              'Jump straight to a store in this catalogue view.',
              style: TextStyle(color: TS.mutedOf(context)),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 120,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: groups.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final group = groups[index];
                  final count = group.catalogues.length;
                  return Semantics(
                    button: true,
                    label:
                        'Show $count ${count == 1 ? 'catalogue' : 'catalogues'} from ${group.retailerName}',
                    child: SizedBox(
                      width: 122,
                      child: Material(
                        color: TS.surfaceOf(context),
                        shape: RoundedRectangleBorder(
                          side: BorderSide(
                            color: TS.lineSoftOf(context),
                            width: 1.5,
                          ),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          key: Key('catalogue-retailer-${group.retailerId}'),
                          onTap: () {
                            uxTap();
                            onSelect(group);
                          },
                          child: Padding(
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _CatalogueStoreLogo(
                                  name: group.retailerName,
                                  logoUrl: group.logoUrl,
                                  size: 38,
                                ),
                                const Spacer(),
                                Text(
                                  group.retailerName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                Text(
                                  count == 1
                                      ? '1 catalogue'
                                      : '$count catalogues',
                                  style: TextStyle(
                                    color: TS.mutedOf(context),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      );
}

class _CatalogueStoreSection extends StatelessWidget {
  const _CatalogueStoreSection({
    required this.group,
    required this.sectionLetter,
    required this.onOpen,
  });

  final _CatalogueGroup group;
  final String? sectionLetter;
  final ValueChanged<Catalogue> onOpen;

  @override
  Widget build(BuildContext context) {
    final count = group.catalogues.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (sectionLetter != null)
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 9),
            child: Text(
              sectionLetter!,
              style: TextStyle(
                color: TS.redOf(context),
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        Container(
          key: Key('catalogue-group-${group.retailerId}'),
          padding: const EdgeInsets.all(14),
          decoration: TS.card(context, width: 1.5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _CatalogueStoreLogo(
                    name: group.retailerName,
                    logoUrl: group.logoUrl,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          group.retailerName,
                          key: Key(
                            'catalogue-section-name-${group.retailerId}',
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          count == 1
                              ? '1 current catalogue'
                              : '$count current catalogues',
                          style: TextStyle(
                            color: TS.mutedOf(context),
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              LayoutBuilder(
                builder: (context, constraints) {
                  final tileWidth = count == 1
                      ? constraints.maxWidth
                      : (constraints.maxWidth - 12) / 2;
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final catalogue in group.catalogues)
                        SizedBox(
                          key: Key(
                            'catalogue-tile-${catalogue.id ?? catalogue.name}',
                          ),
                          width: tileWidth,
                          child: _CatalogueTile(
                            catalogue: catalogue,
                            onTap: () => onOpen(catalogue),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CatalogueStoreLogo extends StatelessWidget {
  const _CatalogueStoreLogo({
    required this.name,
    required this.logoUrl,
    this.size = 48,
  });

  final String name;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fallback = Center(
      child: Text(
        name.trim().isEmpty ? '#' : name.trim().characters.first.toUpperCase(),
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
      ),
    );
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: TS.surfaceSoftOf(context),
        border: Border.all(color: TS.lineSoftOf(context), width: 1.5),
        borderRadius: BorderRadius.circular(14),
      ),
      child: logoUrl == null
          ? fallback
          : Image.network(
              logoUrl!,
              cacheWidth: 120,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => fallback,
            ),
    );
  }
}

class _CatalogueTile extends StatelessWidget {
  const _CatalogueTile({
    required this.catalogue,
    required this.onTap,
  });

  final Catalogue catalogue;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cover = catalogue.coverImageUrl;
    final validInfo = validUntilInfo(catalogue.validTo);
    final timing = catalogueTiming(catalogue);
    final timingLabel = switch (timing) {
      CatalogueTiming.upcoming => 'Starts ${catalogue.validFrom}',
      CatalogueTiming.endingSoon => validInfo?.label == null
          ? 'Ending soon'
          : 'Ending soon · ${validInfo!.label}',
      CatalogueTiming.current => validInfo?.label,
    };
    final format = catalogue.pages.length > 1
        ? '${catalogue.pages.length} pages'
        : catalogue.pagesUrl != null
            ? 'Multi-page'
            : catalogue.isDirectPdf
                ? 'Full PDF'
                : 'Catalogue';

    Widget coverImage(BorderRadius borderRadius) => AspectRatio(
          aspectRatio: 0.76,
          child: ClipRRect(
            borderRadius: borderRadius,
            child: cover == null
                ? ColoredBox(
                    color: TS.surfaceOf(context),
                    child: Icon(
                      Icons.menu_book_outlined,
                      size: 38,
                      color: TS.mutedOf(context),
                    ),
                  )
                : Image.network(
                    cover,
                    cacheWidth: 440,
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.medium,
                    loadingBuilder: (context, child, progress) {
                      if (progress == null) return child;
                      return ColoredBox(
                        color: TS.surfaceOf(context),
                        child: Center(
                          child: SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: TS.redOf(context),
                            ),
                          ),
                        ),
                      );
                    },
                    errorBuilder: (_, __, ___) => ColoredBox(
                      color: TS.surfaceOf(context),
                      child: Icon(
                        Icons.menu_book_outlined,
                        size: 38,
                        color: TS.mutedOf(context),
                      ),
                    ),
                  ),
          ),
        );

    Widget details({
      required EdgeInsets padding,
      required int titleLines,
    }) =>
        Padding(
          padding: padding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                catalogue.name,
                maxLines: titleLines,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  height: 1.2,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                timingLabel ?? format,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: validInfo?.isExpired == true
                      ? TS.redOf(context)
                      : timing == CatalogueTiming.upcoming
                          ? TS.greenOf(context)
                          : timing == CatalogueTiming.endingSoon
                              ? TS.redOf(context)
                              : TS.mutedOf(context),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 9),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      format,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 11,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: TS.yellow,
                      border: Border.all(color: TS.ink, width: 1),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'Read',
                      style: TextStyle(
                        color: TS.ink,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );

    return LayoutBuilder(
      builder: (context, constraints) {
        final useWideLayout = constraints.maxWidth >= 260;
        final proportionalCoverWidth = constraints.maxWidth * 0.42;
        final wideCoverWidth =
            proportionalCoverWidth > 180 ? 180.0 : proportionalCoverWidth;
        return Semantics(
          button: true,
          label: 'Read ${catalogue.name}',
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Ink(
              decoration: BoxDecoration(
                color: TS.surfaceSoftOf(context),
                border: Border.all(color: TS.lineSoftOf(context), width: 1.5),
                borderRadius: BorderRadius.circular(14),
              ),
              child: useWideLayout
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: wideCoverWidth,
                          child: coverImage(
                            const BorderRadius.horizontal(
                              left: Radius.circular(12),
                            ),
                          ),
                        ),
                        Expanded(
                          child: details(
                            padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                            titleLines: 3,
                          ),
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        coverImage(
                          const BorderRadius.vertical(
                            top: Radius.circular(12),
                          ),
                        ),
                        details(
                          padding: const EdgeInsets.fromLTRB(10, 10, 10, 11),
                          titleLines: 2,
                        ),
                      ],
                    ),
            ),
          ),
        );
      },
    );
  }
}
