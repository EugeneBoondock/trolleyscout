import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../api.dart';
import '../theme.dart';

String routeInstruction(MapRouteStep step) {
  final type = step.type.toLowerCase();
  final modifier = step.modifier.toLowerCase().replaceAll('_', ' ');
  final road = step.name.trim();
  final onto = road.isEmpty ? '' : ' onto $road';

  if (type == 'arrive') {
    return modifier == 'left' || modifier == 'right'
        ? 'Your destination is on the $modifier'
        : 'You have arrived';
  }
  if (type == 'depart') {
    return road.isEmpty
        ? 'Start your trip'
        : 'Head ${modifier.isEmpty ? 'ahead' : modifier} on $road';
  }
  if (type.contains('roundabout') || type == 'rotary') {
    return road.isEmpty
        ? 'Enter the roundabout'
        : 'Take the roundabout onto $road';
  }
  if (type == 'merge') {
    return 'Merge ${modifier.isEmpty ? 'ahead' : modifier}$onto';
  }
  if (type == 'fork') {
    return 'Keep ${modifier.isEmpty ? 'ahead' : modifier}$onto';
  }
  if (type.contains('ramp')) {
    return 'Take the ${modifier.isEmpty ? 'next' : modifier} ramp$onto';
  }
  if (type == 'continue' || type == 'new name') {
    return 'Continue ${modifier.isEmpty ? 'straight' : modifier}$onto';
  }
  return 'Turn ${modifier.isEmpty ? 'ahead' : modifier}$onto';
}

String routeDistanceLabel(double meters) {
  if (meters < 1000) return '${(meters / 10).round().clamp(0, 100) * 10} m';
  return '${(meters / 1000).toStringAsFixed(1)} km';
}

String storeMapTileTemplate(Brightness brightness) => brightness ==
        Brightness.dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

/// Trolley Scout's in-app store map and live route guide. CARTO supplies the
/// basemap and the app's own API supplies OSRM route geometry and turn steps.
class StoreMapView extends StatefulWidget {
  const StoreMapView({
    super.key,
    required this.api,
    required this.storeName,
    required this.lat,
    required this.lon,
    this.storeAddress,
    this.isAdmin = false,
  });

  final Api api;
  final String storeName;
  final double lat;
  final double lon;
  final String? storeAddress;
  final bool isAdmin;

  static Future<void> open(
    BuildContext context, {
    required Api api,
    required String storeName,
    required double lat,
    required double lon,
    String? storeAddress,
    bool isAdmin = false,
  }) {
    return Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => StoreMapView(
        api: api,
        storeName: storeName,
        lat: lat,
        lon: lon,
        storeAddress: storeAddress,
        isAdmin: isAdmin,
      ),
    ));
  }

  @override
  State<StoreMapView> createState() => _StoreMapViewState();
}

class _StoreMapViewState extends State<StoreMapView> {
  final _mapController = MapController();
  final _voicePlayer = AudioPlayer(playerId: 'trolley_scout_navigation');
  StreamSubscription<Position>? _positionSubscription;
  Timer? _simulationTimer;
  LatLng? _user;
  List<LatLng> _route = const [];
  List<MapRouteStep> _steps = const [];
  int _activeStepIndex = 0;
  String _status = 'idle';
  String _distanceText = '';
  String _nextDistanceText = '';
  bool _navigating = false;
  bool _arrived = false;
  bool _voiceEnabled = true;
  bool _voiceUnavailable = false;
  bool _simulating = false;
  int _simulationIndex = 0;
  String? _lastSpokenInstruction;

  LatLng get _store => LatLng(widget.lat, widget.lon);

  Future<bool> _directions() async {
    setState(() {
      _status = 'locating';
      _arrived = false;
    });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted) setState(() => _status = 'denied');
        return false;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high),
      );
      final here = LatLng(pos.latitude, pos.longitude);
      if (!mounted) return false;
      setState(() {
        _user = here;
        _status = 'routing';
      });

      final route = await widget.api
          .mapRoute(here.latitude, here.longitude, widget.lat, widget.lon);
      if (!mounted) return false;

      setState(() {
        _route = route != null && route.path.isNotEmpty
            ? route.path.map((point) => LatLng(point[0], point[1])).toList()
            : [here, _store];
        _steps = route?.steps ?? const [];
        _activeStepIndex = 0;
        final distanceMeters = route?.distanceMeters ??
            Geolocator.distanceBetween(
              here.latitude,
              here.longitude,
              widget.lat,
              widget.lon,
            );
        final durationSeconds = route?.durationSeconds ?? 0;
        final minutes = (durationSeconds / 60).round();
        _distanceText = minutes > 0
            ? '${routeDistanceLabel(distanceMeters)} · about $minutes min by car'
            : routeDistanceLabel(distanceMeters);
        _status = 'ready';
      });
      _fitBounds(here);
      return true;
    } catch (_) {
      if (mounted) setState(() => _status = 'error');
      return false;
    }
  }

  Future<void> _startNavigation() async {
    if (_status != 'ready' || _user == null) {
      final ready = await _directions();
      if (!ready || !mounted) return;
    }
    await _positionSubscription?.cancel();
    setState(() {
      _navigating = true;
      _arrived = false;
    });
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 10,
      ),
    ).listen(_onPosition, onError: (_) {
      if (mounted) setState(() => _status = 'error');
    });
    if (_user != null) {
      _updateGuidance(_user!);
      _announceInstruction();
    }
  }

  Future<void> _announceInstruction({bool replay = false}) async {
    if (!_voiceEnabled) return;
    final instruction = _instruction;
    if (!replay && instruction == _lastSpokenInstruction) return;
    _lastSpokenInstruction = instruction;
    try {
      final reply = await widget.api.navigationVoice(instruction);
      if (reply.audioBytes.isEmpty) return;
      await _voicePlayer.stop();
      await _voicePlayer.play(
        BytesSource(Uint8List.fromList(reply.audioBytes)),
      );
      if (mounted && _voiceUnavailable) {
        setState(() => _voiceUnavailable = false);
      }
    } catch (_) {
      if (mounted) setState(() => _voiceUnavailable = true);
    }
  }

  void _onPosition(Position position) {
    if (!mounted) return;
    _updateGuidance(LatLng(position.latitude, position.longitude));
  }

  void _updateGuidance(LatLng here) {
    final distanceToStore = Geolocator.distanceBetween(
      here.latitude,
      here.longitude,
      widget.lat,
      widget.lon,
    );
    if (distanceToStore <= 35) {
      setState(() {
        _user = here;
        _arrived = true;
        _navigating = false;
        _nextDistanceText = 'You have arrived';
        _simulating = false;
      });
      _positionSubscription?.cancel();
      _simulationTimer?.cancel();
      _announceInstruction();
      return;
    }

    final previousStepIndex = _activeStepIndex;
    var nextIndex = _activeStepIndex;
    while (nextIndex < _steps.length - 1) {
      final location = _steps[nextIndex].location;
      if (location.length < 2) break;
      final distance = Geolocator.distanceBetween(
        here.latitude,
        here.longitude,
        location[0],
        location[1],
      );
      if (distance > 35) break;
      nextIndex += 1;
    }

    final nextLocation =
        nextIndex < _steps.length && _steps[nextIndex].location.length >= 2
            ? _steps[nextIndex].location
            : [widget.lat, widget.lon];
    final nextDistance = Geolocator.distanceBetween(
      here.latitude,
      here.longitude,
      nextLocation[0],
      nextLocation[1],
    );
    setState(() {
      _user = here;
      _activeStepIndex = nextIndex;
      _nextDistanceText = routeDistanceLabel(nextDistance);
    });
    try {
      _mapController.move(here, 16);
    } catch (_) {
      // The first live location may arrive before the map's first frame.
    }
    if (nextIndex != previousStepIndex) _announceInstruction();
  }

  Future<void> _startSimulation() async {
    if (!widget.isAdmin) return;
    await _positionSubscription?.cancel();
    _simulationTimer?.cancel();
    if (_route.length < 2) {
      setState(() => _status = 'routing');
      final start = LatLng(widget.lat - 0.012, widget.lon - 0.012);
      final route = await widget.api.mapRoute(
        start.latitude,
        start.longitude,
        widget.lat,
        widget.lon,
      );
      if (!mounted) return;
      setState(() {
        _route = route != null && route.path.length > 1
            ? route.path.map((point) => LatLng(point[0], point[1])).toList()
            : List.generate(
                25,
                (index) => LatLng(
                  start.latitude + (widget.lat - start.latitude) * index / 24,
                  start.longitude + (widget.lon - start.longitude) * index / 24,
                ),
              );
        _steps = route?.steps ?? [
          MapRouteStep(
            type: 'depart',
            modifier: 'straight',
            name: '',
            distanceMeters: 0,
            durationSeconds: 0,
            location: [start.latitude, start.longitude],
          ),
          MapRouteStep(
            type: 'arrive',
            modifier: '',
            name: '',
            distanceMeters: 0,
            durationSeconds: 0,
            location: [widget.lat, widget.lon],
          ),
        ];
        _user = _route.first;
        _activeStepIndex = 0;
        _status = 'ready';
      });
      _fitBounds(_route.first);
    }

    setState(() {
      _simulating = true;
      _navigating = true;
      _arrived = false;
      _simulationIndex = 0;
      _lastSpokenInstruction = null;
    });
    _announceInstruction();
    _simulationTimer = Timer.periodic(
      const Duration(milliseconds: 700),
      (_) {
        if (!mounted || !_simulating || _route.isEmpty) return;
        final stride = (_route.length / 45).ceil().clamp(1, 50);
        _simulationIndex = (_simulationIndex + stride)
            .clamp(0, _route.length - 1);
        _updateGuidance(_route[_simulationIndex]);
        if (_simulationIndex >= _route.length - 1) {
          _updateGuidance(_store);
        }
      },
    );
  }

  void _stopSimulation() {
    _simulationTimer?.cancel();
    setState(() {
      _simulating = false;
      _navigating = false;
    });
    if (_user != null) _fitBounds(_user!);
  }

  void _stopNavigation() {
    _positionSubscription?.cancel();
    _simulationTimer?.cancel();
    setState(() {
      _navigating = false;
      _simulating = false;
    });
    if (_user != null) _fitBounds(_user!);
  }

  void _fitBounds(LatLng user) {
    final bounds = LatLngBounds.fromPoints([user, _store]);
    _mapController.fitCamera(
      CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48)),
    );
  }

  String get _instruction {
    if (_arrived) return 'You have arrived at ${widget.storeName}';
    if (_steps.isEmpty || _activeStepIndex >= _steps.length) {
      return 'Continue to ${widget.storeName}';
    }
    return routeInstruction(_steps[_activeStepIndex]);
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    _simulationTimer?.cancel();
    _voicePlayer.dispose();
    super.dispose();
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
                  padding:
                      const EdgeInsets.only(bottom: 6, left: 16, right: 16),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      widget.storeAddress!,
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                      ),
                    ),
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
                  urlTemplate:
                      storeMapTileTemplate(Theme.of(context).brightness),
                  subdomains: const ['a', 'b', 'c', 'd'],
                  userAgentPackageName: 'co.za.trolleyscout',
                  tileProvider: NetworkTileProvider(),
                ),
                if (_route.length > 1)
                  PolylineLayer(polylines: [
                    Polyline(
                      points: _route,
                      color: TS.redOf(context),
                      strokeWidth: 5,
                    ),
                  ]),
                MarkerLayer(markers: [
                  _pin(_store, TS.redOf(context), Icons.storefront),
                  if (_user != null)
                    _pin(_user!, TS.greenOf(context), Icons.navigation),
                ]),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: TS.surfaceOf(context),
              border: Border(
                top: BorderSide(color: TS.lineOf(context), width: 2),
              ),
            ),
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_navigating || _arrived) ...[
                  Text('TROLLEY SCOUT NAVIGATION',
                      style: TS.eyebrowOf(context)),
                  const SizedBox(height: 4),
                  Text(
                    _instruction,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      height: 1.15,
                    ),
                  ),
                  if (_nextDistanceText.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      _nextDistanceText,
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      FilterChip(
                        selected: _voiceEnabled,
                        avatar: Icon(
                          _voiceEnabled
                              ? Icons.volume_up_outlined
                              : Icons.volume_off_outlined,
                          size: 18,
                        ),
                        label: const Text('Fish Audio directions'),
                        onSelected: (value) {
                          setState(() {
                            _voiceEnabled = value;
                            _lastSpokenInstruction = null;
                          });
                          if (value) _announceInstruction();
                        },
                      ),
                      if (_voiceEnabled)
                        IconButton(
                          tooltip: 'Repeat direction',
                          onPressed: () => _announceInstruction(replay: true),
                          icon: const Icon(Icons.replay_outlined),
                        ),
                    ],
                  ),
                  if (_voiceUnavailable)
                    Text(
                      'Spoken directions are unavailable. Visual navigation will continue.',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                      ),
                    ),
                ] else if (_status == 'ready' && _distanceText.isNotEmpty)
                  Text(
                    _distanceText,
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontWeight: FontWeight.w700,
                    ),
                  )
                else if (_status == 'denied')
                  Text(
                    'Allow location to draw and follow your route.',
                    style: TextStyle(color: TS.mutedOf(context)),
                  )
                else if (_status == 'error')
                  Text(
                    'Could not get your route. Check location and try again.',
                    style: TextStyle(color: TS.mutedOf(context)),
                  ),
                const SizedBox(height: 10),
                if (widget.isAdmin && !_navigating) ...[
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      key: const Key('navigation-simulation-mode'),
                      onPressed: _status == 'routing' ? null : _startSimulation,
                      icon: const Icon(Icons.science_outlined, size: 18),
                      label: const Text('Admin simulation mode'),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                if (_navigating)
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed:
                          _simulating ? _stopSimulation : _stopNavigation,
                      icon: const Icon(Icons.stop_circle_outlined, size: 18),
                      label: Text(
                        _simulating ? 'Stop simulation' : 'End navigation',
                      ),
                    ),
                  )
                else
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed:
                              _status == 'locating' || _status == 'routing'
                                  ? null
                                  : _directions,
                          icon: const Icon(Icons.route, size: 18),
                          label: Text(
                            _status == 'locating'
                                ? 'Finding you'
                                : _status == 'routing'
                                    ? 'Routing'
                                    : _status == 'ready'
                                        ? 'Refresh route'
                                        : 'Preview route',
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed:
                              _status == 'locating' || _status == 'routing'
                                  ? null
                                  : _startNavigation,
                          icon: const Icon(Icons.navigation, size: 18),
                          label: const Text('Navigate'),
                        ),
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
