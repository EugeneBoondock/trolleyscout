import 'dart:math';

/// Orders shopping stops into a short walking/driving loop. Nearest-neighbour
/// gives the shape, one 2-opt pass untangles the crossings it leaves behind —
/// exact for the handful of stores a real shopping trip visits.
class TripStop {
  const TripStop({
    required this.id,
    required this.name,
    required this.lat,
    required this.lon,
    this.address,
  });

  final String id;
  final String name;
  final double lat;
  final double lon;
  final String? address;
}

class PlannedTrip {
  const PlannedTrip({required this.stops, required this.legMeters});

  final List<TripStop> stops;

  /// legMeters[i] is the distance from the previous point (the shopper for
  /// i == 0) to stops[i].
  final List<double> legMeters;

  double get totalMeters =>
      legMeters.fold(0, (total, meters) => total + meters);
}

PlannedTrip planTrip({
  required double startLat,
  required double startLon,
  required List<TripStop> stops,
}) {
  if (stops.isEmpty) return const PlannedTrip(stops: [], legMeters: []);

  final remaining = [...stops];
  final ordered = <TripStop>[];
  var lat = startLat;
  var lon = startLon;
  while (remaining.isNotEmpty) {
    remaining.sort((a, b) => distanceMeters(lat, lon, a.lat, a.lon)
        .compareTo(distanceMeters(lat, lon, b.lat, b.lon)));
    final next = remaining.removeAt(0);
    ordered.add(next);
    lat = next.lat;
    lon = next.lon;
  }

  _twoOptImprove(startLat, startLon, ordered);

  final legs = <double>[];
  lat = startLat;
  lon = startLon;
  for (final stop in ordered) {
    legs.add(distanceMeters(lat, lon, stop.lat, stop.lon));
    lat = stop.lat;
    lon = stop.lon;
  }
  return PlannedTrip(stops: ordered, legMeters: legs);
}

void _twoOptImprove(double startLat, double startLon, List<TripStop> route) {
  double pointLat(int index) => index < 0 ? startLat : route[index].lat;
  double pointLon(int index) => index < 0 ? startLon : route[index].lon;

  var improved = true;
  while (improved) {
    improved = false;
    for (var i = 0; i < route.length - 1; i++) {
      for (var j = i + 1; j < route.length; j++) {
        final before = distanceMeters(pointLat(i - 1), pointLon(i - 1),
                route[i].lat, route[i].lon) +
            (j + 1 < route.length
                ? distanceMeters(route[j].lat, route[j].lon,
                    route[j + 1].lat, route[j + 1].lon)
                : 0);
        final after = distanceMeters(pointLat(i - 1), pointLon(i - 1),
                route[j].lat, route[j].lon) +
            (j + 1 < route.length
                ? distanceMeters(route[i].lat, route[i].lon,
                    route[j + 1].lat, route[j + 1].lon)
                : 0);
        if (after + 0.01 < before) {
          final segment = route.sublist(i, j + 1).reversed.toList();
          route.replaceRange(i, j + 1, segment);
          improved = true;
        }
      }
    }
  }
}

double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
  const earthRadius = 6371000.0;
  final dLat = _radians(lat2 - lat1);
  final dLon = _radians(lon2 - lon1);
  final a = pow(sin(dLat / 2), 2) +
      cos(_radians(lat1)) * cos(_radians(lat2)) * pow(sin(dLon / 2), 2);
  return earthRadius * 2 * atan2(sqrt(a), sqrt(1 - a));
}

double _radians(double degrees) => degrees * pi / 180;

String formatTripDistance(double meters) => meters >= 1000
    ? '${(meters / 1000).toStringAsFixed(1)} km'
    : '${meters.round()} m';
