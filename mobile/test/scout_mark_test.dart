import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/widgets/common.dart';
import 'package:trolley_scout/widgets/scout_mark.dart';
import 'package:trolley_scout/widgets/skeleton.dart';

void main() {
  testWidgets('scouting motion changes the Scout badge angle', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AnimatedScoutMark(motion: ScoutMarkMotion.scout),
        ),
      ),
    );

    final before = tester
        .widget<Transform>(find.byKey(const ValueKey('scout-mark-motion')))
        .transform;
    await tester.pump(const Duration(milliseconds: 500));
    final after = tester
        .widget<Transform>(find.byKey(const ValueKey('scout-mark-motion')))
        .transform;

    expect(after, isNot(equals(before)));
  });

  testWidgets('loading motion continuously rotates the Scout badge',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AnimatedScoutMark(motion: ScoutMarkMotion.spin),
        ),
      ),
    );

    final before = tester
        .widget<Transform>(find.byKey(const ValueKey('scout-mark-motion')))
        .transform;
    await tester.pump(const Duration(milliseconds: 250));
    final after = tester
        .widget<Transform>(find.byKey(const ValueKey('scout-mark-motion')))
        .transform;

    expect(after, isNot(equals(before)));
  });

  testWidgets('reduced motion keeps the Scout badge still', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: Scaffold(
            body: AnimatedScoutMark(motion: ScoutMarkMotion.spin),
          ),
        ),
      ),
    );

    final before = tester
        .widget<Transform>(find.byKey(const ValueKey('scout-mark-motion')))
        .transform;
    await tester.pump(const Duration(seconds: 1));
    final after = tester
        .widget<Transform>(find.byKey(const ValueKey('scout-mark-motion')))
        .transform;

    expect(after, equals(before));
  });

  testWidgets('business constructor uses the dedicated business logo',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AnimatedScoutMark.business(),
        ),
      ),
    );

    final image = tester.widget<Image>(find.byType(Image));
    expect(
      (image.image as AssetImage).assetName,
      'assets/scout-logo-business-v2.png',
    );
  });

  testWidgets('shared content loading shows shimmer skeletons, not a spinner',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: LoadingPane())),
    );

    expect(find.byType(SkeletonPane), findsOneWidget);
    expect(find.byType(AnimatedScoutMark), findsNothing);

    // The shimmer must not leave a running animation behind when disposed.
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Text('x'))));
    await tester.pump(const Duration(milliseconds: 50));
  });
}
