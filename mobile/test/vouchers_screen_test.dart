import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/vouchers_screen.dart';

void main() {
  testWidgets(
      'renders vouchers and asks anonymous users to log in before saving',
      (tester) async {
    var authRequested = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: VouchersScreen(
          api: _VoucherApi(),
          isAuthenticated: false,
          onRequireAuth: () => authRequested = true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    // Loyalty offers sit below the checkout codes now, so the list has to be
    // scrolled to reach them.
    await _scrollToSaveButton(tester);
    expect(find.text('SAVE25'), findsOneWidget);
    expect(find.text('Save R25 on groceries'), findsOneWidget);
    await tester.tap(find.text('Save voucher'));
    expect(authRequested, isTrue);
  });

  testWidgets('saves and removes a voucher for a member', (tester) async {
    final api = _VoucherApi();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: VouchersScreen(
          api: api,
          isAuthenticated: true,
          onRequireAuth: () {},
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await _scrollToSaveButton(tester);
    await tester.tap(find.text('Save voucher'));
    await tester.pumpAndSettle();
    expect(api.claimed, isTrue);
    expect(find.text('Remove saved'), findsOneWidget);

    await tester.tap(find.text('Remove saved'));
    await tester.pumpAndSettle();
    expect(api.claimed, isFalse);
  });

  testWidgets('shows checkout codes above the loyalty offers', (tester) async {
    // A voucher, to a shopper at checkout, is a code they paste. The loyalty
    // prices are a different thing and sit under their own heading.
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: VouchersScreen(
          api: _VoucherApi(),
          isAuthenticated: true,
          onRequireAuth: () {},
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('CHECKOUT CODES'), findsOneWidget);
    expect(find.text('IN-STORE AND ON-SITE'), findsOneWidget);
    expect(find.text('FIRST20'), findsOneWidget);
    expect(find.text('20% off your first order'), findsOneWidget);
    // Never presented as verified, because nothing verified it.
    expect(find.textContaining('Worked for 12 shoppers'), findsOneWidget);
    expect(find.textContaining('verified'), findsNothing);
  });

  testWidgets('records whether a code worked', (tester) async {
    final api = _VoucherApi();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: VouchersScreen(
          api: api,
          isAuthenticated: true,
          onRequireAuth: () {},
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('code-worked-code-1')));
    await tester.pumpAndSettle();

    expect(api.ratedWorked, isTrue);
    expect(find.textContaining('Worked for 13 shoppers'), findsOneWidget);
  });

  testWidgets('asks an anonymous shopper to sign in before rating a code',
      (tester) async {
    var authRequested = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: VouchersScreen(
          api: _VoucherApi(),
          isAuthenticated: false,
          onRequireAuth: () => authRequested = true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('code-failed-code-1')));
    await tester.pumpAndSettle();
    expect(authRequested, isTrue);
  });
}

/// Brings the loyalty voucher's save button into view. It now sits below the
/// checkout codes, and a lazy ListView does not build what is off-screen.
Future<void> _scrollToSaveButton(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.text('Save voucher'),
    300,
    scrollable: find.byType(Scrollable).first,
  );
  // scrollUntilVisible stops as soon as the widget exists, which can leave it
  // clipped at the edge and untappable.
  await tester.ensureVisible(find.text('Save voucher'));
  await tester.pumpAndSettle();
}

class _VoucherApi extends Api {
  bool claimed = false;
  bool? ratedWorked;
  int workedCount = 12;

  @override
  Future<List<VoucherCode>> voucherCodes({String? retailerId}) async => [
        VoucherCode(
          id: 'code-1',
          retailerId: 'superbalist',
          code: 'FIRST20',
          benefitText: '20% off your first order',
          workedCount: workedCount,
          failedCount: 1,
          source: 'member',
          createdAt: '2026-07-30T10:00:00.000Z',
        ),
      ];

  @override
  Future<VoucherCode?> rateVoucherCode(
      String voucherCodeId, bool worked) async {
    ratedWorked = worked;
    if (worked) workedCount += 1;
    return VoucherCode(
      id: voucherCodeId,
      retailerId: 'superbalist',
      code: 'FIRST20',
      benefitText: '20% off your first order',
      workedCount: workedCount,
      failedCount: 1,
      source: 'member',
      createdAt: '2026-07-30T10:00:00.000Z',
      yourVote: worked ? 'worked' : 'failed',
    );
  }

  @override
  Future<List<Voucher>> vouchers() async => [
        Voucher(
          id: 'voucher-1',
          retailerId: 'shoprite',
          externalId: 'winter',
          title: 'Winter voucher',
          benefitText: 'Save R25 on groceries',
          evidenceText: 'Official voucher.',
          voucherKind: 'public_code',
          redemptionMode: 'code',
          redemptionUrl: 'https://shop.test/redeem',
          sourceUrl: 'https://shop.test/vouchers',
          publicReusable: true,
          accountRequired: false,
          claimed: claimed,
          capturedAt: '2026-07-16T10:00:00.000Z',
          createdAt: '2026-07-16T10:00:00.000Z',
          updatedAt: '2026-07-16T10:00:00.000Z',
          lastSeenAt: '2026-07-16T10:00:00.000Z',
          expiresAt: '2026-12-31T21:59:59.999Z',
          status: 'active',
          code: 'SAVE25',
          validTo: '2026-12-31',
        ),
      ];

  @override
  Future<bool> claimVoucher(String voucherId) async {
    claimed = true;
    return true;
  }

  @override
  Future<bool> removeVoucherClaim(String voucherId) async {
    claimed = false;
    return true;
  }
}
