import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/advertise_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  testWidgets('closed ad checkout reports that no payment was made',
      (tester) async {
    final api = _AdvertiseApi();
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: AdvertiseScreen(
          api: api,
          openCheckout: (_, __) async => false,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    final payButton = find.text('Pay R150 to go live');
    await tester.scrollUntilVisible(
      payButton,
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(payButton);
    await tester.pumpAndSettle();

    expect(api.checkoutCalls, 1);
    expect(find.text('Checkout closed. No payment was made.'), findsOneWidget);
  });

  testWidgets('ad form rejects insecure destination and image links',
      (tester) async {
    final api = _AdvertiseApi();
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: AdvertiseScreen(api: api)),
    ));
    await tester.pumpAndSettle();

    Finder field(String label) => find.ancestor(
          of: find.text(label),
          matching: find.byType(TextFormField),
        );
    await tester.enterText(field('Ad title'), 'Winter sale');
    await tester.enterText(field('Ad text (one or two lines)'), 'Save today');
    await tester.enterText(
        field('Link to open (https://…)'), 'http://shop.test');
    await tester.enterText(field('Image link (optional)'), 'not-a-link');
    await tester.scrollUntilVisible(
      find.text('Submit for review'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit for review'));
    await tester.pump();

    expect(
        find.text('Enter a full link starting with https://'), findsOneWidget);
    expect(
      find.text('Enter a full image link starting with https://'),
      findsOneWidget,
    );
    expect(api.submitCalls, 0);
  });
}

class _AdvertiseApi extends Api {
  _AdvertiseApi() : super(baseUrl: 'https://example.test');

  int checkoutCalls = 0;
  int submitCalls = 0;

  @override
  Future<AdsResult> myAds() async => const AdsResult(
        ads: [_approvedAd],
        rateCard: AdRateCard.fallback,
      );

  @override
  Future<SubscriptionCheckout> adCheckout(String adId) async {
    checkoutCalls += 1;
    return const SubscriptionCheckout(
      message: 'Open checkout.',
      planId: 'ad-1',
      billingCycle: 'once',
      status: 'checkout',
      redirectUrl: 'https://payfast.example.test',
      redirectFields: {'signature': 'signed'},
    );
  }

  @override
  Future<AdSubmission> submitAd(AdDraft draft) async {
    submitCalls += 1;
    return _approvedAd;
  }
}

const _approvedAd = AdSubmission(
  id: 'ad-1',
  title: 'Local sale',
  bodyText: 'Save at our store.',
  targetUrl: 'https://shop.example.test',
  placement: 'feed',
  reach: 1000,
  amountCents: 15000,
  status: 'approved',
  createdAt: '2026-07-22T00:00:00.000Z',
);
