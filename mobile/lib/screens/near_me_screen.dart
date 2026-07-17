import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../api.dart';
import '../nearby_history_store.dart';
import '../theme.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/scout_mark.dart';

class NearMeScreen extends StatefulWidget {
  const NearMeScreen({
    super.key,
    required this.api,
    this.historyStore,
    this.onViewStoreDeals,
  });
  final Api api;
  final NearbyHistoryStore? historyStore;
  // Called when a shopper taps a store card to see its deals in Find deals.
  final void Function(String? retailerId, String storeName)? onViewStoreDeals;

  @override
  State<NearMeScreen> createState() => _NearMeScreenState();
}

class _NearMeScreenState extends State<NearMeScreen> {
  late final NearbyHistoryStore _historyStore =
      widget.historyStore ?? NearbyHistoryStore();
  bool _busy = false;
  bool _restoringHistory = true;
  String _message =
      'Find the supermarkets around you and this week’s specials for each.';
  List<NearbyStore> _stores = const [];
  DateTime? _capturedAt;
  List<NearbyHistoryEntry> _history = const [];
  String? _viewingId;

  @override
  void initState() {
    super.initState();
    _restoreHistory();
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
      setState(() => _message = 'Checking stores near you…');

      final result = await widget.api.nearbyStores(pos.latitude, pos.longitude);
      final capturedAt = DateTime.now();
      var entries = _history;
      if (result.stores.isNotEmpty) {
        entries = await _historyStore.save(result, capturedAt,
            lat: pos.latitude, lon: pos.longitude);
      }
      if (!mounted) return;
      setState(() {
        _busy = false;
        _history = entries;
        _stores = result.stores;
        _capturedAt = result.stores.isEmpty ? _capturedAt : capturedAt;
        _viewingId = entries.isEmpty ? _viewingId : entries.first.id;
        _message = result.stores.isEmpty
            ? 'No supermarkets found within a few kilometres.'
            : '${result.stores.length} stores near ${entries.isNotEmpty ? entries.first.locationLabel : 'you'}.';
      });
    } catch (e) {
      setState(() {
        _busy = false;
        _message = 'Could not read your location. Try again.';
      });
    }
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
        if (_capturedAt != null && _stores.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              _busy
                  ? 'Showing your saved results while the scout checks again.'
                  : 'Last checked ${_historyTime(_capturedAt!)}',
              style: TextStyle(
                color: TS.mutedOf(context),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        for (final store in _stores)
          _StoreCard(
            store: store,
            onViewDeals: widget.onViewStoreDeals == null
                ? null
                : () => widget.onViewStoreDeals!(store.retailerId, store.name),
          ),
      ],
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
