import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/admin_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  testWidgets('admin reviews a deal report against its source', (tester) async {
    final api = _DealReportApi();
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(body: DealReportsAdminTab(api: api)),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Rice 2 kg'), findsOneWidget);
    expect(find.text('Offer has ended'), findsOneWidget);
    expect(find.text('Retailer source'), findsOneWidget);
    await tester.tap(find.byKey(const Key('confirm-deal-report-report-1')));
    await tester.pumpAndSettle();

    expect(api.reviewedStatus, 'confirmed');
    expect(find.text('No deal reports need review.'), findsOneWidget);
  });
}

class _DealReportApi extends Api {
  _DealReportApi() : super(baseUrl: 'https://example.test');

  String? reviewedStatus;

  @override
  Future<List<DealReport>> adminDealReports() async => const [
        DealReport(
          id: 'report-1',
          dealId: 'deal-1',
          countryCode: 'ZA',
          retailerName: 'Shop',
          title: 'Rice 2 kg',
          sourceUrl: 'https://shop.example/specials',
          productUrl: 'https://shop.example/product/1',
          reason: 'expired',
          note: 'The shelf label ended yesterday.',
          status: 'pending',
          createdAt: '2026-08-01T10:00:00.000Z',
        ),
      ];

  @override
  Future<List<DealReport>> reviewDealReport(String id, String status) async {
    reviewedStatus = status;
    return const [];
  }
}
