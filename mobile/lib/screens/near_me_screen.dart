import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../api.dart';
import '../catalogue_sort.dart';
import '../nearby_history_store.dart';
import '../saved_addresses_store.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/common.dart';
import '../widgets/login_gate_card.dart';
import '../widgets/scout_mark.dart';
import '../widgets/sponsored_ad_card.dart';

enum _LocationSettingsTarget { app, device }

class NearMeScreen extends StatefulWidget {
  const NearMeScreen({
    super.key,
    required this.api,
    this.historyStore,
    this.addressStore,
    this.onViewStoreDeals,
    this.isAuthenticated = false,
    this.onWantsAuth,
    this.isLocationServiceEnabled,
    this.checkLocationPermission,
    this.requestLocationPermission,
    this.readCurrentPosition,
    this.openAppLocationSettings,
    this.openDeviceLocationSettings,
  });
  final Api api;
  final NearbyHistoryStore? historyStore;
  final SavedAddressesStore? addressStore;
  // Called when a shopper taps a store card to see its deals in Find deals.
  final void Function(String? retailerId, String storeName)? onViewStoreDeals;
  final bool isAuthenticated;
  final VoidCallback? onWantsAuth;
  final Future<bool> Function()? isLocationServiceEnabled;
  final Future<LocationPermission> Function()? checkLocationPermission;
  final Future<LocationPermission> Function()? requestLocationPermission;
  final Future<Position> Function()? readCurrentPosition;
  final Future<bool> Function()? openAppLocationSettings;
  final Future<bool> Function()? openDeviceLocationSettings;

  @override
  State<NearMeScreen> createState() => _NearMeScreenState();
}

class _NearMeScreenState extends State<NearMeScreen> {
  late final NearbyHistoryStore _historyStore =
      widget.historyStore ?? NearbyHistoryStore();
  late final SavedAddressesStore _addressStore =
      widget.addressStore ?? SavedAddressesStore();
  final _addressController = TextEditingController();
  bool _busy = false;
  bool _restoringHistory = true;
  String _message =
      'Find the supermarkets around you and this week’s specials for each.';
  List<NearbyStore> _stores = const [];
  DateTime? _capturedAt;
  List<NearbyHistoryEntry> _history = const [];
  List<SavedAddress> _savedAddresses = const [];
  List<PublicAd> _ads = const [];
  String? _viewingId;
  // The location behind the currently shown results, so it can be saved.
  double? _currentLat;
  double? _currentLon;
  String? _currentLabel;
  String? _currentFormatted;
  _LocationSettingsTarget? _locationSettingsTarget;
  // True only when the most recent search attempt actually failed (network
  // or lookup error) — never for "no stores found" or a permission/service
  // prompt, which already have their own contextual actions.
  bool _searchFailed = false;
  Future<void> Function()? _lastSearch;

  @override
  void initState() {
    super.initState();
    _restoreHistory();
    _restoreAddresses();
    _loadAds();
  }

  @override
  void dispose() {
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _loadAds() async {
    try {
      final ads = await widget.api.publicAds('near_me');
      if (mounted) setState(() => _ads = ads);
    } catch (_) {
      // Sponsored slot stays empty if unreachable.
    }
  }

  Future<void> _restoreAddresses() async {
    final saved = await _addressStore.load();
    if (mounted) setState(() => _savedAddresses = saved);
  }

  Future<void> _restoreHistory() async {
    final entries = await _historyStore.loadEntries();
    if (!mounted) return;
    setState(() {
      _restoringHistory = false;
      _history = entries;
      if (entries.isNotEmpty) {
        final latest = entries.first;
        _stores = latest.result.stores;
        _capturedAt = latest.capturedAt;
        _viewingId = latest.id;
        _currentLabel = latest.locationLabel;
        _message =
            '${_stores.length} stores from your last search near ${latest.locationLabel}.';
      }
    });
  }

  void _showHistoryEntry(NearbyHistoryEntry entry) {
    setState(() {
      _stores = entry.result.stores;
      _capturedAt = entry.capturedAt;
      _viewingId = entry.id;
      _currentLabel = entry.locationLabel;
      _currentFormatted = null;
      // History entries don't carry their search-centre coordinate, so the
      // "Save address" button must hide (matching restored history) rather than
      // save the previously-searched spot under this entry's label.
      _currentLat = null;
      _currentLon = null;
      _message = '${_stores.length} stores near ${entry.locationLabel}.';
    });
  }

  Future<void> _removeHistory(NearbyHistoryEntry entry) async {
    final next = await _historyStore.removeEntry(entry.id);
    if (!mounted) return;
    setState(() => _history = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text('${entry.locationLabel} removed from recent searches.'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => _undoHistoryRemoval(entry),
        ),
      ));
  }

  Future<void> _undoHistoryRemoval(NearbyHistoryEntry entry) async {
    final next = await _historyStore.save(
      entry.result,
      entry.capturedAt,
      label: entry.locationLabel,
    );
    if (mounted) setState(() => _history = next);
  }

  Future<void> _findNearby() async {
    _lastSearch = _findNearby;
    setState(() {
      _busy = true;
      _locationSettingsTarget = null;
      _searchFailed = false;
      _message = 'Finding your location…';
    });

    try {
      final serviceEnabled = await (widget.isLocationServiceEnabled?.call() ??
          Geolocator.isLocationServiceEnabled());
      if (!mounted) return;
      if (!serviceEnabled) {
        setState(() {
          _busy = false;
          _locationSettingsTarget = _LocationSettingsTarget.device;
          _message =
              'Device location is off. Turn it on, or search for an address instead.';
        });
        return;
      }

      var permission = await (widget.checkLocationPermission?.call() ??
          Geolocator.checkPermission());
      if (permission == LocationPermission.denied) {
        permission = await (widget.requestLocationPermission?.call() ??
            Geolocator.requestPermission());
      }
      if (!mounted) return;
      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _busy = false;
          _locationSettingsTarget = _LocationSettingsTarget.app;
          _message =
              'Location access is blocked. Allow it in app settings, or search for an address instead.';
        });
        return;
      }
      if (permission == LocationPermission.denied) {
        setState(() {
          _busy = false;
          _message =
              'Location was not allowed. You can try again or search for an address instead.';
        });
        return;
      }

      final pos = await (widget.readCurrentPosition?.call() ??
          Geolocator.getCurrentPosition(
            locationSettings:
                const LocationSettings(accuracy: LocationAccuracy.medium),
          ));
      if (!mounted) return;
      await _loadNearbyFor(pos.latitude, pos.longitude);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _searchFailed = true;
        _message = 'Could not read your location. Try again.';
      });
    }
  }

  Future<void> _openLocationSettings() async {
    final target = _locationSettingsTarget;
    if (target == null) return;
    final opened = target == _LocationSettingsTarget.app
        ? await (widget.openAppLocationSettings?.call() ??
            Geolocator.openAppSettings())
        : await (widget.openDeviceLocationSettings?.call() ??
            Geolocator.openLocationSettings());
    if (!mounted || opened) return;
    showNotice(context, 'Could not open settings on this device.');
  }

  // Geocodes a typed address, then searches around it. Keeps its own error copy
  // so a geocode miss never reads as a location-permission problem.
  Future<void> _findByAddress() async {
    final query = _addressController.text.trim();
    if (query.length < 3) return;
    _lastSearch = _findByAddress;
    FocusScope.of(context).unfocus();
    uxTap();
    setState(() {
      _busy = true;
      _searchFailed = false;
      _message = 'Looking up “$query”…';
    });

    GeoPoint point;
    try {
      point = await widget.api.geocodeAddress(query);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _searchFailed = true;
        _message = error.message;
      });
      return;
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _searchFailed = true;
        _message = 'We could not find that address. Try a suburb or town.';
      });
      return;
    }

    await _loadNearbyFor(
      point.lat,
      point.lon,
      label: _shortLabelFor(query, point.formatted),
      formatted: point.formatted,
    );
  }

  // The shared "search this spot and show it" step used by GPS, a typed
  // address, and a saved address.
  Future<void> _loadNearbyFor(
    double lat,
    double lon, {
    String? label,
    String? formatted,
  }) async {
    _lastSearch = () => _loadNearbyFor(lat, lon, label: label, formatted: formatted);
    setState(() {
      _busy = true;
      _searchFailed = false;
      _message = 'Checking stores near ${label ?? 'you'}…';
    });

    try {
      final result = await widget.api.nearbyStores(lat, lon);
      final capturedAt = DateTime.now();
      var entries = _history;
      if (result.stores.isNotEmpty) {
        entries = await _historyStore.save(result, capturedAt,
            lat: lat, lon: lon, label: label);
      }
      if (!mounted) return;
      setState(() {
        _busy = false;
        _history = entries;
        _stores = result.stores;
        _capturedAt = result.stores.isEmpty ? _capturedAt : capturedAt;
        _viewingId = entries.isEmpty ? _viewingId : entries.first.id;
        _currentLat = lat;
        _currentLon = lon;
        _currentLabel =
            label ?? (entries.isNotEmpty ? entries.first.locationLabel : null);
        _currentFormatted = formatted;
        _message = result.stores.isEmpty
            ? 'No supermarkets found within a few kilometres of ${label ?? 'there'}.'
            : '${result.stores.length} stores near ${_currentLabel ?? 'you'}.';
      });
    } catch (e) {
      if (!mounted) return;
      // Mirrors the deals screen's cache-first fallback: a failed live fetch
      // still shows the shopper their most recent search, clearly labelled,
      // rather than an empty screen with no next step.
      final fallback = _history.isNotEmpty ? _history.first : null;
      setState(() {
        _busy = false;
        _searchFailed = true;
        if (fallback != null) {
          _stores = fallback.result.stores;
          _capturedAt = fallback.capturedAt;
          _viewingId = fallback.id;
          _currentLabel = fallback.locationLabel;
          _currentFormatted = null;
          _currentLat = null;
          _currentLon = null;
          _message = 'Could not check ${label ?? 'that location'}. Showing '
              'your last search near ${fallback.locationLabel} — retry to check again.';
        } else {
          _message = 'Could not check that location. Try again.';
        }
      });
    }
  }

  Future<void> _saveCurrentAddress() async {
    if (_currentLat == null || _currentLon == null) return;
    final label = _currentLabel ?? _currentFormatted ?? 'Saved location';
    final next = await _addressStore.add(SavedAddress(
      id: DateTime.now().toUtc().toIso8601String(),
      label: label,
      lat: _currentLat!,
      lon: _currentLon!,
      formattedAddress: _currentFormatted,
      createdAt: DateTime.now(),
    ));
    if (!mounted) return;
    uxSuccess();
    setState(() => _savedAddresses = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('Saved “$label”.')));
  }

  Future<void> _removeSavedAddress(SavedAddress address) async {
    final next = await _addressStore.remove(address.id);
    if (!mounted) return;
    setState(() => _savedAddresses = next);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text('“${address.label}” removed.'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => _restoreSavedAddress(address),
        ),
      ));
  }

  Future<void> _restoreSavedAddress(SavedAddress address) async {
    final next = await _addressStore.add(address);
    if (mounted) setState(() => _savedAddresses = next);
  }

  static String _shortLabelFor(String query, String? formatted) {
    // Prefer the first, most-specific part of the formatted address; fall back
    // to what the shopper typed.
    if (formatted != null && formatted.trim().isNotEmpty) {
      final first = formatted.split(',').first.trim();
      if (first.isNotEmpty) return first;
    }
    return query;
  }

  @override
  Widget build(BuildContext context) {
    final visibleStores =
        widget.isAuthenticated ? _stores : _stores.take(3).toList();
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          sliver: SliverToBoxAdapter(child: _header(context)),
        ),
        // The store list is the section that can grow long (every nearby
        // supermarket for a signed-in shopper), so it alone builds lazily.
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverList.builder(
            itemCount: visibleStores.length,
            itemBuilder: (context, index) => _StoreCard(
              store: visibleStores[index],
              onViewDeals: widget.onViewStoreDeals == null
                  ? null
                  : () => widget.onViewStoreDeals!(
                      visibleStores[index].retailerId,
                      visibleStores[index].name),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          sliver: SliverToBoxAdapter(
            child: !widget.isAuthenticated &&
                    _stores.length > 3 &&
                    widget.onWantsAuth != null
                ? LoginGateCard(
                    message:
                        'You are seeing 3 of ${_stores.length} nearby stores. '
                        'Log in or sign up free to see them all and save addresses.',
                    onLogin: widget.onWantsAuth!,
                  )
                : const SizedBox.shrink(),
          ),
        ),
      ],
    );
  }

  Widget _header(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('NEAR ME', style: TS.eyebrowOf(context)),
        const SizedBox(height: 4),
        const Text('Stores around you',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        Text(
          'Trolley Scout finds the supermarkets closest to you and pulls this week’s deals and '
          'catalogues for each, reused from other shoppers nearby so it loads fast.',
          style: TextStyle(color: TS.mutedOf(context)),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: TS.yellow,
              foregroundColor: TS.ink,
              shape: const RoundedRectangleBorder(),
            ),
            onPressed: _busy ? null : _findNearby,
            icon: _busy
                ? const AnimatedScoutMark(
                    key: ValueKey('nearby-loading-scout-mark'),
                    motion: ScoutMarkMotion.spin,
                    size: 18,
                  )
                : const Icon(Icons.near_me),
            label: Text(_busy ? 'Searching' : 'Use my location'),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _addressController,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  labelText: 'Or search any address or suburb',
                  prefixIcon: Icon(Icons.search),
                ),
                onSubmitted: (_) => _busy ? null : _findByAddress(),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 56,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: TS.ink,
                  foregroundColor: TS.surface,
                  shape: const RoundedRectangleBorder(),
                ),
                onPressed: _busy ? null : _findByAddress,
                child: const Icon(Icons.arrow_forward),
              ),
            ),
          ],
        ),
        if (_savedAddresses.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text('SAVED ADDRESSES', style: TS.eyebrowOf(context)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final address in _savedAddresses)
                _SavedAddressChip(
                  address: address,
                  onTap: () => _loadNearbyFor(address.lat, address.lon,
                      label: address.label,
                      formatted: address.formattedAddress),
                  onRemove: () => _removeSavedAddress(address),
                ),
            ],
          ),
        ],
        const SizedBox(height: 14),
        if (_restoringHistory)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: AnimatedScoutMark(
                motion: ScoutMarkMotion.spin,
                size: 38,
              ),
            ),
          )
        else if (_stores.isEmpty)
          Container(
            decoration: BoxDecoration(
                border: Border.all(color: TS.lineOf(context), width: 2),
                color: TS.surfaceOf(context)),
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.place_outlined, color: TS.redOf(context)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Semantics(
                        liveRegion: true,
                        child: Text(_message,
                            style: TextStyle(color: TS.mutedOf(context))),
                      ),
                    ),
                  ],
                ),
                if (_searchFailed && _lastSearch != null) ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : () => _lastSearch!(),
                      icon: const Icon(Icons.refresh, size: 18),
                      label: const Text('Retry'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        if (_stores.isEmpty && _locationSettingsTarget != null) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _openLocationSettings,
              icon: const Icon(Icons.settings_outlined),
              label: Text(_locationSettingsTarget == _LocationSettingsTarget.app
                  ? 'Open app settings'
                  : 'Open location settings'),
            ),
          ),
        ],
        if (_history.length > 1) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text('RECENT SEARCHES', style: TS.eyebrowOf(context)),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in _history)
                _HistoryChip(
                  entry: entry,
                  selected: entry.id == _viewingId,
                  onTap: () => _showHistoryEntry(entry),
                  onRemove: () => _removeHistory(entry),
                ),
            ],
          ),
          const SizedBox(height: 14),
        ],
        if (_stores.isNotEmpty && _searchFailed)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(
              decoration: BoxDecoration(
                  border: Border.all(color: TS.lineOf(context), width: 2),
                  color: TS.surfaceOf(context)),
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Icon(Icons.history, size: 18, color: TS.mutedOf(context)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        _message,
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed:
                        _busy || _lastSearch == null ? null : () => _lastSearch!(),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          )
        else if (_stores.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _busy
                        ? 'Showing your saved results while the scout checks again.'
                        : _capturedAt != null
                            ? 'Last checked ${_historyTime(_capturedAt!)}'
                            : '',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (_currentLat != null && _currentLon != null && !_busy)
                  TextButton.icon(
                    onPressed: _saveCurrentAddress,
                    icon: const Icon(Icons.bookmark_add_outlined, size: 18),
                    label: const Text('Save address'),
                  ),
              ],
            ),
          ),
        if (_ads.isNotEmpty && _stores.isNotEmpty)
          SponsoredAdCard(ad: _ads.first),
      ],
    );
  }
}

class _SavedAddressChip extends StatelessWidget {
  const _SavedAddressChip({
    required this.address,
    required this.onTap,
    required this.onRemove,
  });

  final SavedAddress address;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: TS.lineOf(context), width: 2),
          color: TS.surfaceOf(context),
        ),
        padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.bookmark, size: 14, color: TS.redOf(context)),
            const SizedBox(width: 5),
            Text(
              address.label,
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
            ),
            IconButton(
              icon: const Icon(Icons.close, size: 15),
              constraints: const BoxConstraints.tightFor(width: 48, height: 48),
              padding: EdgeInsets.zero,
              color: TS.mutedOf(context),
              tooltip: 'Remove',
              onPressed: onRemove,
            ),
          ],
        ),
      ),
    );
  }
}

class _HistoryChip extends StatelessWidget {
  const _HistoryChip({
    required this.entry,
    required this.selected,
    required this.onTap,
    required this.onRemove,
  });

  final NearbyHistoryEntry entry;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final count = entry.result.stores.length;
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(
            color: selected ? TS.ink : TS.lineOf(context),
            width: 2,
          ),
          color: selected ? TS.yellow : TS.surfaceOf(context),
        ),
        padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.place_outlined,
                size: 14, color: selected ? TS.ink : TS.mutedOf(context)),
            const SizedBox(width: 5),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  entry.locationLabel,
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 13,
                    color: selected ? TS.ink : null,
                  ),
                ),
                Text(
                  '$count stores · ${_historyTime(entry.capturedAt)}',
                  style: TextStyle(
                    fontSize: 11,
                    color: selected ? TS.ink : TS.mutedOf(context),
                  ),
                ),
              ],
            ),
            IconButton(
              icon: const Icon(Icons.close, size: 15),
              constraints: const BoxConstraints.tightFor(width: 48, height: 48),
              padding: EdgeInsets.zero,
              color: selected ? TS.ink : TS.mutedOf(context),
              tooltip: 'Remove',
              onPressed: onRemove,
            ),
          ],
        ),
      ),
    );
  }
}

// One store, one compact card: name, distance, and a deal summary. The
// deals themselves live on the store's own curated page, so the Near me
// list stays scannable no matter how many specials a store has.
class _StoreCard extends StatelessWidget {
  const _StoreCard({required this.store, this.onViewDeals});
  final NearbyStore store;
  final VoidCallback? onViewDeals;

  @override
  Widget build(BuildContext context) {
    final dealCount = store.deals.length;
    final catalogueCount = store.catalogues.length;
    return Semantics(
      button: true,
      label: 'Open ${store.name} deals and catalogues',
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => _NearStoreDetailScreen(
            store: store,
            onViewDeals: onViewDeals,
          ),
        )),
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: TS.card(context),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ImageThumb(
                    imageUrl: store.logoUrl,
                    icon: Icons.storefront_outlined,
                    size: 44,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(store.name,
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w900)),
                  ),
                  if (store.isKnownChain)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      color: TS.greenOf(context),
                      child: Text('KNOWN CHAIN',
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.onTertiary,
                              fontSize: 10,
                              fontWeight: FontWeight.w900)),
                    ),
                ],
              ),
              if (store.address != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(store.address!,
                      style:
                          TextStyle(color: TS.faintOf(context), fontSize: 12)),
                ),
              if (store.distanceM != null)
                Text(_distance(store.distanceM!),
                    style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (!store.hasSomething)
                Text(
                  store.isKnownChain
                      ? 'No current deals loaded for this chain yet.'
                      : 'We’re checking this store’s specials. Come back shortly.',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
                )
              else
                Row(
                  children: [
                    Icon(Icons.local_offer_outlined,
                        size: 15, color: TS.inkOf(context)),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        '$dealCount ${dealCount == 1 ? 'deal' : 'deals'} · '
                        '$catalogueCount ${catalogueCount == 1 ? 'catalogue' : 'catalogues'}',
                        style: const TextStyle(
                            fontSize: 13.5, fontWeight: FontWeight.w800),
                      ),
                    ),
                    Text('VIEW',
                        style: TextStyle(
                            color: TS.redOf(context),
                            fontSize: 11.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.6)),
                    Icon(Icons.chevron_right,
                        size: 18, color: TS.redOf(context)),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _distance(num m) =>
      m < 1000 ? '${m.round()} m' : '${(m / 1000).toStringAsFixed(1)} km';
}

// The curated per-store page: every deal and catalogue this store
// published, in one place.
class _NearStoreDetailScreen extends StatelessWidget {
  const _NearStoreDetailScreen({required this.store, this.onViewDeals});
  final NearbyStore store;
  final VoidCallback? onViewDeals;

  @override
  Widget build(BuildContext context) {
    final catalogues = sortCataloguesMostRecent(store.catalogues);
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('STORE DEALS', style: TS.eyebrowOf(context)),
            Text(store.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (store.address != null)
            Text(store.address!,
                style: TextStyle(color: TS.faintOf(context), fontSize: 13)),
          if (store.distanceM != null)
            Text(
              store.distanceM! < 1000
                  ? '${store.distanceM!.round()} m away'
                  : '${(store.distanceM! / 1000).toStringAsFixed(1)} km away',
              style: TextStyle(
                  color: TS.mutedOf(context),
                  fontSize: 13,
                  fontWeight: FontWeight.w700),
            ),
          if (onViewDeals != null && store.hasSomething) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  onViewDeals!();
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: TS.inkOf(context),
                  side: BorderSide(color: TS.inkOf(context), width: 2),
                  shape: const RoundedRectangleBorder(),
                ),
                icon: const Icon(Icons.local_offer, size: 16),
                label: Text('See ${store.name}’s deals in Find deals'),
              ),
            ),
          ],
          if (store.deals.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Current deals', style: TS.eyebrowOf(context)),
            const SizedBox(height: 6),
            for (final deal in store.deals)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    _ImageThumb(
                      imageUrl: deal.imageUrl,
                      icon: Icons.local_offer_outlined,
                      size: 42,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(deal.title,
                              style: const TextStyle(fontSize: 13.5)),
                          if (deal.savingText != null || deal.validTo != null)
                            Text(
                              [
                                if (deal.savingText != null) deal.savingText!,
                                if (deal.validTo != null)
                                  'Until ${_shortDate(deal.validTo!)}',
                              ].join('  '),
                              style: TextStyle(
                                color: TS.mutedOf(context),
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                        ],
                      ),
                    ),
                    Text(deal.priceText ?? '',
                        style: TextStyle(
                            color: TS.redOf(context),
                            fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
          ],
          if (catalogues.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Catalogues', style: TS.eyebrowOf(context)),
            const SizedBox(height: 6),
            for (final cat in catalogues)
              InkWell(
                onTap: () => showCatalogueReader(context, cat),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      _ImageThumb(
                        imageUrl: cat.imageUrl,
                        icon: Icons.menu_book_outlined,
                        size: 42,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          cat.validTo != null
                              ? '${cat.name} · until ${_shortDate(cat.validTo!)}'
                              : cat.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13),
                        ),
                      ),
                      Icon(Icons.menu_book_outlined,
                          size: 14, color: TS.mutedOf(context)),
                    ],
                  ),
                ),
              ),
          ],
          if (!store.hasSomething)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(
                store.isKnownChain
                    ? 'No current deals loaded for this chain yet. Check back soon.'
                    : 'We’re checking this store’s specials. Come back shortly.',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 13.5),
              ),
            ),
        ],
      ),
    );
  }
}

class _ImageThumb extends StatelessWidget {
  const _ImageThumb({
    required this.imageUrl,
    required this.icon,
    required this.size,
  });

  final String? imageUrl;
  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fallback = ColoredBox(
      color: TS.surfaceOf(context),
      child:
          Center(child: Icon(icon, color: TS.mutedOf(context), size: size / 2)),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: SizedBox(
        width: size,
        height: size,
        child: imageUrl == null
            ? fallback
            : Image.network(
                imageUrl!,
                fit: BoxFit.contain,
                cacheWidth: (size * 3).round(),
                cacheHeight: (size * 3).round(),
                errorBuilder: (_, __, ___) => fallback,
              ),
      ),
    );
  }
}

String _historyTime(DateTime value) {
  final local = value.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day/$month/${local.year} at $hour:$minute';
}

String _shortDate(String value) =>
    value.length <= 10 ? value : value.substring(0, 10);
