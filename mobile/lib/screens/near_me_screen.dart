import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../api.dart';
import '../nearby_history_store.dart';
import '../theme.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/scout_mark.dart';

class NearMeScreen extends StatefulWidget {
  const NearMeScreen({super.key, required this.api, this.historyStore});
  final Api api;
  final NearbyHistoryStore? historyStore;

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

  @override
  void initState() {
    super.initState();
    _restoreHistory();
  }

  Future<void> _restoreHistory() async {
    final history = await _historyStore.load();
    if (!mounted) return;
    setState(() {
      _restoringHistory = false;
      if (history != null) {
        _stores = history.result.stores;
        _capturedAt = history.capturedAt;
        _message = '${_stores.length} stores from your last search.';
      }
    });
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
      if (result.stores.isNotEmpty) {
        await _historyStore.save(result, capturedAt);
      }
      if (!mounted) return;
      setState(() {
        _busy = false;
        _stores = result.stores;
        _capturedAt = result.stores.isEmpty ? _capturedAt : capturedAt;
        _message = result.stores.isEmpty
            ? 'No supermarkets found within a few kilometres.'
            : '${result.stores.length} stores near you.';
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
        for (final store in _stores) _StoreCard(store: store),
      ],
    );
  }
}

class _StoreCard extends StatelessWidget {
  const _StoreCard({required this.store});
  final NearbyStore store;

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
