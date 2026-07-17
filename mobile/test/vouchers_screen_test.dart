import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/vouchers_screen.dart';

void main() {
  testWidgets('renders vouchers and asks anonymous users to log in before saving',
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

    await tester.tap(find.text('Save voucher'));
    await tester.pumpAndSettle();
    expect(api.claimed, isTrue);
    expect(find.text('Remove saved'), findsOneWidget);

    await tester.tap(find.text('Remove saved'));
    await tester.pumpAndSettle();
    expect(api.claimed, isFalse);
  });
}

class _VoucherApi extends Api {
  bool claimed = false;

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
          expiresAt: '2026-07-31T21:59:59.999Z',
          status: 'active',
          code: 'SAVE25',
          validTo: '2026-07-31',
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
