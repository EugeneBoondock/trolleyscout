import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/app_controller.dart';
import 'package:trolley_scout/screens/profile_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<AppController> pumpProfile(
    WidgetTester tester,
    _VerifyApi api, {
    bool verified = false,
  }) async {
    await tester.binding.setSurfaceSize(const Size(430, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final controller = AppController(api)
      ..session = _sessionFor(verified)
      ..restoring = false;
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: ProfileScreen(controller: controller)),
    ));
    await tester.pumpAndSettle();
    // Settings is a long list and only mounts what is on screen, so the card
    // has to be scrolled to before it exists to look at.
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('email-verification-card')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    return controller;
  }

  testWidgets('offers verification to an account that has never verified',
      (tester) async {
    // Every account created before there was any way to send email is
    // unverified through no fault of the shopper.
    final api = _VerifyApi();
    await pumpProfile(tester, api);

    expect(find.text('Not verified'), findsOneWidget);
    expect(find.byKey(const ValueKey('email-verification-send')), findsOneWidget);
    expect(find.textContaining('shopper@example.test'), findsOneWidget);
  });

  testWidgets('sends the code, then takes it', (tester) async {
    final api = _VerifyApi();
    await pumpProfile(tester, api);

    await tester.tap(find.byKey(const ValueKey('email-verification-send')));
    await tester.pumpAndSettle();

    expect(api.requests, 1);
    expect(find.textContaining('Code sent'), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey('email-verification-code')),
      '123456',
    );
    await tester.tap(find.byKey(const ValueKey('email-verification-confirm')));
    await tester.pumpAndSettle();

    expect(api.confirmed, ['123456']);
    expect(find.text('Your email is verified.'), findsOneWidget);
  });

  testWidgets('says what the server said when delivery is unavailable',
      (tester) async {
    // "This month's verification emails are used up" is something a shopper
    // can act on; "something went wrong" is not.
    final api = _VerifyApi(
      failure: const ApiException(
        'This month\'s verification emails are used up. Try again shortly.',
      ),
    );
    await pumpProfile(tester, api);

    await tester.tap(find.byKey(const ValueKey('email-verification-send')));
    await tester.pumpAndSettle();

    expect(find.textContaining('used up'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('email-verification-code')),
      findsNothing,
      reason: 'no code was sent, so there is nothing to type in',
    );
  });

  testWidgets('a verified account is told so and asked for nothing',
      (tester) async {
    await pumpProfile(tester, _VerifyApi(), verified: true);

    expect(find.text('Verified'), findsOneWidget);
    expect(find.byKey(const ValueKey('email-verification-send')), findsNothing);
  });

  testWidgets('will not send a code that is obviously too short',
      (tester) async {
    final api = _VerifyApi();
    await pumpProfile(tester, api);
    await tester.tap(find.byKey(const ValueKey('email-verification-send')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey('email-verification-code')),
      '12',
    );
    await tester.tap(find.byKey(const ValueKey('email-verification-confirm')));
    await tester.pumpAndSettle();

    expect(api.confirmed, isEmpty);
    expect(find.textContaining('Enter the code'), findsOneWidget);
  });
}

MemberSession _sessionFor(bool verified) => MemberSession(
      isAuthenticated: true,
      account: MemberAccount(
        id: 'member-1',
        email: 'shopper@example.test',
        displayName: 'Thandi',
        initials: 'T',
        planId: 'free',
        planName: 'Free',
        planStatus: 'active',
        role: 'member',
        propertiesAccess: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        emailVerified: verified,
      ),
    );

class _VerifyApi extends Api {
  _VerifyApi({this.failure}) : super(baseUrl: 'https://example.test');

  final ApiException? failure;
  int requests = 0;
  final List<String> confirmed = [];

  @override
  Future<void> requestEmailVerification() async {
    requests += 1;
    final problem = failure;
    if (problem != null) throw problem;
  }

  @override
  Future<void> confirmEmailVerification(String code) async {
    confirmed.add(code);
  }
}
