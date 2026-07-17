import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';

/// In-app store map with keyless CARTO tiles and OSRM driving directions
/// (proxied via /api/map-route). Mirrors the web StoreMap component.
class StoreMapView extends StatefulWidget {
  const StoreMapView({
    super.key,
    required this.api,
    required this.storeName,
    required this.lat,
    required this.lon,
    this.storeAddress,
  });

  final Api api;
  final String storeName;
  final double lat;
  final double lon;
  final String? storeAddress;

  static Future<void> open(
    BuildContext context, {
    required Api api,
    required String storeName,
    required double lat,
    required double lon,
    String? storeAddress,
  }) {
    return Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => StoreMapView(
        api: api,
        storeName: storeName,
        lat: lat,
        lon: lon,
        storeAddress: storeAddress,
      ),
    ));
  }

  @override
  State<StoreMapView> createState() => _StoreMapViewState();
}

class _StoreMapViewState extends State<StoreMapView> {
  final _mapController = MapController();
  LatLng? _user;
  List<LatLng> _route = const [];
  String _status = 'idle';
  String _distanceText = '';

  static const _cartoTiles =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

  LatLng get _store => LatLng(widget.lat, widget.lon);

  Future<void> _directions() async {
    setState(() => _status = 'locating');
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(() => _status = 'denied');
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      final here = LatLng(pos.latitude, pos.longitude);
      setState(() {
        _user = here;
        _status = 'routing';
      });

      final route = await widget.api
          .mapRoute(here.latitude, here.longitude, widget.lat, widget.lon);

      setState(() {
        if (route != null && route.path.isNotEmpty) {
          _route = route.path.map((p) => LatLng(p[0], p[1])).toList();
          final km = (route.distanceMeters / 1000).toStringAsFixed(1);
          final mins = (route.durationSeconds / 60).round();
          _distanceText = '$km km · about $mins min by car';
        } else {
          // Straight-line fallback when routing is unavailable.
          _route = [here, _store];
        }
        _status = 'ready';
      });

      _fitBounds(here);
    } catch (_) {
      setState(() => _status = 'error');
    }
  }

  void _fitBounds(LatLng user) {
    final bounds = LatLngBounds.fromPoints([user, _store]);
    _mapController.fitCamera(
      CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48)),
    );
  }

  Future<void> _openExternal() async {
    await launchUrl(
      Uri.parse(
          'https://www.openstreetmap.org/directions?to=${widget.lat},${widget.lon}'),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.storeName, overflow: TextOverflow.ellipsis),
        bottom: widget.storeAddress == null
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(20),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 6, left: 16, right: 16),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(widget.storeAddress!,
                        style: TextStyle(
                            color: TS.mutedOf(context), fontSize: 12)),
                  ),
                ),
              ),
      ),
      body: Column(
        children: [
          Expanded(
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(initialCenter: _store, initialZoom: 15),
              children: [
                TileLayer(
                  urlTemplate: _cartoTiles,
                  subdomains: const ['a', 'b', 'c', 'd'],
                  userAgentPackageName: 'co.za.trolleyscout',
                  tileProvider: NetworkTileProvider(),
                ),
                if (_route.length > 1)
                  PolylineLayer(polylines: [
                    Polyline(
                        points: _route, color: TS.redOf(context), strokeWidth: 5),
                  ]),
                MarkerLayer(markers: [
                  _pin(_store, TS.redOf(context), Icons.storefront),
                  if (_user != null)
                    _pin(_user!, TS.greenOf(context), Icons.person_pin_circle),
                ]),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: TS.lineOf(context), width: 2)),
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_status == 'ready' && _distanceText.isNotEmpty)
                  Text(_distanceText,
                      style: TextStyle(
                          color: TS.mutedOf(context),
                          fontWeight: FontWeight.w700))
                else if (_status == 'denied')
                  Text('Allow location to draw the route.',
                      style: TextStyle(color: TS.mutedOf(context)))
                else if (_status == 'error')
                  Text('Could not get directions. Try Open in Maps.',
                      style: TextStyle(color: TS.mutedOf(context))),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                            backgroundColor: TS.yellow,
                            foregroundColor: TS.ink),
                        onPressed: _status == 'locating' || _status == 'routing'
                            ? null
                            : _directions,
                        icon: const Icon(Icons.near_me),
                        label: Text(
                          _status == 'locating'
                              ? 'Finding you'
                              : _status == 'routing'
                                  ? 'Routing'
                                  : 'Directions from me',
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    OutlinedButton.icon(
                      onPressed: _openExternal,
                      icon: const Icon(Icons.open_in_new, size: 18),
                      label: const Text('Maps'),
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

  Marker _pin(LatLng point, Color color, IconData icon) {
    return Marker(
      point: point,
      width: 40,
      height: 40,
      alignment: Alignment.topCenter,
      child: Icon(icon, color: color, size: 34),
    );
  }
}
