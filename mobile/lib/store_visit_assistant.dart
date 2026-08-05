import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'taste_profile.dart';

enum StoreVisitEnableResult {
  enabled,
  locationOff,
  permissionDenied,

  /// Location granted, but only approximately. Approximate location cannot
  /// tell a store from the street outside it, so the assistant stays off
  /// rather than guessing.
  preciseDenied,
}

enum StorePresenceEventType { entered, exited }

class ShopperLocation {
  const ShopperLocation(
    this.lat,
    this.lon, {
    this.accuracyM = 0,
    this.capturedAt,
    this.isMocked = false,
  });

  final double lat;
  final double lon;
  final double accuracyM;
  final DateTime? capturedAt;
  final bool isMocked;
}

class StoreVisitRecord {
  const StoreVisitRecord({
    required this.id,
    required this.placeId,
    required this.storeName,
    required this.arrivedAt,
    this.address,
    this.retailerId,
    this.leftAt,
  });

  factory StoreVisitRecord.fromJson(Map<String, dynamic> json) {
    final arrivedAt = DateTime.tryParse(json['arrivedAt']?.toString() ?? '');
    if (arrivedAt == null) {
      throw const FormatException('Invalid store visit.');
    }
    return StoreVisitRecord(
      id: json['id']?.toString() ?? '',
      placeId: json['placeId']?.toString() ?? '',
      storeName: json['storeName']?.toString() ?? '',
      arrivedAt: arrivedAt,
      address: _optionalText(json['address']),
      retailerId: _optionalText(json['retailerId']),
      leftAt: DateTime.tryParse(json['leftAt']?.toString() ?? ''),
    );
  }

  final String id;
  final String placeId;
  final String storeName;
  final DateTime arrivedAt;
  final String? address;
  final String? retailerId;
  final DateTime? leftAt;

  bool get isActive => leftAt == null;

  StoreVisitRecord finish(DateTime time) => StoreVisitRecord(
        id: id,
        placeId: placeId,
        storeName: storeName,
        arrivedAt: arrivedAt,
        address: address,
        retailerId: retailerId,
        leftAt: time,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'placeId': placeId,
        'storeName': storeName,
        'arrivedAt': arrivedAt.toUtc().toIso8601String(),
        if (address != null) 'address': address,
        if (retailerId != null) 'retailerId': retailerId,
        if (leftAt != null) 'leftAt': leftAt!.toUtc().toIso8601String(),
      };
}

class FrequentStoreVisit {
  const FrequentStoreVisit({
    required this.placeId,
    required this.storeName,
    required this.visitCount,
    required this.lastVisitedAt,
  });

  final String placeId;
  final String storeName;
  final int visitCount;
  final DateTime lastVisitedAt;
}

class StoreVisitPreferences extends ChangeNotifier {
  StoreVisitPreferences({TasteStore? tasteStore})
      : _tasteStore = tasteStore ?? TasteStore();

  static final instance = StoreVisitPreferences();
  static const _enabledKey = 'store_visit_assistant_enabled_v1';
  static const _historyKey = 'store_visit_history_v1';
  static const _promptKey = 'store_visit_prompt_times_v1';
  static const _maxVisits = 120;

  final TasteStore _tasteStore;
  bool _loaded = false;
  bool _enabled = false;
  List<StoreVisitRecord> _visits = const [];
  Map<String, DateTime> _promptTimes = const {};

  bool get loaded => _loaded;
  bool get enabled => _enabled;
  List<StoreVisitRecord> get visits => List.unmodifiable(_visits);
  StoreVisitRecord? get activeVisit {
    for (final visit in _visits) {
      if (visit.isActive) return visit;
    }
    return null;
  }

  List<FrequentStoreVisit> get frequentStores {
    final grouped = <String, List<StoreVisitRecord>>{};
    for (final visit in _visits) {
      grouped.putIfAbsent(visit.placeId, () => []).add(visit);
    }
    final result = grouped.entries.map((entry) {
      final latest = entry.value.reduce(
        (left, right) => left.arrivedAt.isAfter(right.arrivedAt) ? left : right,
      );
      return FrequentStoreVisit(
        placeId: entry.key,
        storeName: latest.storeName,
        visitCount: entry.value.length,
        lastVisitedAt: latest.arrivedAt,
      );
    }).toList()
      ..sort((left, right) {
        final count = right.visitCount.compareTo(left.visitCount);
        return count != 0
            ? count
            : right.lastVisitedAt.compareTo(left.lastVisitedAt);
      });
    return List.unmodifiable(result);
  }

  Future<void> load() async {
    if (_loaded) return;
    try {
      final preferences = await SharedPreferences.getInstance();
      _enabled = preferences.getBool(_enabledKey) == true;
      _visits = _decodeVisits(preferences.getString(_historyKey));
      _promptTimes = _decodePromptTimes(preferences.getString(_promptKey));
    } catch (_) {
      _enabled = false;
      _visits = const [];
      _promptTimes = const {};
    }
    _loaded = true;
    notifyListeners();
  }

  Future<StoreVisitEnableResult> requestEnable() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return StoreVisitEnableResult.locationOff;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      await setEnabled(false);
      return StoreVisitEnableResult.permissionDenied;
    }
    // "While using" granted is not enough: Android lets the shopper choose
    // approximate location, which is street-level at best. In-store detection
    // without precise location produces exactly the false "you're at a store"
    // pop-ups this gate exists to prevent.
    final accuracy = await readDeviceLocationAccuracy();
    if (accuracy == LocationAccuracyStatus.reduced) {
      await setEnabled(false);
      return StoreVisitEnableResult.preciseDenied;
    }
    await setEnabled(true);
    return StoreVisitEnableResult.enabled;
  }


  Future<void> setEnabled(bool value) async {
    await load();
    _enabled = value;
    notifyListeners();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_enabledKey, value);
    } catch (_) {
      // The current app session can still respect the shopper’s choice.
    }
  }

  bool canPrompt(String placeId, DateTime now) {
    final last = _promptTimes[placeId];
    return last == null || now.difference(last) >= const Duration(hours: 6);
  }

  Future<StoreVisitRecord> recordArrival(
      NearbyStore store, DateTime now) async {
    await load();
    final record = StoreVisitRecord(
      id: 'visit-${now.microsecondsSinceEpoch}',
      placeId: store.placeId,
      storeName: store.name,
      arrivedAt: now,
      address: store.address,
      retailerId: store.retailerId,
    );
    _visits = [record, ..._visits].take(_maxVisits).toList(growable: false);
    _promptTimes = {..._promptTimes, store.placeId: now};
    await _persist();
    notifyListeners();
    await _tasteStore.recordSignal(
      title: store.name,
      category: 'store visit',
      weight: 0.8,
    );
    return record;
  }

  Future<StoreVisitRecord?> recordDeparture(DateTime now) async {
    await load();
    final active = activeVisit;
    if (active == null) return null;
    final finished = active.finish(now);
    _visits = [
      for (final visit in _visits)
        if (visit.id == active.id) finished else visit,
    ];
    await _persist();
    notifyListeners();
    return finished;
  }

  Future<void> clearHistory() async {
    _visits = const [];
    _promptTimes = const {};
    await _persist();
    notifyListeners();
  }

  Future<void> _persist() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _historyKey,
        jsonEncode(_visits.map((visit) => visit.toJson()).toList()),
      );
      await preferences.setString(
        _promptKey,
        jsonEncode(_promptTimes.map(
          (placeId, time) => MapEntry(placeId, time.toUtc().toIso8601String()),
        )),
      );
    } catch (_) {
      // Future checks can rebuild visit patterns if local storage is full.
    }
  }
}

class StorePresenceEvent {
  const StorePresenceEvent({
    required this.type,
    required this.store,
    required this.visit,
    this.deals = const [],
    this.catalogues = const [],
  });

  final StorePresenceEventType type;
  final NearbyStore store;
  final StoreVisitRecord visit;
  final List<Deal> deals;
  final List<Catalogue> catalogues;

  String? get retailerId {
    final candidates = <String?>[
      store.retailerId,
      ...deals.map((deal) => deal.retailerId),
      ...catalogues.map((catalogue) => catalogue.retailerId),
    ];
    for (final candidate in candidates) {
      final value = candidate?.trim() ?? '';
      if (value.isNotEmpty) return value;
    }
    return null;
  }
}

typedef ShopperLocationReader = Future<ShopperLocation?> Function();
typedef LocationAccuracyReader = Future<LocationAccuracyStatus> Function();

Future<LocationAccuracyStatus> readDeviceLocationAccuracy() async {
  try {
    return await Geolocator.getLocationAccuracy();
  } catch (_) {
    // Platforms without the approximate/precise split (older Android, tests)
    // grant precise by definition.
    return LocationAccuracyStatus.precise;
  }
}

class StoreVisitAssistant {
  StoreVisitAssistant({
    required this.api,
    StoreVisitPreferences? preferences,
    ShopperLocationReader? readLocation,
    LocationAccuracyReader? readAccuracy,
    DateTime Function()? now,
  })  : preferences = preferences ?? StoreVisitPreferences.instance,
        _readLocation = readLocation ?? _defaultLocationReader,
        _readAccuracy = readAccuracy ?? readDeviceLocationAccuracy,
        _now = now ?? DateTime.now;

  // Inside the store means INSIDE: 45m covers a large supermarket floor
  // without spilling into the parking lot, and a fix looser than 25m cannot
  // support that claim, so it is ignored rather than trusted.
  static const inStoreDistanceM = 45.0;
  static const maxLocationAccuracyM = 25.0;
  static const requiredEntryConfirmations = 2;

  final Api api;
  final StoreVisitPreferences preferences;
  final ShopperLocationReader _readLocation;
  final LocationAccuracyReader _readAccuracy;
  final DateTime Function() _now;
  bool _checking = false;
  String? _entryCandidateId;
  int _entryConfirmationCount = 0;

  Future<StorePresenceEvent?> check() async {
    if (_checking) return null;
    _checking = true;
    try {
      await preferences.load();
      if (!preferences.enabled) return null;
      // The shopper can downgrade to approximate location in settings at any
      // time; the assistant turns itself off rather than start guessing.
      if (await _readAccuracy() == LocationAccuracyStatus.reduced) {
        await preferences.setEnabled(false);
        return null;
      }
      final location = await _readLocation();
      if (location == null) return null;
      if (!_isReliable(location, _now())) {
        _clearEntryCandidate();
        return null;
      }
      final result = await api.nearbyStores(location.lat, location.lon);
      final nearest = _nearestStore(result.stores, location);
      final active = preferences.activeVisit;
      final now = _now();

      if (active != null && nearest?.placeId != active.placeId) {
        _clearEntryCandidate();
        final finished = await preferences.recordDeparture(now);
        if (finished == null) return null;
        return StorePresenceEvent(
          type: StorePresenceEventType.exited,
          store: _storeFromVisit(finished),
          visit: finished,
        );
      }

      if (active != null) {
        _clearEntryCandidate();
        return null;
      }
      if (nearest == null) {
        _clearEntryCandidate();
        return null;
      }
      if (_entryCandidateId != nearest.placeId) {
        _entryCandidateId = nearest.placeId;
        _entryConfirmationCount = 1;
        return null;
      }
      _entryConfirmationCount += 1;
      if (_entryConfirmationCount < requiredEntryConfirmations) return null;
      _clearEntryCandidate();
      final canPrompt = preferences.canPrompt(nearest.placeId, now);
      final visit = await preferences.recordArrival(nearest, now);
      if (!canPrompt) return null;
      final offers = await _offersFor(nearest);
      return StorePresenceEvent(
        type: StorePresenceEventType.entered,
        store: nearest,
        visit: visit,
        deals: offers.$1,
        catalogues: offers.$2,
      );
    } catch (_) {
      return null;
    } finally {
      _checking = false;
    }
  }

  NearbyStore? _nearestStore(
    List<NearbyStore> stores,
    ShopperLocation location,
  ) {
    final candidates = stores.where((store) {
      final distance = _storeDistanceM(store, location);
      return distance <= inStoreDistanceM;
    }).toList()
      ..sort((left, right) {
        final leftDistance = _storeDistanceM(left, location);
        final rightDistance = _storeDistanceM(right, location);
        return leftDistance.compareTo(rightDistance);
      });
    return candidates.isEmpty ? null : candidates.first;
  }

  bool _isReliable(ShopperLocation location, DateTime now) {
    if (location.isMocked) return false;
    if (!location.lat.isFinite || !location.lon.isFinite) return false;
    if (!location.accuracyM.isFinite ||
        location.accuracyM < 0 ||
        location.accuracyM > maxLocationAccuracyM) {
      return false;
    }
    final capturedAt = location.capturedAt;
    return capturedAt == null ||
        now.difference(capturedAt).abs() <= const Duration(seconds: 45);
  }

  double _storeDistanceM(NearbyStore store, ShopperLocation location) {
    if (store.lat != 0 || store.lon != 0) {
      return _distanceM(location.lat, location.lon, store.lat, store.lon);
    }
    return store.distanceM?.toDouble() ?? double.infinity;
  }

  void _clearEntryCandidate() {
    _entryCandidateId = null;
    _entryConfirmationCount = 0;
  }

  Future<(List<Deal>, List<Catalogue>)> _offersFor(NearbyStore store) async {
    if (store.deals.isNotEmpty || store.catalogues.isNotEmpty) {
      return (store.deals, store.catalogues);
    }
    try {
      final discovery = await api.discovery();
      final storeId = _canonicalRetailerId(store.retailerId);
      bool matches(String? retailerId, String? retailerName) {
        final contentId = _canonicalRetailerId(retailerId);
        if (storeId != null && contentId != null) return storeId == contentId;
        final name = retailerName ?? '';
        return _normalized(store.name).contains(_normalized(name)) ||
            _normalized(name).contains(_normalized(store.name));
      }

      return (
        discovery.deals
            .where((deal) => matches(deal.retailerId, deal.retailerName))
            .toList(growable: false),
        discovery.catalogues
            .where((catalogue) =>
                matches(catalogue.retailerId, catalogue.retailerName))
            .toList(growable: false),
      );
    } catch (_) {
      return (const <Deal>[], const <Catalogue>[]);
    }
  }
}

Future<ShopperLocation?> _defaultLocationReader() async {
  if (!await Geolocator.isLocationServiceEnabled()) return null;
  final permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    return null;
  }
  final position = await Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      timeLimit: Duration(seconds: 15),
    ),
  );
  return ShopperLocation(
    position.latitude,
    position.longitude,
    accuracyM: position.accuracy,
    capturedAt: position.timestamp,
    isMocked: position.isMocked,
  );
}

NearbyStore _storeFromVisit(StoreVisitRecord visit) => NearbyStore(
      placeId: visit.placeId,
      name: visit.storeName,
      address: visit.address,
      retailerId: visit.retailerId,
    );

double _distanceM(num lat1, num lon1, num lat2, num lon2) {
  const radiusM = 6371000.0;
  double radians(num degrees) => degrees.toDouble() * pi / 180;
  final dLat = radians(lat2 - lat1);
  final dLon = radians(lon2 - lon1);
  final a = sin(dLat / 2) * sin(dLat / 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * sin(dLon / 2) * sin(dLon / 2);
  return radiusM * 2 * atan2(sqrt(a), sqrt(1 - a));
}

List<StoreVisitRecord> _decodeVisits(String? raw) {
  if (raw == null || raw.isEmpty) return const [];
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((row) {
          try {
            return StoreVisitRecord.fromJson(Map<String, dynamic>.from(row));
          } catch (_) {
            return null;
          }
        })
        .whereType<StoreVisitRecord>()
        .where((visit) =>
            visit.id.isNotEmpty &&
            visit.placeId.isNotEmpty &&
            visit.storeName.isNotEmpty)
        .toList(growable: false);
  } catch (_) {
    return const [];
  }
}

Map<String, DateTime> _decodePromptTimes(String? raw) {
  if (raw == null || raw.isEmpty) return const {};
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return const {};
    return {
      for (final entry in decoded.entries)
        if (DateTime.tryParse(entry.value.toString()) case final time?)
          entry.key.toString(): time,
    };
  } catch (_) {
    return const {};
  }
}

String? _optionalText(dynamic value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}

String? _canonicalRetailerId(String? value) {
  final id = value?.trim().toLowerCase();
  if (id == null || id.isEmpty) return null;
  if (id == 'picknpay' || id == 'pnp') return 'pick-n-pay';
  return id;
}

String _normalized(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ');
