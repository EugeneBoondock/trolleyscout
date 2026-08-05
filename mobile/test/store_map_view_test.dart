import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/store_map_view.dart';

void main() {
  test('turn instructions stay inside the Trolley Scout navigator', () {
    expect(
      routeInstruction(const MapRouteStep(
        type: 'turn',
        modifier: 'right',
        name: 'Main Road',
        distanceMeters: 320,
        durationSeconds: 40,
        location: [-33.9249, 18.4241],
      )),
      'Turn right onto Main Road',
    );
    expect(
      routeInstruction(const MapRouteStep(
        type: 'arrive',
        modifier: 'right',
        name: '',
        distanceMeters: 0,
        durationSeconds: 0,
        location: [-33.9249, 18.4241],
      )),
      'Your destination is on the right',
    );
  });

  test('uses readable map tiles in light and dark modes', () {
    expect(
      storeMapTileTemplate(Brightness.light),
      contains('/rastertiles/voyager/'),
    );
    expect(
      storeMapTileTemplate(Brightness.dark),
      contains('/dark_all/'),
    );
  });

  testWidgets('simulation mode is visible only to administrators',
      (tester) async {
    Widget app(bool isAdmin) => MaterialApp(
          theme: TS.lightTheme(),
          home: StoreMapView(
            api: Api(baseUrl: 'https://example.test'),
            storeName: 'Test store',
            lat: -33.9249,
            lon: 18.4241,
            isAdmin: isAdmin,
          ),
        );

    await tester.pumpWidget(app(false));
    expect(find.byKey(const Key('navigation-simulation-mode')), findsNothing);
    await tester.pumpWidget(app(true));
    await tester.pump();
    expect(find.byKey(const Key('navigation-simulation-mode')), findsOneWidget);
  });
}
