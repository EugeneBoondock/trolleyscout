import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/widgets/scout_launch_intro.dart';

void main() {
  testWidgets('Scout completes one short launch sequence', (tester) async {
    var completed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ScoutLaunchIntro(
          duration: const Duration(milliseconds: 1000),
          onComplete: () => completed = true,
        ),
      ),
    );

    expect(find.byKey(const ValueKey('scout-intro-spin')), findsOneWidget);
    expect(find.byKey(const ValueKey('scout-intro-x')), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 700));
    final finalPose = tester.widget<Opacity>(
      find
          .ancestor(
            of: find.byKey(const ValueKey('scout-intro-x')),
            matching: find.byType(Opacity),
          )
          .first,
    );
    expect(finalPose.opacity, greaterThan(0.9));

    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 1));
    expect(completed, isTrue);
  });

  testWidgets('reduced motion skips the turn and shows the X pose',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: ScoutLaunchIntro(onComplete: () {}),
        ),
      ),
    );

    expect(find.byKey(const ValueKey('scout-intro-spin')), findsNothing);
    expect(find.byKey(const ValueKey('scout-intro-x')), findsOneWidget);
  });
}
