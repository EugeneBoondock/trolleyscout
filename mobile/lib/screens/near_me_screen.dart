import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../api.dart';
import '../nearby_history_store.dart';
import '../saved_addresses_store.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/login_gate_card.dart';
import '../widgets/scout_mark.dart';
import '../widgets/sponsored_ad_card.dart';

class NearMeScreen extends StatefulWidget {
  const NearMeScreen({
    super.key,
    required this.api,
    this.historyStore,
    this.addressStore,
    this.onViewStoreDeals,
    this.isAuthenticated = false,
    this.onWantsAuth,
  });
  final Api api;
  final NearbyHistoryStore? historyStore;
  final SavedAddressesStore? addressStore;
  // Called when a shopper taps a store card to see its deals in Find deals.
  final void Function(String? retailerId, String storeName)? onViewStoreDeals;
  final bool isAuthenticated;
  final VoidCallback? onWantsAuth;

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
  }

  Future<void> _findNearby() async {
    setState(() {
      _busy = true;
      _message = 'Finding your location…';
    });

    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(() {
          _busy = false;
          _message = 'Allow location to see the stores near you.';
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      await _loadNearbyFor(pos.latitude, pos.longitude);
    } catch (e) {
      setState(() {
        _busy = false;
        _message = 'Could not read your location. Try again.';
      });
    }
  }

  // Geocodes a typed address, then searches around it. Keeps its own error copy
  // so a geocode miss never reads as a location-permission problem.
  Future<void> _findByAddress() async {
    final query = _addressController.text.trim();
    if (query.length < 3) return;
    FocusScope.of(context).unfocus();
    uxTap();
    setState(() {
      _busy = true;
      _message = 'Looking up “$query”…';
    });

    GeoPoint point;
    try {
      point = await widget.api.geocodeAddress(query);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _message = error.message;
      });
      return;
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
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
    setState(() {
      _busy = true;
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
      setState(() {
        _busy = false;
        _message = 'Could not check that location. Try again.';
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
    return ListView(
      padding: const EdgeInsets.all(16),
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
            child: Row(
              children: [
                Icon(Icons.place_outlined, color: TS.redOf(context)),
                const SizedBox(width: 10),
                Expanded(
                    child: Text(_message,
                        style: TextStyle(color: TS.mutedOf(context)))),
              ],
            ),
          ),
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
        if (_stores.isNotEmpty)
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
        if (_ads.isNotEmpty && _stores.isNotEmpty) SponsoredAdCard(ad: _ads.first),
        for (final store
            in widget.isAuthenticated ? _stores : _stores.take(3))
          _StoreCard(
            store: store,
            onViewDeals: widget.onViewStoreDeals == null
                ? null
                : () => widget.onViewStoreDeals!(store.retailerId, store.name),
          ),
        if (!widget.isAuthenticated &&
            _stores.length > 3 &&
            widget.onWantsAuth != null)
          LoginGateCard(
            message: 'You are seeing 3 of ${_stores.length} nearby stores. '
                'Log in or sign up free to see them all and save addresses.',
            onLogin: widget.onWantsAuth!,
          ),
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
              visualDensity: VisualDensity.compact,
              constraints: const BoxConstraints(),
              padding: const EdgeInsets.only(left: 6),
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
              visualDensity: VisualDensity.compact,
              constraints: const BoxConstraints(),
              padding: const EdgeInsets.only(left: 6),
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

class _StoreCard extends StatelessWidget {
  const _StoreCard({required this.store, this.onViewDeals});
  final NearbyStore store;
  final VoidCallback? onViewDeals;

  @override
  Widget build(BuildContext context) {
    return Container(
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
                  style: TextStyle(color: TS.faintOf(context), fontSize: 12)),
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
            ),
          for (final deal in store.deals.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Row(
                children: [
                  _ImageThumb(
                    imageUrl: deal.imageUrl,
                    icon: Icons.local_offer_outlined,
                    size: 42,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                      child: Text(deal.title,
                          style: const TextStyle(fontSize: 13))),
                  Text(deal.priceText ?? '',
                      style: TextStyle(
                          color: TS.redOf(context),
                          fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          for (final cat in store.catalogues.take(3))
            InkWell(
              onTap: () => showCatalogueReader(context, cat),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    _ImageThumb(
                      imageUrl: cat.imageUrl,
                      icon: Icons.menu_book_outlined,
                      size: 42,
                    ),
                    const SizedBox(width: 6),
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
                        size: 12, color: TS.mutedOf(context)),
                  ],
                ),
              ),
            ),
          if (onViewDeals != null && store.hasSomething) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onViewDeals,
                style: OutlinedButton.styleFrom(
                  foregroundColor: TS.ink,
                  side: const BorderSide(color: TS.ink, width: 2),
                  shape: const RoundedRectangleBorder(),
                ),
                icon: const Icon(Icons.local_offer, size: 16),
                label: Text('See ${store.name}’s deals in Find deals'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _distance(num m) =>
      m < 1000 ? '${m.round()} m' : '${(m / 1000).toStringAsFixed(1)} km';
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
