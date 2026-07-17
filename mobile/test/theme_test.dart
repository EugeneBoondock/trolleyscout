import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/main.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  test('light and dark themes use readable paper palettes', () {
    final light = TS.lightTheme();
    final dark = TS.darkTheme();

    expect(light.scaffoldBackgroundColor, const Color(0xFFF4EEDD));
    expect(light.colorScheme.onSurface, const Color(0xFF1C1710));
    expect(light.cardTheme.color, const Color(0xFFFDFAF1));
    expect(dark.scaffoldBackgroundColor, const Color(0xFF191410));
    expect(dark.colorScheme.onSurface, const Color(0xFFF3ECD9));
    expect(dark.cardTheme.color, const Color(0xFF221C15));
  });

  testWidgets('theme button switches the running app to dark mode',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(TrolleyScoutApp(api: _SignedOutApi()));
    await tester.pump(const Duration(milliseconds: 500));

    expect(Theme.of(tester.element(find.byType(Scaffold))).brightness,
        Brightness.light);
    await tester.tap(find.byTooltip('Use dark theme'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(Theme.of(tester.element(find.byType(Scaffold))).brightness,
        Brightness.dark);
    expect(find.byTooltip('Use light theme'), findsOneWidget);
  });
}

class _SignedOutApi extends Api {
  _SignedOutApi() : super(baseUrl: 'https://example.test');

  @override
  Future<MemberSession> session() async => const MemberSession.signedOut();
}
