import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/widgets/scout_launch_intro.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

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

  testWidgets('a tap skips straight to the end of the intro', (tester) async {
    final semantics = tester.ensureSemantics();
    var completed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ScoutLaunchIntro(
          duration: const Duration(milliseconds: 2900),
          onComplete: () => completed = true,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    await tester.tap(find.bySemanticsLabel('Skip intro'));
    // The hurried finish's clock starts on the first frame after the tap.
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 1));

    expect(completed, isTrue);
    semantics.dispose();
  });

  testWidgets('a warm relaunch fast-forwards the intro on its own',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'scout_intro_last_shown_at':
          DateTime.now().subtract(const Duration(minutes: 5)).toIso8601String(),
    });

    var completed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ScoutLaunchIntro(
          duration: const Duration(milliseconds: 2900),
          onComplete: () => completed = true,
        ),
      ),
    );

    // Let the stored timestamp load, then the hurried finish run.
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 1));

    expect(completed, isTrue);
  });

  testWidgets('a first launch still plays the full sequence', (tester) async {
    var completed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ScoutLaunchIntro(
          duration: const Duration(milliseconds: 1000),
          onComplete: () => completed = true,
        ),
      ),
    );

    await tester.pump(const Duration(milliseconds: 600));
    expect(completed, isFalse);

    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 1));
    expect(completed, isTrue);
  });
}
