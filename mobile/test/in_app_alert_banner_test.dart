import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/app_link_coordinator.dart';
import 'package:trolley_scout/in_app_alerts.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/in_app_alert_banner.dart';

void main() {
  late StreamController<InAppAlert> alerts;

  setUp(() => alerts = StreamController<InAppAlert>.broadcast());
  tearDown(() => alerts.close());

  Future<void> pumpBanner(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        home: InAppAlertBanner(
          alerts: alerts.stream,
          child: const Scaffold(body: Text('Deals')),
        ),
      ),
    );
  }

  final priceDrop = InAppAlert(
    title: 'Price drop on a saved deal',
    body: 'Braaipack 5kg just dropped below the price you saved it at.',
    link: Uri.parse('trolleyscout://saved'),
    kind: InAppAlertKind.priceDrop,
  );

  testWidgets('drops the card in and takes it away on its own', (tester) async {
    await pumpBanner(tester);
    expect(find.text(priceDrop.title), findsNothing);

    alerts.add(priceDrop);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text(priceDrop.title), findsOneWidget);
    expect(find.text(priceDrop.body), findsOneWidget);
    // The screen behind it keeps working — an alert is an offer, not a modal.
    expect(find.text('Deals'), findsOneWidget);

    await tester.pump(alertDwell);
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text(priceDrop.title), findsNothing);
  });

  testWidgets('a tap opens where the alert points', (tester) async {
    // Drain anything an earlier test left pending so this reads its own work.
    AppLinkCoordinator.instance.takePending();

    await pumpBanner(tester);
    alerts.add(priceDrop);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.tap(find.text(priceDrop.title));
    await tester.pump();

    expect(AppLinkCoordinator.instance.takePending(), isNotNull);
  });

  testWidgets('the close button sends it away early', (tester) async {
    await pumpBanner(tester);
    alerts.add(priceDrop);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.tap(find.byTooltip('Dismiss'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text(priceDrop.title), findsNothing);
  });

  test('nothing is published when the app is not on screen', () {
    // The background poll runs in its own isolate with no banner mounted, so
    // the tray notification must still go out there.
    expect(
      InAppAlerts.instance.publish(
        InAppAlert(
          title: 'New deals on Trolley Scout',
          body: '4 new deals just landed.',
          link: Uri.parse('trolleyscout://deals'),
        ),
      ),
      isFalse,
    );
  });
}
