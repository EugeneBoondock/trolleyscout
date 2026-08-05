import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/multi_stop_route.dart';
import 'package:trolley_scout/store_crowd.dart';

TripStop _stop(String id, double lat, double lon) =>
    TripStop(id: id, name: id, lat: lat, lon: lon);

void main() {
  test('orders stops so the shopper never backtracks', () {
    // Johannesburg-ish line of stores east of a starting point; a naive save
    // order would zig-zag, the planner should walk them west to east.
    final trip = planTrip(
      startLat: -26.2041,
      startLon: 28.0473,
      stops: [
        _stop('far', -26.2041, 28.12),
        _stop('near', -26.2041, 28.06),
        _stop('mid', -26.2041, 28.09),
      ],
    );

    expect(trip.stops.map((stop) => stop.id).toList(), ['near', 'mid', 'far']);
    expect(trip.legMeters, hasLength(3));
    expect(trip.totalMeters,
        closeTo(distanceMeters(-26.2041, 28.0473, -26.2041, 28.12), 200));
  });

  test('2-opt untangles a crossing the greedy pass creates', () {
    // Square: start bottom-left; greedy nearest-neighbour can cross the
    // diagonal, the improved route walks the perimeter.
    final trip = planTrip(
      startLat: 0,
      startLon: 0,
      stops: [
        _stop('a', 0.010, 0.000),
        _stop('b', 0.010, 0.010),
        _stop('c', 0.000, 0.011),
      ],
    );

    final perimeter = distanceMeters(0, 0, 0.010, 0) +
        distanceMeters(0.010, 0, 0.010, 0.010) +
        distanceMeters(0.010, 0.010, 0, 0.011);
    expect(trip.totalMeters, lessThanOrEqualTo(perimeter * 1.01));
  });

  test('distances format for humans', () {
    expect(formatTripDistance(430), '430 m');
    expect(formatTripDistance(1530), '1.5 km');
  });

  test('crowd estimates follow the South African month', () {
    // Pay-weekend Saturday midday: busy.
    expect(estimateCrowd(DateTime(2026, 8, 29, 11)).level, CrowdLevel.busy);
    // Mid-month Tuesday mid-morning: quiet.
    expect(estimateCrowd(DateTime(2026, 8, 11, 10)).level, CrowdLevel.quiet);
    // Mid-month Saturday morning rush: busy.
    expect(estimateCrowd(DateTime(2026, 8, 15, 10)).level, CrowdLevel.busy);
    // Weekday after-work flow: moderate.
    expect(estimateCrowd(DateTime(2026, 8, 11, 17)).level, CrowdLevel.moderate);
    // Late evening any day: quiet.
    expect(estimateCrowd(DateTime(2026, 8, 29, 20)).level, CrowdLevel.quiet);
  });
}
