import 'package:flutter/material.dart';

import '../api.dart';
import '../multi_stop_route.dart';
import '../theme.dart';
import '../ux.dart';
import 'store_map_view.dart';

/// Picks stores to visit and walks them in the shortest order. Selection and
/// plan live in one sheet so re-planning is a tap, not a journey.
Future<void> showTripPlannerSheet(
  BuildContext context, {
  required Api api,
  required double startLat,
  required double startLon,
  required List<TripStop> stores,
  bool isAdmin = false,
}) async {
  uxTap();
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: TS.bgOf(context),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(TS.panelRadius)),
    ),
    builder: (_) => _TripPlannerSheet(
      api: api,
      startLat: startLat,
      startLon: startLon,
      stores: stores,
      isAdmin: isAdmin,
    ),
  );
}

class _TripPlannerSheet extends StatefulWidget {
  const _TripPlannerSheet({
    required this.api,
    required this.startLat,
    required this.startLon,
    required this.stores,
    required this.isAdmin,
  });

  final Api api;
  final double startLat;
  final double startLon;
  final List<TripStop> stores;
  final bool isAdmin;

  @override
  State<_TripPlannerSheet> createState() => _TripPlannerSheetState();
}

class _TripPlannerSheetState extends State<_TripPlannerSheet> {
  late final Set<String> _selected =
      widget.stores.take(3).map((stop) => stop.id).toSet();

  PlannedTrip get _trip => planTrip(
        startLat: widget.startLat,
        startLon: widget.startLon,
        stops:
            widget.stores.where((stop) => _selected.contains(stop.id)).toList(),
      );

  @override
  Widget build(BuildContext context) {
    final trip = _trip;
    return FractionallySizedBox(
      heightFactor: 0.92,
      child: Column(
        key: const ValueKey('trip-planner-sheet'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 10, 6),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    color: TS.yellow,
                    borderRadius: BorderRadius.circular(TS.controlRadius),
                  ),
                  child: const Icon(Icons.route_rounded, size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Plan a shopping trip',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.merge(TS.display),
                      ),
                      Text(
                        'Pick your stores - Mr Scout orders the stops so you '
                        'never double back.',
                        style:
                            TextStyle(color: TS.mutedOf(context), fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Close trip planner',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: TS.lineOf(context)),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                Text('CHOOSE STORES', style: TS.eyebrowOf(context)),
                const SizedBox(height: 6),
                for (final stop in widget.stores)
                  CheckboxListTile(
                    key: ValueKey('trip-stop-${stop.id}'),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    dense: true,
                    title: Text(stop.name,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: stop.address == null ? null : Text(stop.address!),
                    value: _selected.contains(stop.id),
                    onChanged: (checked) => setState(() {
                      uxTap();
                      if (checked == true) {
                        _selected.add(stop.id);
                      } else {
                        _selected.remove(stop.id);
                      }
                    }),
                  ),
                const SizedBox(height: 14),
                if (trip.stops.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: TS.card(context),
                    child: Text(
                      'Tick at least one store to see your route.',
                      style: TextStyle(color: TS.mutedOf(context)),
                    ),
                  )
                else ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text('YOUR ROUTE', style: TS.eyebrowOf(context)),
                      ),
                      Text(
                        '${formatTripDistance(trip.totalMeters)} total',
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w900),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Container(
                    key: const ValueKey('trip-route-plan'),
                    padding: const EdgeInsets.all(8),
                    decoration: TS.card(context, width: 1.5),
                    child: Column(
                      children: [
                        for (var index = 0; index < trip.stops.length; index++)
                          ListTile(
                            key: ValueKey('trip-leg-${trip.stops[index].id}'),
                            dense: true,
                            leading: CircleAvatar(
                              radius: 13,
                              backgroundColor: TS.inkOf(context),
                              child: Text(
                                '${index + 1}',
                                style: TextStyle(
                                  color: TS.bgOf(context),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            title: Text(
                              trip.stops[index].name,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800),
                            ),
                            subtitle: Text(
                              index == 0
                                  ? '${formatTripDistance(trip.legMeters[index])} from you'
                                  : '${formatTripDistance(trip.legMeters[index])} from stop $index',
                            ),
                            trailing: FilledButton(
                              onPressed: () => StoreMapView.open(
                                context,
                                api: widget.api,
                                storeName: trip.stops[index].name,
                                lat: trip.stops[index].lat,
                                lon: trip.stops[index].lon,
                                storeAddress: trip.stops[index].address,
                                isAdmin: widget.isAdmin,
                              ),
                              style: FilledButton.styleFrom(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                visualDensity: VisualDensity.compact,
                              ),
                              child: const Text('Go'),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Distances are as the crow flies; the Go button opens '
                    'turn-by-turn navigation for each stop.',
                    style:
                        TextStyle(color: TS.faintOf(context), fontSize: 11.5),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
