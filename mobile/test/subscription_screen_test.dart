import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/subscription_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  testWidgets('downgrade requires confirmation and reports its schedule',
      (tester) async {
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Your change is scheduled for 1 August.',
        planId: 'free',
        billingCycle: 'monthly',
        status: 'scheduled',
      ),
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Use Free'));
    await tester.pumpAndSettle();
    expect(find.text('Switch to Free?'), findsOneWidget);
    expect(api.checkoutCalls, 0);

    await tester.tap(find.widgetWithText(FilledButton, 'Schedule change'));
    await tester.pumpAndSettle();

    expect(api.checkoutCalls, 1);
    expect(find.text('Your change is scheduled for 1 August.'), findsOneWidget);
  });

  testWidgets('closing payment clearly reports that no plan changed',
      (tester) async {
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Checkout ready.',
        planId: 'household',
        billingCycle: 'monthly',
        status: 'checkout_required',
        redirectUrl: 'https://www.payfast.co.za/eng/process',
        redirectFields: {'signature': 'signed'},
      ),
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(
      api: api,
      openCheckout: (_, __) async => false,
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Start Household'));
    await tester.pumpAndSettle();

    expect(
        find.text('Checkout closed. No plan change was made.'), findsOneWidget);
  });
}

Widget _wrap(Widget child) => MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: child),
    );

class _SubscriptionApi extends Api {
  _SubscriptionApi({required this.checkoutResult})
      : super(baseUrl: 'https://example.test');

  final SubscriptionCheckout checkoutResult;
  int checkoutCalls = 0;

  @override
  Future<SubscriptionData> subscription() async => const SubscriptionData(
        billingReady: true,
        plans: [_freePlan, _householdPlan],
        account: _paidAccount,
      );

  @override
  Future<CountryPricing> country() async => const CountryPricing(
        code: 'ZA',
        name: 'South Africa',
        currencyCode: 'ZAR',
        rateFromZar: 1,
      );

  @override
  Future<SubscriptionCheckout> checkout(
      String planId, String billingCycle) async {
    checkoutCalls += 1;
    return checkoutResult;
  }
}

const _paidAccount = MemberAccount(
  id: 'member-1',
  email: 'sam@example.test',
  displayName: 'Sam Shopper',
  initials: 'SS',
  planId: 'scout',
  planName: 'Scout',
  planStatus: 'active',
  role: 'member',
  propertiesAccess: false,
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
);

const _freePlan = MemberPlan(
  id: 'free',
  name: 'Free',
  description: 'Core shopping tools.',
  badge: 'Included',
  isPaid: false,
  statusText: 'Available',
  features: ['Saved deals'],
  monthlyCents: 0,
  annualCents: 0,
);

const _householdPlan = MemberPlan(
  id: 'household',
  name: 'Household',
  description: 'More room for a household.',
  badge: 'Paid',
  isPaid: true,
  statusText: 'Available',
  features: ['Larger saved lists'],
  monthlyCents: 9900,
  annualCents: 99000,
);
