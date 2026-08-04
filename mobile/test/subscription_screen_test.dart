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

  testWidgets('shows cancellation directly on the current paid plan',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Your cancellation is scheduled.',
        planId: 'free',
        billingCycle: 'monthly',
        status: 'scheduled',
      ),
      plan: _scoutPlan,
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(api: api)));
    await tester.pumpAndSettle();

    final cancelButton =
        find.widgetWithText(OutlinedButton, 'Cancel subscription');
    expect(cancelButton, findsOneWidget);
    await tester.tap(cancelButton);
    await tester.pumpAndSettle();

    expect(find.text('Switch to Free?'), findsOneWidget);
    expect(api.checkoutCalls, 0);
  });

  testWidgets('quotes an American in dollars and names the rand charge',
      (tester) async {
    // The price is a whole number in the shopper's own money. PayFast still
    // settles in rand, so the rand their statement will show is named too —
    // neither number may be hidden from them.
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Checkout ready.',
        planId: 'household',
        billingCycle: 'monthly',
        status: 'checkout_required',
      ),
      countryPricing: const CountryPricing(
        code: 'US',
        name: 'United States',
        currencyCode: 'USD',
        rateFromZar: 0.055,
      ),
      currencyCode: 'USD',
      plan: _americanHouseholdPlan,
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(api: api)));
    await tester.pumpAndSettle();

    // A price somebody chose, with no stray cents from a conversion.
    expect(find.text(r'$10/mo'), findsOneWidget);
    expect(find.textContaining(r'$9.9'), findsNothing);
    // R181.82 is what $10 comes to at this rate, and what the card is debited.
    expect(find.text('Charged R181.82'), findsOneWidget);
  });

  testWidgets('leaves a South African on the rand price, with no conversion',
      (tester) async {
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Checkout ready.',
        planId: 'household',
        billingCycle: 'monthly',
        status: 'checkout_required',
      ),
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('R99/mo'), findsOneWidget);
    // Their price is already in rand, so repeating it as a charge is noise.
    expect(find.textContaining('Charged'), findsNothing);
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

  testWidgets('activates the paid plan as soon as the server confirms it',
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
      accountResponses: const [_paidAccount, _householdAccount],
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(
      api: api,
      confirmationPollInterval: Duration.zero,
      openCheckout: (_, __) async => true,
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Start Household'));
    await tester.pumpAndSettle();

    expect(find.text('Your Household plan is active.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Current plan'), findsOneWidget);
  });

  testWidgets('resumes a cancelled plan without promising another charge today',
      (tester) async {
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Nothing is charged today.',
        planId: 'scout',
        billingCycle: 'monthly',
        status: 'checkout_required',
        redirectUrl: 'https://www.payfast.co.za/eng/process',
        redirectFields: {
          'amount': '0.00',
          'billing_date': '2026-09-04',
          'recurring_amount': '29.00',
        },
      ),
      accountResponses: const [_cancelledScoutAccount],
      plan: _scoutPlan,
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(
      api: api,
      openCheckout: (_, checkout) async {
        expect(checkout.redirectFields['amount'], '0.00');
        return false;
      },
    )));
    await tester.pumpAndSettle();

    expect(find.textContaining('nothing is charged today'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Resume Scout'));
    await tester.pumpAndSettle();

    expect(api.checkoutCalls, 1);
  });

  testWidgets('keeps the current plan when a non-cancellation change is queued',
      (tester) async {
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Unused.',
        planId: 'household',
        billingCycle: 'monthly',
        status: 'scheduled',
      ),
      accountResponses: const [_scheduledDowngradeAccount],
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Keep Household'));
    await tester.pumpAndSettle();

    expect(api.cancelScheduledCalls, 1);
    expect(api.checkoutCalls, 0);
  });

  testWidgets('opens the business application before Organisation checkout',
      (tester) async {
    final api = _SubscriptionApi(
      checkoutResult: const SubscriptionCheckout(
        message: 'Checkout ready.',
        planId: 'organization',
        billingCycle: 'monthly',
        status: 'checkout_required',
      ),
      plan: _organizationPlan,
    );
    await tester.pumpWidget(_wrap(SubscriptionScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(
        find.widgetWithText(FilledButton, 'Apply for Organisation access'));
    await tester.pumpAndSettle();

    expect(find.text('Tell us about your business'), findsOneWidget);
    expect(find.text('Registered business name'), findsOneWidget);
    expect(api.checkoutCalls, 0);
  });
}

Widget _wrap(Widget child) => MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: child),
    );

class _SubscriptionApi extends Api {
  _SubscriptionApi({
    required this.checkoutResult,
    this.countryPricing = const CountryPricing(
      code: 'ZA',
      name: 'South Africa',
      currencyCode: 'ZAR',
      rateFromZar: 1,
    ),
    this.currencyCode = 'ZAR',
    this.plan = _householdPlan,
    this.accountResponses = const [],
  }) : super(baseUrl: 'https://example.test');

  final SubscriptionCheckout checkoutResult;
  final CountryPricing countryPricing;

  /// The currency this shopper's country prices in.
  final String currencyCode;

  /// The paid plan the server priced for this shopper.
  final MemberPlan plan;
  final List<MemberAccount> accountResponses;
  int checkoutCalls = 0;
  int cancelScheduledCalls = 0;
  int subscriptionCalls = 0;

  @override
  String get effectiveCurrencyCode => currencyCode;

  @override
  Future<SubscriptionData> subscription() async {
    final account = subscriptionCalls < accountResponses.length
        ? accountResponses[subscriptionCalls]
        : accountResponses.isEmpty
            ? _paidAccount
            : accountResponses.last;
    subscriptionCalls += 1;
    return SubscriptionData(
      billingReady: true,
      plans: [_freePlan, plan],
      account: account,
    );
  }

  @override
  Future<CountryPricing> country() async => countryPricing;

  @override
  Future<SubscriptionCheckout> checkout(
      String planId, String billingCycle) async {
    checkoutCalls += 1;
    return checkoutResult;
  }

  @override
  Future<MemberAccount> cancelScheduledPlanChange() async {
    cancelScheduledCalls += 1;
    return _householdAccount;
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

const _householdAccount = MemberAccount(
  id: 'member-1',
  email: 'sam@example.test',
  displayName: 'Sam Shopper',
  initials: 'SS',
  planId: 'household',
  planName: 'Household',
  planStatus: 'active',
  role: 'member',
  propertiesAccess: false,
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:01:00.000Z',
);

const _cancelledScoutAccount = MemberAccount(
  id: 'member-1',
  email: 'sam@example.test',
  displayName: 'Sam Shopper',
  initials: 'SS',
  planId: 'scout',
  planName: 'Scout',
  planStatus: 'active',
  role: 'member',
  propertiesAccess: false,
  billingCycle: 'monthly',
  pendingPlanId: 'free',
  pendingEffectiveAt: '2026-09-04T15:45:00.000Z',
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
);

const _scheduledDowngradeAccount = MemberAccount(
  id: 'member-1',
  email: 'sam@example.test',
  displayName: 'Sam Shopper',
  initials: 'SS',
  planId: 'household',
  planName: 'Household',
  planStatus: 'active',
  role: 'member',
  propertiesAccess: false,
  billingCycle: 'monthly',
  pendingPlanId: 'scout',
  pendingEffectiveAt: '2026-09-04T15:45:00.000Z',
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
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

const _scoutPlan = MemberPlan(
  id: 'scout',
  name: 'Scout',
  description: 'More room for one shopper.',
  badge: 'Paid',
  isPaid: true,
  statusText: 'Available',
  features: ['Larger saved lists'],
  monthlyCents: 2900,
  annualCents: 29000,
);

const _organizationPlan = MemberPlan(
  id: 'organization',
  name: 'Organisation',
  description: 'Business publishing tools.',
  badge: 'For businesses',
  isPaid: true,
  statusText: 'Application required',
  features: ['Business workspace'],
  monthlyCents: 49900,
  annualCents: 499000,
);

// The same plan as the server prices it for an American: quoted at a whole $10,
// settling at the rand that comes to.
const _americanHouseholdPlan = MemberPlan(
  id: 'household',
  name: 'Household',
  description: 'More room for a household.',
  badge: 'Paid',
  isPaid: true,
  statusText: 'Available',
  features: ['Larger saved lists'],
  monthlyCents: 18182,
  annualCents: 181818,
  localCurrency: 'USD',
  localMonthly: 10,
  localAnnual: 100,
);
