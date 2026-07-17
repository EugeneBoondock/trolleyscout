import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/main.dart';
import 'package:trolley_scout/widgets/scout_mark.dart';

void main() {
  testWidgets('boots home with visible log in and sign up actions',
      (tester) async {
    await tester.pumpWidget(
        TrolleyScoutApp(api: _FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('TROLLEY SCOUT'), findsOneWidget);
    expect(find.byKey(const ValueKey('navbar-scout-mark')), findsOneWidget);
    expect(
      tester
          .widget<AnimatedScoutMark>(
              find.byKey(const ValueKey('navbar-scout-mark')))
          .motion,
      ScoutMarkMotion.scout,
    );
    expect(find.textContaining('MONEY ON THE TABLE'), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'Log in'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign up'), findsOneWidget);
    expect(find.text('Near me'), findsOneWidget);
    expect(find.text('Deals'), findsOneWidget);
  });

  testWidgets('sign up opens the account form and can switch to log in',
      (tester) async {
    await tester.pumpWidget(
        TrolleyScoutApp(api: _FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.widgetWithText(FilledButton, 'Sign up'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('Display name'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Log in').last);
    await tester.pump();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Display name'), findsNothing);
  });

  testWidgets('drawer contains every consumer destination', (tester) async {
    await tester.pumpWidget(
        TrolleyScoutApp(api: _FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));

    for (final label in [
      'Dashboard',
      'Stores',
      'Vouchers',
      'Saved deals',
      'Basket',
      'Saved sources',
      'Offers',
      'Scanner',
      'Subscription',
      'Profile',
      'About & help',
      'Rules',
    ]) {
      expect(find.text(label), findsOneWidget,
          reason: '$label must be in the app menu');
    }
    expect(find.text('Admin console'), findsNothing);
  });

  testWidgets('protected drawer taps keep signed-out shoppers on Home',
      (tester) async {
    await tester.pumpWidget(
        TrolleyScoutApp(api: _FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));
    tester
        .widget<ListTile>(find
            .ancestor(
                of: find.text('Dashboard'), matching: find.byType(ListTile))
            .first)
        .onTap!();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.textContaining('MONEY ON THE TABLE'), findsOneWidget);
    expect(find.text('Welcome back'), findsNothing);
    expect(find.textContaining('Log in or sign up to open Dashboard'),
        findsOneWidget);
  });

  testWidgets('drawer gives the current destination a strong selected state',
      (tester) async {
    await tester.pumpWidget(
        TrolleyScoutApp(api: _FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));
    final tile = tester.widget<ListTile>(find
        .ancestor(of: find.text('Home'), matching: find.byType(ListTile))
        .first);

    expect(tile.selected, isTrue);
    expect(tile.selectedTileColor, isNotNull);
    expect(tile.shape, isNotNull);
  });

  testWidgets('admin session sees the role-gated console', (tester) async {
    final api = _FakeApi(_adminSession);
    await tester.pumpWidget(TrolleyScoutApp(api: api));
    await tester.pump(const Duration(milliseconds: 500));

    expect(api.sessionCalls, 1);
    expect(api.currentSession.isAuthenticated, isTrue);
    expect(find.byTooltip('Sign out'), findsOneWidget);
    expect(find.byTooltip('Profile'), findsOneWidget);

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Admin console'), findsOneWidget);
  });
}

class _FakeApi extends Api {
  _FakeApi(this.currentSession) : super(baseUrl: 'https://example.test');

  MemberSession currentSession;
  int sessionCalls = 0;

  @override
  Future<MemberSession> session() async {
    sessionCalls += 1;
    return currentSession;
  }

  @override
  Future<MemberSession> authenticate(AuthDraft draft) async => currentSession;

  @override
  Future<MemberSession> signOut() async {
    currentSession = const MemberSession.signedOut();
    return currentSession;
  }
}

const _adminSession = MemberSession(
  isAuthenticated: true,
  account: MemberAccount(
    id: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin User',
    initials: 'AU',
    planId: 'household',
    planName: 'Household',
    planStatus: 'active',
    role: 'admin',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  ),
);
