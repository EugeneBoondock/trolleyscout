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
    // The theme toggle lives in the signed-in shell, so boot authenticated.
    await tester.pumpWidget(TrolleyScoutApp(api: _MemberApi()));
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

class _MemberApi extends Api {
  _MemberApi() : super(baseUrl: 'https://example.test');

  @override
  Future<MemberSession> session() async => const MemberSession(
        isAuthenticated: true,
        account: MemberAccount(
          id: 'member-1',
          email: 'sam@example.com',
          displayName: 'Sam Shopper',
          initials: 'SS',
          planId: 'free',
          planName: 'Free',
          planStatus: 'active',
          role: 'member',
          propertiesAccess: false,
          createdAt: '2026-07-01T10:00:00.000Z',
          updatedAt: '2026-07-01T10:00:00.000Z',
        ),
      );

  @override
  Future<List<DealWatch>> dealWatches() async => const [];
}
