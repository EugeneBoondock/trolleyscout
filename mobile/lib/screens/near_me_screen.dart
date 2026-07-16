import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../theme.dart';

class NearMeScreen extends StatefulWidget {
  const NearMeScreen({super.key, required this.api});
  final Api api;

  @override
  State<NearMeScreen> createState() => _NearMeScreenState();
}

class _NearMeScreenState extends State<NearMeScreen> {
  bool _busy = false;
  String _message = 'Find the supermarkets around you and this week’s specials for each.';
  List<NearbyStore> _stores = const [];

  Future<void> _findNearby() async {
    setState(() {
      _busy = true;
      _message = 'Finding your location…';
      _stores = const [];
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
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      setState(() => _message = 'Checking stores near you…');

      final result = await widget.api.nearbyStores(pos.latitude, pos.longitude);
      setState(() {
        _busy = false;
        _stores = result.stores;
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
        const Text('NEAR ME', style: TS.eyebrow),
        const SizedBox(height: 4),
        const Text('Stores around you',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        const Text(
          'Trolley Scout finds the supermarkets closest to you and pulls this week’s deals and '
          'catalogues for each, reused from other shoppers nearby so it loads fast.',
          style: TextStyle(color: TS.muted),
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
                ? const SizedBox(
                    width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: TS.ink))
                : const Icon(Icons.near_me),
            label: Text(_busy ? 'Searching' : 'Use my location'),
          ),
        ),
        const SizedBox(height: 14),
        if (_stores.isEmpty)
          Container(
            decoration: BoxDecoration(border: Border.all(color: TS.line, width: 2), color: TS.surface),
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                const Icon(Icons.place_outlined, color: TS.red),
                const SizedBox(width: 10),
                Expanded(child: Text(_message, style: const TextStyle(color: TS.muted))),
              ],
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
      decoration: TS.card(),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(store.name,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
              ),
              if (store.isKnownChain)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  color: TS.green,
                  child: const Text('KNOWN CHAIN',
                      style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                ),
            ],
          ),
          if (store.address != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(store.address!, style: const TextStyle(color: TS.faint, fontSize: 12)),
            ),
          if (store.distanceM != null)
            Text(_distance(store.distanceM!),
                style: const TextStyle(color: TS.muted, fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (!store.hasSomething)
            Text(
              store.isKnownChain
                  ? 'No current deals loaded for this chain yet.'
                  : 'We’re checking this store’s specials. Come back shortly.',
              style: const TextStyle(color: TS.muted, fontSize: 13),
            ),
          for (final deal in store.deals.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Row(
                children: [
                  Expanded(child: Text(deal.title, style: const TextStyle(fontSize: 13))),
                  Text(deal.priceText ?? '',
                      style: const TextStyle(color: TS.red, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          for (final cat in store.catalogues.take(3))
            InkWell(
              onTap: () => launchUrl(Uri.parse(cat.url), mode: LaunchMode.externalApplication),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    const Icon(Icons.local_offer, size: 14, color: TS.red),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        cat.validTo != null ? '${cat.name} · until ${cat.validTo!.substring(0, 10)}' : cat.name,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                    ),
                    const Icon(Icons.open_in_new, size: 12, color: TS.muted),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _distance(num m) => m < 1000 ? '${m.round()} m' : '${(m / 1000).toStringAsFixed(1)} km';
}
