import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../discovery_cache.dart';
import '../price_display.dart';
import '../taste_profile.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/scout_mark.dart';
import '../widgets/scout_mascot.dart';
import '../widgets/in_app_browser.dart';
import '../window_saved_store.dart';
import '../window_seen_store.dart';

/// The in-store playlist. All tracks by Kevin MacLeod (incompetech.com),
/// licensed under Creative Commons: By Attribution 4.0 — credited on screen
/// while the music plays.
class _Track {
  const _Track(this.asset, this.title);

  final String asset;
  final String title;
}

// A wider, groovier crate so the shop never loops back too soon — funk, soul,
// bossa, ska and lounge, all Kevin MacLeod, all CC BY 4.0.
const List<_Track> _playlist = [
  _Track('music/groove_funk.mp3', 'Funkorama'),
  _Track('music/groove_deuces.mp3', 'Deuces'),
  _Track('music/groove_bossa.mp3', 'Bossa Antigua'),
  _Track('music/groove_chunk.mp3', 'Funky Chunk'),
  _Track('music/groove_cool.mp3', 'Cool Vibes'),
  _Track('music/groove_riley.mp3', 'Life of Riley'),
  _Track('music/groove_shade.mp3', 'Sidewalk Shade'),
  _Track('music/groove_vibe.mp3', 'Vibe Ace'),
];

/// Window Shopping — the calm, endless browse. One deal per swipe with real
/// groovy store music (a rotating playlist of Kevin MacLeod tracks, CC BY 4.0,
/// mutable), image-first, and searchable. What a shopper saves here teaches an
/// on-device taste profile that then personalises Find a deal and new-deal
/// alerts. No destination required — just the pleasure of the next deal, like
/// drifting past shop windows.
class WindowShoppingScreen extends StatefulWidget {
  const WindowShoppingScreen({
    super.key,
    required this.api,
    this.seenStore,
    this.now,
  });

  final Api api;
  final WindowSeenStore? seenStore;
  final DateTime Function()? now;

  @override
  State<WindowShoppingScreen> createState() => _WindowShoppingScreenState();
}

class _WindowShoppingScreenState extends State<WindowShoppingScreen>
    with WidgetsBindingObserver {
  static const _muteKey = 'window_music_muted';
  static const _reloadAfterBackground = Duration(minutes: 15);
  static const _discoveryCacheReuse = Duration(hours: 3);
  // Present enough to groove to, soft enough to talk over — store-speaker level.
  static const _musicVolume = 0.35;

  final _pageController = PageController();
  final _savedStore = WindowSavedStore();
  late final WindowSeenStore _seenStore;
  late final DateTime Function() _now;
  final _tasteStore = TasteStore();
  final _discoveryCache = DiscoveryCache();
  final _searchController = TextEditingController();
  final AudioPlayer _music = AudioPlayer(playerId: 'window_ambient');
  // A fresh running order each visit so the same track never greets you twice.
  final List<_Track> _tracks = List.of(_playlist)..shuffle();

  List<ScrollDeal> _deals = const [];
  final Set<String> _seenThisVisit = {};
  Set<String> _saved = {};
  // Global save counts per deal id, so the reel shows "N saves".
  final Map<String, SaveStat> _saveStats = {};
  final Set<String> _savedToDeals = {};
  bool _loading = true;
  bool _caughtUp = false;
  bool _musicMuted = false;
  bool _searching = false;
  String _query = '';
  int _trackIndex = 0;
  int _currentPage = 0;
  bool _refreshGestureStartedAtTop = false;
  Future<void>? _activeRefresh;
  DateTime? _backgroundedAt;
  StreamSubscription<void>? _trackDone;
  String? _error;

  @override
  void initState() {
    super.initState();
    _seenStore = widget.seenStore ?? WindowSeenStore();
    _now = widget.now ?? DateTime.now;
    WidgetsBinding.instance.addObserver(this);
    _restoreSaved();
    _initMusic();
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _trackDone?.cancel();
    _music.stop();
    _music.dispose();
    _pageController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Pause the music when the app leaves the foreground; resume on return.
    if (state == AppLifecycleState.resumed) {
      if (!_musicMuted) _music.resume();
      final backgroundedAt = _backgroundedAt;
      _backgroundedAt = null;
      if (backgroundedAt != null &&
          _now().difference(backgroundedAt) >= _reloadAfterBackground) {
        _prepareForBackgroundReturn();
        unawaited(_load());
      }
    } else {
      _backgroundedAt ??= _now();
      _music.pause();
    }
  }

  Future<void> _initMusic() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      // No stored preference means this is the shopper's first visit — open
      // muted so the ambience never surprises anyone; once they've chosen
      // either way, that choice sticks.
      _musicMuted = prefs.getBool(_muteKey) ?? true;
      // Open on a different track each visit so the shop never feels canned.
      _trackIndex = DateTime.now().minute % _tracks.length;
      if (mounted) setState(() {});
      await _music.setReleaseMode(ReleaseMode.stop);
      // Play as media without grabbing audio focus, so it stays a soft backdrop
      // and doesn't stop the shopper's own music. iOS keeps the valid default.
      await _music.setAudioContext(
        AudioContext(
          android: const AudioContextAndroid(
            isSpeakerphoneOn: false,
            contentType: AndroidContentType.music,
            usageType: AndroidUsageType.media,
            audioFocus: AndroidAudioFocus.none,
          ),
        ),
      );
      // When a track ends, the next one takes the floor.
      _trackDone = _music.onPlayerComplete.listen((_) {
        if (!_musicMuted) _playTrack((_trackIndex + 1) % _tracks.length);
      });
      if (!_musicMuted) await _playTrack(_trackIndex);
    } catch (_) {
      // Music is a nicety; the feed works without it.
    }
  }

  Future<void> _playTrack(int index) async {
    _trackIndex = index;
    if (mounted) setState(() {});
    try {
      await _music.stop();
      await _music.play(AssetSource(_tracks[index].asset),
          volume: _musicVolume);
    } catch (_) {}
  }

  Future<void> _toggleMute() async {
    final muted = !_musicMuted;
    setState(() => _musicMuted = muted);
    HapticFeedback.selectionClick();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_muteKey, muted);
      if (muted) {
        await _music.pause();
      } else {
        // Resume mid-track, or start the current track if nothing is queued.
        await _music.resume();
        if (_music.state != PlayerState.playing) {
          await _playTrack(_trackIndex);
        }
      }
    } catch (_) {}
  }

  // Cache for the getter below, keyed by the (`_deals`, `_query`) pair it was
  // computed from. Several call sites read `_visible` more than once per
  // interaction (page changes, precaching, seen-tracking); recomputing the
  // filter every time is wasted work once the reel has more than a handful
  // of deals, so it's only rebuilt when either input actually changes.
  List<ScrollDeal>? _visibleCache;
  List<ScrollDeal>? _visibleCacheDeals;
  String? _visibleCacheQuery;

  /// The deals currently in the window: everything, or the search matches.
  List<ScrollDeal> get _visible {
    if (identical(_visibleCacheDeals, _deals) && _visibleCacheQuery == _query) {
      return _visibleCache!;
    }
    List<ScrollDeal> result;
    if (_query.isEmpty) {
      result = _deals;
    } else {
      final q = _query.toLowerCase();
      result = _deals
          .where((d) =>
              d.title.toLowerCase().contains(q) ||
              d.retailerName.toLowerCase().contains(q) ||
              (d.category?.toLowerCase().contains(q) ?? false) ||
              d.sourceLabel.toLowerCase().contains(q))
          .toList();
    }
    _visibleCache = result;
    _visibleCacheDeals = _deals;
    _visibleCacheQuery = _query;
    return result;
  }

  void _setQuery(String value) {
    setState(() => _query = value.trim());
    // A new search starts the window at its first match.
    if (_pageController.hasClients) _pageController.jumpToPage(0);
    _currentPage = 0;
    _markFirstVisibleAfterFrame();
  }

  void _toggleSearch() {
    HapticFeedback.selectionClick();
    setState(() {
      _searching = !_searching;
      if (!_searching) {
        _query = '';
        _searchController.clear();
      }
    });
    if (_pageController.hasClients) _pageController.jumpToPage(0);
    _currentPage = 0;
    _markFirstVisibleAfterFrame();
  }

  /// Warms the image cache for the next couple of windows so a swipe lands on
  /// a sharp, already-decoded picture instead of a fallback flash.
  void _precacheAround(int index) {
    final deals = _visible;
    if (deals.isEmpty || index < 0 || index >= deals.length) return;
    for (var next = index + 1;
        next < deals.length && next <= index + 2;
        next++) {
      final deal = deals[next];
      if (deal.hasImage) {
        precacheImage(
          NetworkImage(upgradeImageUrl(deal.gallery.first)),
          context,
          onError: (_, __) {},
        );
      }
    }
  }

  void _markDealSeen(ScrollDeal deal) {
    final key = windowSeenKey(deal);
    if (!_seenThisVisit.add(key)) return;
    unawaited(_seenStore.markSeen(key));
  }

  void _markFirstVisibleAfterFrame() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final deals = _visible;
      if (deals.isNotEmpty) _markDealSeen(deals.first);
    });
  }

  bool _allowRefreshNotification(ScrollNotification notification) {
    if (notification is ScrollStartNotification) {
      _refreshGestureStartedAtTop =
          _currentPage == 0 && _query.isEmpty && !_searching;
    }
    final allowed = notification.depth == 0 && _refreshGestureStartedAtTop;
    if (notification is ScrollEndNotification) {
      _refreshGestureStartedAtTop = false;
    }
    return allowed;
  }

  Future<void> _refresh() {
    final active = _activeRefresh;
    if (active != null) return active;

    late final Future<void> refresh;
    refresh = _load(isRefresh: true).whenComplete(() {
      if (identical(_activeRefresh, refresh)) _activeRefresh = null;
    });
    _activeRefresh = refresh;
    return refresh;
  }

  @visibleForTesting
  Future<void> refreshForTest() => _refresh();

  void _prepareForBackgroundReturn() {
    if (_pageController.hasClients && _pageController.page != 0) {
      _pageController.jumpToPage(0);
    }
    final hadDeals = _deals.isNotEmpty;
    final remaining = _deals
        .where((deal) => !_seenThisVisit.contains(windowSeenKey(deal)))
        .toList();
    setState(() {
      _deals = remaining;
      _currentPage = 0;
      _caughtUp = _caughtUp || (hadDeals && remaining.isEmpty);
      _error = null;
    });
  }

  Future<void> _restoreSaved() async {
    // The server is the source of truth so saves follow the account across
    // devices and reinstalls; fall back to the on-device mirror when offline.
    try {
      final saved = await widget.api.windowSaves();
      if (!mounted) return;
      setState(() {
        _saved = saved.map((d) => d.id).toSet();
        for (final deal in saved) {
          final existing = _saveStats[deal.id]?.count ?? 0;
          _saveStats[deal.id] = SaveStat(count: existing, saved: true);
        }
      });
    } catch (_) {
      final ids = await _savedStore.loadIds();
      if (mounted) setState(() => _saved = ids);
    }
  }

  /// Batch-loads global save counts for the deals around [index] so each card
  /// shows how many shoppers saved it.
  Future<void> _loadCountsFor(int index) async {
    final deals = _visible;
    if (deals.isEmpty || index < 0 || index >= deals.length) return;
    final ids = <String>[];
    final first = index > 0 ? index - 1 : 0;
    final last = index + 3 < deals.length ? index + 3 : deals.length - 1;
    for (var candidate = first; candidate <= last; candidate++) {
      final deal = deals[candidate];
      if (deal.id.isNotEmpty && !_saveStats.containsKey(deal.id)) {
        ids.add(deal.id);
      }
    }
    if (ids.isEmpty) return;
    try {
      final counts = await widget.api.windowSaveCounts(ids);
      if (!mounted) return;
      setState(() {
        counts.forEach((id, stat) {
          _saveStats[id] = stat;
          if (stat.saved) _saved.add(id);
        });
      });
    } catch (_) {
      // Counts are a nicety; the reel works without them.
    }
  }

  // Cache-first, same as the Find-deals screen: a mount or tab switch within
  // the reuse window renders instantly from disk instead of repeating a
  // server read; a stale or missing cache falls through to a live fetch,
  // which then refreshes the cache for next time.
  Future<DiscoveryResult> _loadStoredDiscovery() async {
    final countryCode = widget.api.effectiveCountryCode;
    final cached = await _discoveryCache.load(countryCode);
    if (cached != null) {
      final age = DateTime.now().toUtc().difference(cached.fetchedAt.toUtc());
      if (!age.isNegative && age < _discoveryCacheReuse) {
        return cached.result;
      }
    }
    final result = await widget.api.discovery(forceLive: false);
    unawaited(_discoveryCache.save(result, DateTime.now(), countryCode));
    return result;
  }

  Future<List<ScrollDeal>> _discoveryDeals() async {
    final result = await _loadStoredDiscovery();
    return result.deals
        .where((d) => d.imageUrl != null)
        .map(ScrollDeal.fromDeal)
        .toList();
  }

  Future<void> _load({bool isRefresh = false}) async {
    final fallbackDeals = List<ScrollDeal>.of(_deals);
    if (!isRefresh) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else if (mounted) {
      setState(() => _error = null);
    }
    try {
      var dealSitesFailed = false;
      var discoveryFailed = false;
      final results = await Future.wait<List<ScrollDeal>>([
        widget.api.effectiveCountryCode == 'ZA'
            ? widget.api.dealSites(forceLive: false).catchError((_) {
                dealSitesFailed = true;
                return <ScrollDeal>[];
              })
            : Future.value(<ScrollDeal>[]),
        _discoveryDeals().catchError((_) {
          discoveryFailed = true;
          return <ScrollDeal>[];
        }),
      ]);

      if (dealSitesFailed && discoveryFailed) {
        if (!mounted) return;
        if (isRefresh || _deals.isNotEmpty || _caughtUp) {
          setState(() => _loading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Could not refresh right now. Try again soon.'),
            ),
          );
          return;
        }
        setState(() {
          _loading = false;
          _caughtUp = false;
          _error = 'Could not load the window. Try again.';
        });
        return;
      }

      final combined = <ScrollDeal>[
        ...(dealSitesFailed
            ? fallbackDeals.where((deal) => deal.source != 'discovery')
            : results[0].where((deal) => deal.hasImage)),
        ...(discoveryFailed
            ? fallbackDeals.where((deal) => deal.source == 'discovery')
            : results[1]),
      ];
      final responseKeys = <String>{};
      final unique = <ScrollDeal>[];
      for (final deal in combined) {
        if (responseKeys.add(windowSeenKey(deal))) unique.add(deal);
      }
      final persistedSeen = await _seenStore.loadIds();
      _seenThisVisit.addAll(persistedSeen);
      final unseen = unique
          .where((deal) => !_seenThisVisit.contains(windowSeenKey(deal)))
          .toList();
      // Order by the shopper's taste so the window opens on things they'll love,
      // then shuffle the rest for freshness.
      final taste = await _tasteStore.load();
      if (!taste.isEmpty) {
        unseen.sort((a, b) => taste
            .score(b.title, category: b.category)
            .compareTo(taste.score(a.title, category: a.category)));
      } else {
        unseen.shuffle();
      }

      if (!mounted) return;
      if (_pageController.hasClients && _pageController.page != 0) {
        _pageController.jumpToPage(0);
      }
      setState(() {
        _deals = unseen;
        _currentPage = 0;
        _loading = false;
        _caughtUp = unique.isNotEmpty && unseen.isEmpty;
        _error =
            unique.isEmpty ? 'No deals to browse yet. Check back soon.' : null;
      });
      if (unseen.isNotEmpty) {
        _markFirstVisibleAfterFrame();
        unawaited(_loadCountsFor(0));
      }
      if ((dealSitesFailed || discoveryFailed) && fallbackDeals.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Some deal sources could not refresh right now.'),
          ),
        );
      }
    } catch (_) {
      if (!mounted) return;
      if (isRefresh || _deals.isNotEmpty || _caughtUp) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not refresh right now. Try again soon.'),
          ),
        );
        return;
      }
      setState(() {
        _loading = false;
        _caughtUp = false;
        _error = 'Could not load the window. Try again.';
      });
    }
  }

  Future<void> _toggleSave(ScrollDeal deal) async {
    final wasSaved = _saved.contains(deal.id);
    HapticFeedback.mediumImpact();
    _SubtleSfx.play(wasSaved ? null : 'success');
    // Optimistic update of the saved set and the visible count.
    setState(() {
      if (wasSaved) {
        _saved.remove(deal.id);
      } else {
        _saved.add(deal.id);
      }
      final current = _saveStats[deal.id]?.count ?? 0;
      final next = (current + (wasSaved ? -1 : 1));
      _saveStats[deal.id] =
          SaveStat(count: next < 0 ? 0 : next, saved: !wasSaved);
    });
    try {
      final stat = wasSaved
          ? await widget.api.unsaveWindowDeal(deal.id)
          : await widget.api.saveWindowDeal(deal);
      if (mounted) setState(() => _saveStats[deal.id] = stat);
      // Keep an on-device mirror so the saved sheet works offline too.
      await _savedStore.toggle(deal);
    } catch (_) {
      if (mounted) {
        setState(() {
          if (wasSaved) {
            _saved.add(deal.id);
          } else {
            _saved.remove(deal.id);
          }
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Could not update your save. Try again.')),
        );
      }
      return;
    }
    // Teach the recommender: saving is a strong signal, un-saving reverses it.
    if (wasSaved) {
      await _tasteStore.weaken(title: deal.title, category: deal.category);
    } else {
      await _tasteStore.recordSignal(
          title: deal.title, category: deal.category, weight: 2.0);
    }
  }

  Future<void> _open(ScrollDeal deal) async {
    final uri = safeWindowWebUri(deal.productUrl);
    if (uri == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('This deal link is unavailable.')),
        );
      }
      return;
    }
    HapticFeedback.selectionClick();
    // Opening a deal is a mild interest signal.
    _tasteStore.recordSignal(
        title: deal.title, category: deal.category, weight: 0.5);
    await showInAppBrowser(context, uri.toString(), title: deal.retailerName);
  }

  Future<bool> _saveToSavedDeals(ScrollDeal deal) async {
    if (_savedToDeals.contains(deal.id)) return true;
    HapticFeedback.mediumImpact();
    try {
      await widget.api.saveDeal(deal.toDeal(capturedAt: _now()));
      if (!mounted) return true;
      setState(() => _savedToDeals.add(deal.id));
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Saved to your deals.')));
      return true;
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
      return false;
    }
  }

  Future<void> _share(ScrollDeal deal) async {
    final productUri = safeWindowWebUri(deal.productUrl);
    final parts = [
      deal.title,
      if (deal.priceText != null) deal.priceText!,
      'at ${deal.retailerName}',
      if (productUri != null) productUri.toString(),
      'found on Trolley Scout',
    ];
    final text = Uri.encodeComponent(parts.join(' · '));
    await launchUrl(Uri.parse('https://wa.me/?text=$text'),
        mode: LaunchMode.externalApplication);
  }

  void _openSaved() {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: TS.bgOf(context),
      isScrollControlled: true,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(TS.panelRadius),
        ),
        side: BorderSide(color: TS.lineOf(context), width: 2),
      ),
      builder: (context) => _SavedSheet(
        api: widget.api,
        onOpen: _open,
        onRemove: (deal) => _toggleSave(deal),
        initialSavedToDeals: Set<String>.of(_savedToDeals),
        onSaveToDeals: _saveToSavedDeals,
      ),
    );
  }

  /// Opens the comment thread for a deal. Comments live with the deal.
  void _openComments(ScrollDeal deal) {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: TS.bgOf(context),
      isScrollControlled: true,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(TS.panelRadius),
        ),
        side: BorderSide(color: TS.lineOf(context), width: 2),
      ),
      builder: (context) => _CommentsSheet(api: widget.api, deal: deal),
    );
  }

  /// Opens a store's profile — a vertical reel of just that store's promos.
  void _openStoreProfile(ScrollDeal deal) {
    HapticFeedback.selectionClick();
    final storeDeals =
        _deals.where((d) => d.retailerName == deal.retailerName).toList();
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => _StoreProfileScreen(
        api: widget.api,
        storeName: deal.retailerName,
        sourceLabel: deal.sourceLabel,
        deals: storeDeals.isEmpty ? [deal] : storeDeals,
        initialSaved: Set<String>.of(_saved),
        initialStats: Map<String, SaveStat>.of(_saveStats),
        onOpen: _open,
        onShare: _share,
        onComment: _openComments,
        onSavedChanged: (id, stat) {
          if (!mounted) return;
          setState(() {
            if (stat.saved) {
              _saved.add(id);
            } else {
              _saved.remove(id);
            }
            _saveStats[id] = stat;
          });
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: AnimatedScoutMark(motion: ScoutMarkMotion.spin, size: 44),
      );
    }
    if (_deals.isEmpty) {
      if (_caughtUp) {
        return _CaughtUpState(
          onRefresh: _refresh,
          onOpenSaved: _openSaved,
        );
      }
      return _EmptyState(
          message: _error ?? 'Nothing to browse yet.', onRetry: _load);
    }

    final visible = _visible;

    return Stack(
      children: [
        if (visible.isEmpty)
          _NoMatches(query: _query, onClear: _toggleSearch)
        else
          RefreshIndicator(
            onRefresh: _refresh,
            notificationPredicate: _allowRefreshNotification,
            color: TS.redOf(context),
            backgroundColor: TS.surfaceOf(context),
            child: PageView.builder(
              controller: _pageController,
              scrollDirection: Axis.vertical,
              physics: const PageScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              itemCount: visible.length,
              onPageChanged: (index) {
                setState(() => _currentPage = index);
                HapticFeedback.selectionClick();
                final current = _visible;
                if (index < 0 || index >= current.length) return;
                _markDealSeen(current[index]);
                _precacheAround(index);
                unawaited(_loadCountsFor(index));
              },
              itemBuilder: (context, index) {
                final deal = visible[index];
                return _WindowCard(
                  active: index == _currentPage,
                  deal: deal,
                  saved: _saved.contains(deal.id),
                  saveCount: _saveStats[deal.id]?.count ?? 0,
                  onOpen: () => _open(deal),
                  onSave: () => _toggleSave(deal),
                  onShare: () => _share(deal),
                  onComment: () => _openComments(deal),
                  onOpenStore: () => _openStoreProfile(deal),
                );
              },
            ),
          ),
        // Top bar: label (or search field), search, music mute, and saved.
        Positioned(
          top: 10,
          left: 12,
          right: 12,
          child: SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  key: const ValueKey('window-top-controls'),
                  children: [
                    if (_searching)
                      Expanded(child: _buildSearchField())
                    else
                      Expanded(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.45),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Text(
                              'WINDOW SHOPPING',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(width: 8),
                    _RoundIcon(
                      icon: _searching ? Icons.close : Icons.search,
                      tooltip:
                          _searching ? 'Close search' : 'Search the window',
                      onTap: _toggleSearch,
                    ),
                    const SizedBox(width: 8),
                    _RoundIcon(
                      icon: _musicMuted ? Icons.music_off : Icons.music_note,
                      tooltip:
                          _musicMuted ? 'Play store music' : 'Mute store music',
                      onTap: _toggleMute,
                    ),
                    const SizedBox(width: 8),
                    _RoundIcon(
                      icon: Icons.bookmark,
                      badge: _saved.isEmpty ? null : '${_saved.length}',
                      tooltip: 'Saved deals',
                      onTap: _openSaved,
                    ),
                  ],
                ),
                // Now-playing credit — also the CC BY attribution for the music.
                if (!_musicMuted)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.35),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '♪ ${_tracks[_trackIndex].title} · Kevin MacLeod (CC BY)',
                        style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 10,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSearchField() {
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white24),
      ),
      child: TextField(
        controller: _searchController,
        onChanged: _setQuery,
        autofocus: true,
        textInputAction: TextInputAction.search,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        cursorColor: TS.yellow,
        decoration: const InputDecoration(
          isDense: true,
          border: InputBorder.none,
          hintText: 'Search the window…',
          hintStyle: TextStyle(color: Colors.white54, fontSize: 14),
          contentPadding: EdgeInsets.symmetric(vertical: 10),
        ),
      ),
    );
  }
}

/// Shown when a search has no matches — the window is empty but the deals
/// aren't gone; clearing the search brings them all back.
class _NoMatches extends StatelessWidget {
  const _NoMatches({required this.query, required this.onClear});

  final String query;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ScoutMascot(
              pose: ScoutMascotPose.search,
              size: 132,
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                'Nothing in the window for “$query”.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: TS.yellow, foregroundColor: TS.ink),
              onPressed: onClear,
              child: const Text('Show everything'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Fetches images at a higher resolution from the CDNs the deal sites use, so
/// the full-screen window isn't a stretched thumbnail.
String upgradeImageUrl(String? url) {
  if (url == null || url.isEmpty) return '';
  // imgix (OneDayOnly): replace whatever variant the feed pinned with a large,
  // sharp, modern-format one sized for a full phone screen.
  if (url.contains('imgix.net')) {
    final base = url.split('?').first;
    return '$base?w=1600&q=85&auto=format,compress&fit=max';
  }
  // Shopify (Hyperli): swap any sized variant for 1600px, or add one to the
  // master image.
  if (url.contains('cdn.shopify.com')) {
    if (RegExp(r'_\d+x\d*\.').hasMatch(url)) {
      return url.replaceFirst(RegExp(r'_\d+x\d*\.'), '_1600x.');
    }
    return url.replaceFirstMapped(
      RegExp(r'(\.(?:jpg|jpeg|png|webp))(\?|$)', caseSensitive: false),
      (match) => '_1600x${match[1]}${match[2]}',
    );
  }
  // WordPress uploads (Daddy's Deals): strip -300x200-style thumbnail suffixes
  // so the original full-size upload is fetched instead.
  if (url.contains('/wp-content/')) {
    return url.replaceFirst(
      RegExp(r'-\d+x\d+(?=\.(?:jpg|jpeg|png|webp)(?:\?|$))',
          caseSensitive: false),
      '',
    );
  }
  return url;
}

/// Plays a quiet one-shot only when global sounds are on — Window Shopping keeps
/// its own feedback almost silent so the ambience leads.
@visibleForTesting
Uri? safeWindowWebUri(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null || uri.host.isEmpty) return null;
  return uri.scheme == 'https' || uri.scheme == 'http' ? uri : null;
}

class _SubtleSfx {
  static final AudioPlayer _player = AudioPlayer(playerId: 'window_sfx');
  static void play(String? name) {
    if (name == null || !UxSettings.instance.sounds) return;
    () async {
      try {
        await _player.stop();
        await _player.play(AssetSource('sounds/$name.wav'), volume: 0.35);
      } catch (_) {}
    }();
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({
    required this.icon,
    required this.onTap,
    this.tooltip,
    this.badge,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String? tooltip;
  final String? badge;

  // The tappable area is 48x48 (the accessible minimum) while the visible
  // circle stays 40x40, centred inside it via an even 4px inset — so the
  // control reads the same size on screen but is easier to hit.
  static const _hitSize = 48.0;
  static const _visualSize = 40.0;
  static const _inset = (_hitSize - _visualSize) / 2;

  @override
  Widget build(BuildContext context) {
    final button = GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: _hitSize,
        height: _hitSize,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: _inset,
              top: _inset,
              child: Container(
                width: _visualSize,
                height: _visualSize,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: Colors.white, size: 20),
              ),
            ),
            if (badge != null)
              Positioned(
                right: _inset - 3,
                top: _inset - 3,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: TS.red,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(badge!,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w900)),
                ),
              ),
          ],
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

class _WindowCard extends StatelessWidget {
  const _WindowCard({
    this.active = true,
    required this.deal,
    required this.saved,
    required this.saveCount,
    required this.onOpen,
    required this.onSave,
    required this.onShare,
    required this.onComment,
    required this.onOpenStore,
  });

  final bool active;
  final ScrollDeal deal;
  final bool saved;
  final int saveCount;
  final VoidCallback onOpen;
  final VoidCallback onSave;
  final VoidCallback onShare;
  final VoidCallback onComment;
  final VoidCallback onOpenStore;

  static String formatCount(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}m';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return '$n';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      key: ValueKey('window-card-${deal.id}'),
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(TS.panelRadius),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (deal.hasImage)
            _WindowImageGallery(
              key: ValueKey(deal.id),
              active: active,
              images: deal.gallery,
              onDoubleTap: saved ? null : onSave,
            )
          else
            const _ImageFallback(),
          const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.transparent,
                    Color(0xCC000000),
                    Color(0xF2000000),
                  ],
                  stops: [0, 0.45, 0.78, 1],
                ),
              ),
            ),
          ),
          Positioned(
            right: 10,
            bottom: 190,
            child: Column(
              children: [
                _RailButton(
                  icon: saved ? Icons.bookmark : Icons.bookmark_border,
                  color: saved ? TS.yellow : Colors.white,
                  label: saveCount > 0
                      ? formatCount(saveCount)
                      : (saved ? 'Saved' : 'Save'),
                  onTap: onSave,
                ),
                const SizedBox(height: 18),
                _RailButton(
                  icon: Icons.mode_comment_outlined,
                  color: Colors.white,
                  label: 'Comment',
                  onTap: onComment,
                ),
                const SizedBox(height: 18),
                _RailButton(
                  icon: Icons.share,
                  color: Colors.white,
                  label: 'Share',
                  onTap: onShare,
                ),
              ],
            ),
          ),
          Positioned(
            left: 16,
            right: 74,
            bottom: 28,
            child: Column(
              key: const ValueKey('window-deal-details'),
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    // Tapping the store opens its profile (all its promos).
                    GestureDetector(
                      onTap: onOpenStore,
                      child: _StoreChip(name: deal.retailerName),
                    ),
                    if (deal.category != null) ...[
                      const SizedBox(width: 6),
                      _Badge(
                          text: deal.category!.toUpperCase(),
                          color: Colors.white24,
                          textColor: Colors.white),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  deal.title,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      height: 1.1),
                ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    if (deal.priceText != null)
                      Text(deal.priceText!,
                          style: const TextStyle(
                              color: TS.yellow,
                              fontSize: 30,
                              fontWeight: FontWeight.w900)),
                    const SizedBox(width: 10),
                    if (meaningfulWasPrice(
                            deal.previousPriceText, deal.priceText) !=
                        null)
                      Text(
                          meaningfulWasPrice(
                              deal.previousPriceText, deal.priceText)!,
                          style: const TextStyle(
                              color: Colors.white70,
                              decoration: TextDecoration.lineThrough,
                              fontSize: 16)),
                  ],
                ),
                Row(
                  children: [
                    if (deal.savingText != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4, right: 8),
                        child: _Badge(
                            text: deal.savingText!,
                            color: TS.red,
                            textColor: Colors.white),
                      ),
                    if (_expiryLabel(deal.expiresAt) != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: _Badge(
                            text: _expiryLabel(deal.expiresAt)!,
                            color: Colors.white,
                            textColor: TS.ink),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: TS.yellow,
                      foregroundColor: TS.ink,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(TS.controlRadius),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    onPressed: onOpen,
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: Text('View at ${deal.retailerName}',
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String? _expiryLabel(String? expiresAt) {
    if (expiresAt == null) return null;
    final end = DateTime.tryParse(expiresAt);
    if (end == null) return null;
    final now = DateTime.now();
    final diff = end.difference(now);
    if (diff.isNegative) return null;
    if (diff.inHours < 24 && end.day == now.day) return 'ENDS TODAY';
    if (diff.inHours < 48) return 'ENDS SOON';
    if (diff.inDays < 7) return '${diff.inDays} DAYS LEFT';
    return null;
  }
}

class _SavedSheet extends StatefulWidget {
  const _SavedSheet({
    required this.api,
    required this.onOpen,
    required this.onRemove,
    required this.initialSavedToDeals,
    required this.onSaveToDeals,
  });

  final Api api;
  final void Function(ScrollDeal) onOpen;
  final void Function(ScrollDeal) onRemove;
  final Set<String> initialSavedToDeals;
  final Future<bool> Function(ScrollDeal) onSaveToDeals;

  @override
  State<_SavedSheet> createState() => _SavedSheetState();
}

class _SavedSheetState extends State<_SavedSheet> {
  List<ScrollDeal> _items = const [];
  late final Set<String> _savedToDeals =
      Set<String>.of(widget.initialSavedToDeals);
  final Set<String> _savingToDeals = <String>{};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    widget.api.windowSaves().then((items) {
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    }).catchError((_) {
      if (mounted) setState(() => _loading = false);
    });
  }

  Future<void> _remove(ScrollDeal deal) async {
    // Delegate to the parent so the server, counts, and reel stay in sync.
    widget.onRemove(deal);
    if (mounted) {
      setState(() => _items = _items.where((d) => d.id != deal.id).toList());
    }
  }

  Future<void> _saveToDeals(ScrollDeal deal) async {
    if (_savedToDeals.contains(deal.id) || _savingToDeals.contains(deal.id)) {
      return;
    }
    setState(() => _savingToDeals.add(deal.id));
    final saved = await widget.onSaveToDeals(deal);
    if (!mounted) return;
    setState(() {
      _savingToDeals.remove(deal.id);
      if (saved) _savedToDeals.add(deal.id);
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints:
            BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 18, 20, 8),
              child: Text('Saved from window shopping',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_items.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                child: Text(
                  'Tap Save on a deal to keep it here. Saved deals also teach '
                  'Find a deal what you like.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
              )
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.only(bottom: 12),
                  itemCount: _items.length,
                  itemBuilder: (context, index) {
                    final deal = _items[index];
                    final saved = _savedToDeals.contains(deal.id);
                    final saving = _savingToDeals.contains(deal.id);
                    return Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      child: Container(
                        clipBehavior: Clip.antiAlias,
                        decoration: BoxDecoration(
                          color: TS.surfaceOf(context),
                          borderRadius: BorderRadius.circular(TS.cardRadius),
                          border: Border.all(color: TS.lineSoftOf(context)),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ListTile(
                              leading: deal.hasImage
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(10),
                                      child: Image.network(
                                        upgradeImageUrl(deal.imageUrl),
                                        width: 46,
                                        height: 46,
                                        cacheWidth: 138,
                                        cacheHeight: 138,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, __, ___) =>
                                            const Icon(
                                          Icons.local_offer_outlined,
                                        ),
                                      ),
                                    )
                                  : const Icon(Icons.local_offer_outlined),
                              title: Text(
                                deal.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Text(
                                '${deal.priceText ?? ''} · ${deal.retailerName}',
                              ),
                              trailing: IconButton(
                                icon: const Icon(Icons.close),
                                tooltip: 'Remove',
                                onPressed: () => _remove(deal),
                              ),
                              onTap: () => widget.onOpen(deal),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                              child: SizedBox(
                                width: double.infinity,
                                child: FilledButton.icon(
                                  key: ValueKey(
                                    'window-save-to-deals-${deal.id}',
                                  ),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: TS.yellow,
                                    foregroundColor: TS.ink,
                                    disabledBackgroundColor:
                                        TS.yellow.withValues(alpha: 0.55),
                                    disabledForegroundColor: TS.ink,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(
                                        TS.controlRadius,
                                      ),
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 12,
                                    ),
                                  ),
                                  onPressed: saved || saving
                                      ? null
                                      : () => _saveToDeals(deal),
                                  icon: Icon(
                                    saved
                                        ? Icons.bookmark_added
                                        : Icons.bookmark_add_outlined,
                                    size: 18,
                                  ),
                                  label: Text(
                                    saving
                                        ? 'Saving…'
                                        : saved
                                            ? 'Saved to saved deals'
                                            : 'Save to saved deals',
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.4),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(height: 3),
          Text(label,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// A tappable store "avatar + name" chip that opens the store's profile.
class _StoreChip extends StatelessWidget {
  const _StoreChip({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(5, 4, 8, 4),
      decoration: BoxDecoration(
          color: TS.yellow, borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration:
                const BoxDecoration(color: TS.ink, shape: BoxShape.circle),
            child: Center(
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : '?',
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 12),
              ),
            ),
          ),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 170),
            child: Text(
              name.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: TS.ink,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.4),
            ),
          ),
          const Icon(Icons.chevron_right, size: 16, color: TS.ink),
        ],
      ),
    );
  }
}

/// Comment thread for one deal. Comments are stored against the deal id, so they
/// disappear once the deal leaves the feed.
class _CommentsSheet extends StatefulWidget {
  const _CommentsSheet({required this.api, required this.deal});

  final Api api;
  final ScrollDeal deal;

  @override
  State<_CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<_CommentsSheet> {
  final _controller = TextEditingController();
  List<DealComment> _comments = const [];
  bool _loading = true;
  bool _posting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final comments = await widget.api.dealComments(widget.deal.id);
      if (mounted) {
        setState(() {
          _comments = comments;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _post() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _posting) return;
    setState(() => _posting = true);
    try {
      final comment = await widget.api.addDealComment(widget.deal.id, text);
      if (mounted) {
        setState(() {
          _comments = [comment, ..._comments];
          _controller.clear();
          _posting = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _posting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Could not post your comment. Try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.78),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 16, 20, 2),
                child: Text('Comments',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(widget.deal.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: TS.mutedOf(context))),
              ),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_comments.isEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Text(
                    'No comments yet. Be the first. Comments stay with the deal.',
                    style: TextStyle(color: TS.mutedOf(context)),
                  ),
                )
              else
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: _comments.length,
                    itemBuilder: (context, index) {
                      final comment = _comments[index];
                      return ListTile(
                        dense: true,
                        leading: CircleAvatar(
                          radius: 16,
                          child: Text(comment.author.isNotEmpty
                              ? comment.author[0].toUpperCase()
                              : '?'),
                        ),
                        title: Text(comment.author,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 13)),
                        subtitle: Text(comment.body),
                      );
                    },
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        minLines: 1,
                        maxLines: 3,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _post(),
                        decoration: InputDecoration(
                          isDense: true,
                          hintText: 'Add a comment…',
                          border: OutlineInputBorder(
                              borderSide:
                                  BorderSide(color: TS.lineSoftOf(context))),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: TS.yellow,
                        foregroundColor: TS.ink,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(TS.controlRadius),
                        ),
                        padding: const EdgeInsets.symmetric(
                            vertical: 14, horizontal: 16),
                      ),
                      onPressed: _posting ? null : _post,
                      child: const Text('Post'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A store's profile: a vertical reel of just that store's promos, opened by
/// tapping the store chip on a card.
class _StoreProfileScreen extends StatefulWidget {
  const _StoreProfileScreen({
    required this.api,
    required this.storeName,
    required this.sourceLabel,
    required this.deals,
    required this.initialSaved,
    required this.initialStats,
    required this.onOpen,
    required this.onShare,
    required this.onComment,
    required this.onSavedChanged,
  });

  final Api api;
  final String storeName;
  final String sourceLabel;
  final List<ScrollDeal> deals;
  final Set<String> initialSaved;
  final Map<String, SaveStat> initialStats;
  final void Function(ScrollDeal) onOpen;
  final void Function(ScrollDeal) onShare;
  final void Function(ScrollDeal) onComment;
  final void Function(String, SaveStat) onSavedChanged;

  @override
  State<_StoreProfileScreen> createState() => _StoreProfileScreenState();
}

class _StoreProfileScreenState extends State<_StoreProfileScreen> {
  late final Set<String> _saved = Set<String>.of(widget.initialSaved);
  late final Map<String, SaveStat> _saveStats =
      Map<String, SaveStat>.of(widget.initialStats);
  final _pageController = PageController();
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _loadCounts();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadCounts() async {
    final ids = widget.deals
        .map((d) => d.id)
        .where((id) => id.isNotEmpty && !_saveStats.containsKey(id))
        .take(30)
        .toList();
    if (ids.isEmpty) return;
    try {
      final counts = await widget.api.windowSaveCounts(ids);
      if (!mounted) return;
      setState(() {
        counts.forEach((id, stat) {
          _saveStats[id] = stat;
          if (stat.saved) _saved.add(id);
        });
      });
    } catch (_) {}
  }

  Future<void> _toggle(ScrollDeal deal) async {
    final was = _saved.contains(deal.id);
    HapticFeedback.mediumImpact();
    setState(() {
      if (was) {
        _saved.remove(deal.id);
      } else {
        _saved.add(deal.id);
      }
      final current = _saveStats[deal.id]?.count ?? 0;
      final next = current + (was ? -1 : 1);
      _saveStats[deal.id] = SaveStat(count: next < 0 ? 0 : next, saved: !was);
    });
    try {
      final stat = was
          ? await widget.api.unsaveWindowDeal(deal.id)
          : await widget.api.saveWindowDeal(deal);
      if (mounted) setState(() => _saveStats[deal.id] = stat);
      widget.onSavedChanged(deal.id, stat);
    } catch (_) {
      if (mounted) {
        setState(() {
          if (was) {
            _saved.add(deal.id);
          } else {
            _saved.remove(deal.id);
          }
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Could not update your save. Try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: TS.bgOf(context),
        title: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.storeName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            Text(
                '${widget.deals.length} promo${widget.deals.length == 1 ? '' : 's'}',
                style: TextStyle(fontSize: 12, color: TS.mutedOf(context))),
          ],
        ),
      ),
      body: PageView.builder(
        controller: _pageController,
        scrollDirection: Axis.vertical,
        itemCount: widget.deals.length,
        onPageChanged: (index) => setState(() => _currentPage = index),
        itemBuilder: (context, index) {
          final deal = widget.deals[index];
          return _WindowCard(
            active: index == _currentPage,
            deal: deal,
            saved: _saved.contains(deal.id),
            saveCount: _saveStats[deal.id]?.count ?? 0,
            onOpen: () => widget.onOpen(deal),
            onSave: () => _toggle(deal),
            onShare: () => widget.onShare(deal),
            onComment: () => widget.onComment(deal),
            onOpenStore: () {},
          );
        },
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(
      {required this.text, required this.color, required this.textColor});

  final String text;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text,
          style: TextStyle(
              color: textColor,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4)),
    );
  }
}

/// A product gallery that resolves horizontal image gestures inside the
/// vertical deal reel and keeps its controls usable over every image shape.
class _WindowImageGallery extends StatefulWidget {
  const _WindowImageGallery({
    super.key,
    required this.active,
    required this.images,
    required this.onDoubleTap,
  });

  final bool active;
  final List<String> images;
  final VoidCallback? onDoubleTap;

  @override
  State<_WindowImageGallery> createState() => _WindowImageGalleryState();
}

class _WindowImageGalleryState extends State<_WindowImageGallery> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _show(int index) {
    if (index < 0 || index >= widget.images.length) return;
    HapticFeedback.selectionClick();
    if (MediaQuery.of(context).disableAnimations) {
      _controller.jumpToPage(index);
    } else {
      _controller.animateToPage(
        index,
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
      );
    }
  }

  List<int> get _dotIndexes {
    const visibleDotLimit = 9;
    if (widget.images.length <= visibleDotLimit) {
      return List<int>.generate(widget.images.length, (index) => index);
    }
    final maxStart = widget.images.length - visibleDotLimit;
    final start = (_index - visibleDotLimit ~/ 2).clamp(0, maxStart).toInt();
    return List<int>.generate(visibleDotLimit, (offset) => start + offset);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.images.length == 1) {
      return GestureDetector(
        onDoubleTap: widget.onDoubleTap,
        child: WindowProductImage(
          key: ValueKey(widget.images.first),
          active: widget.active,
          url: widget.images.first,
        ),
      );
    }

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label: 'Product image ${_index + 1} of ${widget.images.length}',
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            controller: _controller,
            scrollDirection: Axis.horizontal,
            itemCount: widget.images.length,
            onPageChanged: (index) {
              if (!mounted) return;
              setState(() => _index = index);
            },
            itemBuilder: (context, index) => GestureDetector(
              onDoubleTap: widget.onDoubleTap,
              child: WindowProductImage(
                key: ValueKey(widget.images[index]),
                active: widget.active && index == _index,
                url: widget.images[index],
              ),
            ),
          ),
          Positioned(
            left: 8,
            top: 0,
            bottom: 0,
            child: Center(
              child: _GalleryArrow(
                tooltip: 'Previous image',
                icon: Icons.chevron_left,
                onPressed: _index > 0 ? () => _show(_index - 1) : null,
              ),
            ),
          ),
          Positioned(
            // Leave the far-right action rail clear on shorter phones.
            right: 68,
            top: 0,
            bottom: 0,
            child: Center(
              child: _GalleryArrow(
                tooltip: 'Next image',
                icon: Icons.chevron_right,
                onPressed: _index < widget.images.length - 1
                    ? () => _show(_index + 1)
                    : null,
              ),
            ),
          ),
          Positioned(
            left: 60,
            right: 60,
            top: 88,
            child: Row(
              key: const ValueKey('window-image-dots'),
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (final index in _dotIndexes)
                  Container(
                    key: ValueKey('window-image-dot-$index'),
                    width: index == _index ? 9 : 6,
                    height: index == _index ? 9 : 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: index == _index ? Colors.white : Colors.white54,
                      shape: BoxShape.circle,
                      boxShadow: const [
                        BoxShadow(color: Colors.black45, blurRadius: 3),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GalleryArrow extends StatelessWidget {
  const _GalleryArrow({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.52),
      shape: const CircleBorder(),
      child: IconButton(
        tooltip: tooltip,
        constraints: const BoxConstraints.tightFor(width: 48, height: 48),
        color: Colors.white,
        disabledColor: Colors.white30,
        onPressed: onPressed,
        icon: Icon(icon, size: 30),
      ),
    );
  }
}

class WindowProductImage extends StatefulWidget {
  const WindowProductImage({
    super.key,
    required this.url,
    this.active = true,
    this.imageProvider,
  });

  final String url;
  final bool active;
  @visibleForTesting
  final ImageProvider<Object>? imageProvider;

  @override
  State<WindowProductImage> createState() => _WindowProductImageState();
}

class _WindowProductImageState extends State<WindowProductImage>
    with SingleTickerProviderStateMixin {
  // Start at the image's fitted size, then ease outward so unusual dimensions
  // remain visible without magnifying a low-resolution source.
  static const _startScale = 1.0;
  static const _endScale = 0.92;

  late final AnimationController _controller;
  late final Animation<double> _scale;
  bool _hasDecodedFrame = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 14),
    );
    _scale = Tween<double>(
      begin: _startScale,
      end: _endScale,
    ).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    );
  }

  void _startAfterDecode() {
    if (_hasDecodedFrame) return;
    _hasDecodedFrame = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.active) _controller.forward(from: 0);
    });
  }

  @override
  void didUpdateWidget(covariant WindowProductImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.active == widget.active) return;
    if (!widget.active) {
      _controller.stop();
      _controller.value = 0;
    } else if (_hasDecodedFrame) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final image = Image(
      image: widget.imageProvider ?? NetworkImage(upgradeImageUrl(widget.url)),
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      gaplessPlayback: true,
      frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
        if (frame != null) _startAfterDecode();
        return child;
      },
      errorBuilder: (_, __, ___) => const _ImageFallback(),
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : const _ImageFallback(),
    );
    // Reduce-motion shoppers get the settled frame with no movement.
    if (MediaQuery.of(context).disableAnimations) {
      return Transform.scale(scale: _endScale, child: image);
    }
    return ScaleTransition(
      key: ValueKey('window-image-scale-${widget.url}'),
      scale: _scale,
      child: image,
    );
  }
}

class _ImageFallback extends StatelessWidget {
  const _ImageFallback();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Color(0xFF1C1710),
      child: Center(
        child:
            Icon(Icons.local_offer_outlined, color: Colors.white24, size: 64),
      ),
    );
  }
}

class _CaughtUpState extends StatelessWidget {
  const _CaughtUpState({
    required this.onRefresh,
    required this.onOpenSaved,
  });

  final Future<void> Function() onRefresh;
  final VoidCallback onOpenSaved;

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height;
    return ColoredBox(
      color: TS.bgOf(context),
      child: RefreshIndicator(
        onRefresh: onRefresh,
        color: TS.redOf(context),
        backgroundColor: TS.surfaceOf(context),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: height,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.check_circle_outline,
                        size: 54,
                        color: TS.greenOf(context),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'You’re all caught up.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: TS.inkOf(context),
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Pull down to check for fresh deals.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: TS.yellow,
                          foregroundColor: TS.ink,
                        ),
                        onPressed: onRefresh,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Check for new deals'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: TS.inkOf(context),
                          side: BorderSide(color: TS.lineOf(context)),
                        ),
                        onPressed: onOpenSaved,
                        icon: const Icon(Icons.bookmark_outline),
                        label: const Text('Saved deals'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.window_outlined, size: 48, color: TS.mutedOf(context)),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context))),
          ),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: TS.yellow, foregroundColor: TS.ink),
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
