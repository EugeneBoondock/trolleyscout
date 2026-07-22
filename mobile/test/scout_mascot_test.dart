import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/widgets/scout_mascot.dart';

void main() {
  testWidgets('ScoutMascot selects the requested pose asset', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ScoutMascot(pose: ScoutMascotPose.search),
      ),
    );

    final image = tester.widget<Image>(find.byType(Image));
    expect((image.image as AssetImage).assetName,
        'assets/mascots/scout-search.png');
  });

  testWidgets('ScoutGuideCard gives advice and can be dismissed',
      (tester) async {
    var dismissed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ScoutGuideCard(
            title: 'A quicker search',
            message: 'Choose the stores first.',
            onDismiss: () => dismissed = true,
          ),
        ),
      ),
    );

    expect(find.text('A quicker search'), findsOneWidget);
    await tester.tap(find.byTooltip('Dismiss Scout’s tip'));
    expect(dismissed, isTrue);
  });
}
