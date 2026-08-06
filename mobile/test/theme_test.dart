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

  test('shared surfaces and controls never fall back to square corners', () {
    expect(TS.cardRadius, greaterThanOrEqualTo(20));
    expect(TS.controlRadius, greaterThanOrEqualTo(16));
    expect(TS.panelRadius, greaterThanOrEqualTo(28));

    for (final theme in [TS.lightTheme(), TS.darkTheme()]) {
      final card = theme.cardTheme.shape! as RoundedRectangleBorder;
      final dialog = theme.dialogTheme.shape! as RoundedRectangleBorder;
      final button = theme.filledButtonTheme.style!.shape!
          .resolve(<WidgetState>{})! as RoundedRectangleBorder;

      expect(card.borderRadius, BorderRadius.circular(TS.cardRadius));
      expect(dialog.borderRadius, BorderRadius.circular(TS.panelRadius));
      expect(button.borderRadius, BorderRadius.circular(TS.controlRadius));
    }
  });

  testWidgets('theme button switches the running app to dark mode',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    // The theme toggle lives in the signed-in shell, so boot authenticated.
    await tester.pumpWidget(TrolleyScoutApp(
      api: _MemberApi(),
      launchIntroDuration: Duration.zero,
    ));
    await tester.pump(const Duration(milliseconds: 500));

    expect(Theme.of(tester.element(find.byType(Scaffold))).brightness,
        Brightness.light);
    // The toggle lives in the avatar menu now, not loose in the bar.
    await tester.tap(find.byTooltip('Your menu'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.tap(find.text('Dark mode'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(Theme.of(tester.element(find.byType(Scaffold))).brightness,
        Brightness.dark);
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

  @override
  Future<Object?> getMemberState(String key) async => null;
}
