import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/scout_avatar_view.dart';

void main() {
  testWidgets('profile avatar card has smooth clipped corners', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        home: const Scaffold(
          body: ScoutAvatarView(initials: 'ES'),
        ),
      ),
    );

    final avatar = tester.widget<Container>(
      find.byKey(const ValueKey('scout-avatar-card')),
    );
    final decoration = avatar.decoration! as BoxDecoration;

    expect(avatar.clipBehavior, Clip.antiAlias);
    expect(decoration.borderRadius, isNotNull);
  });
}
