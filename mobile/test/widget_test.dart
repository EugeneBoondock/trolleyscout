import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/main.dart';

void main() {
  testWidgets('signed out boots onboarding, not the app shell', (tester) async {
    await tester.pumpWidget(
        TrolleyScoutApp(api: _FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    // Onboarding is shown; no app content or navigation is reachable yet.
    expect(find.text('TROLLEY SCOUT'), findsOneWidget);
    expect(find.text('Stretch every rand'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Next'), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'Log in'), findsOneWidget);
    expect(find.byTooltip('Open navigation menu'), findsNothing);
  });

  testWidgets('onboarding opens the account form and can switch to log in',
      (tester) async {
    await tester.pumpWidget(
        TrolleyScoutApp(api: _FakeApi(const MemberSession.signedOut())));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.textContaining('create an account'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('Display name'), findsOneWidget);

    await tester.tap(find.text('Log in'));
    await tester.pump();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Display name'), findsNothing);
  });

  testWidgets('drawer contains every consumer destination once signed in',
      (tester) async {
    await tester.pumpWidget(TrolleyScoutApp(api: _FakeApi(_memberSession)));
    await tester.pump(const Duration(milliseconds: 500));

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pump(const Duration(milliseconds: 500));

    for (final label in [
      'Dashboard',
      'Stores',
      'Vouchers',
      'Properties',
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

  testWidgets('drawer gives the current destination a strong selected state',
      (tester) async {
    await tester.pumpWidget(TrolleyScoutApp(api: _FakeApi(_memberSession)));
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
  Future<List<DealWatch>> dealWatches() async => const [];

  @override
  Future<MemberSession> signOut() async {
    currentSession = const MemberSession.signedOut();
    return currentSession;
  }
}

const _memberSession = MemberSession(
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
    propertiesAccess: true,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  ),
);
