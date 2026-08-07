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

  test('shared surfaces keep the neo-brutalist edge without going severe', () {
    // The radius ladder is a balance: hard enough that the 2px stroke and the
    // slab shadow read as the edge of an object, soft enough that the corner
    // stays on the mascot's side of friendly. The floor guards against pill
    // regression, the ceiling against the reference sets' 5px severity.
    expect(TS.cardRadius, inInclusiveRange(12, 20));
    expect(TS.controlRadius, inInclusiveRange(8, 14));
    expect(TS.panelRadius, inInclusiveRange(18, 28));

    for (final theme in [TS.lightTheme(), TS.darkTheme()]) {
      final card = theme.cardTheme.shape! as RoundedRectangleBorder;
      final dialog = theme.dialogTheme.shape! as RoundedRectangleBorder;

      expect(card.borderRadius, BorderRadius.circular(TS.cardRadius));
      expect(dialog.borderRadius, BorderRadius.circular(TS.panelRadius));
      // Cards and dialogs carry the ink edge that does elevation's job.
      expect(card.side.width, greaterThanOrEqualTo(TS.strokeBase));
      expect(dialog.side.width, greaterThanOrEqualTo(TS.strokeBase));
    }
  });

  test('buttons cast the hard slab and flatten while pressed', () {
    for (final theme in [TS.lightTheme(), TS.darkTheme()]) {
      for (final style in [
        theme.filledButtonTheme.style!,
        theme.outlinedButtonTheme.style!,
      ]) {
        final resting =
            style.shape!.resolve(<WidgetState>{})! as NeoSlabBorder;
        final pressed = style.shape!
            .resolve({WidgetState.pressed})! as NeoSlabBorder;

        expect(resting.radius, TS.controlRadius);
        // The slab shadow is the style's signature; the press collapses it
        // so the button lands flat on the page.
        expect(resting.offset, greaterThan(0));
        expect(pressed.offset, 0);
        expect(resting.side.width, greaterThanOrEqualTo(TS.strokeBase));
      }
      // Chips carry the same slab so a filter row reads as a set of keys.
      final chip = theme.chipTheme.shape! as NeoSlabBorder;
      expect(chip.offset, greaterThan(0));
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
