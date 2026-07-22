import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/auto_compare_tool.dart';

void main() {
  testWidgets('mobile compare searches selected retailers live',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    final api = _CompareApi();

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: SingleChildScrollView(child: AutoCompareTool(api: api)),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'milk 2L');
    await tester.pump();
    await tester.tap(find.text('Compare'));
    await tester.pumpAndSettle();

    expect(api.query, 'milk 2L');
    expect(api.retailerIds, ['pick-n-pay', 'checkers']);
    expect(find.text('PnP Full Cream Fresh Milk 2L'), findsOneWidget);
    expect(find.text('R32.99'), findsOneWidget);
    expect(find.text('R34.99'), findsOneWidget);
    expect(find.textContaining('Pick n Pay is cheapest'), findsOneWidget);
    expect(find.textContaining('deal database'), findsNothing);
  });
}

class _CompareApi extends Api {
  _CompareApi() : super(baseUrl: 'https://example.test');

  String? query;
  List<String>? retailerIds;

  @override
  Future<RetailerCatalog> retailers(
          {String query = '', String kind = 'all'}) async =>
      const RetailerCatalog(
        retailers: [
          Retailer(
            id: 'pick-n-pay',
            name: 'Pick n Pay',
            shortName: 'PnP',
            group: 'Supermarket',
            program: 'Smart Shopper',
            sourceNote: 'Official store',
            verifiedOn: '2026-07-22',
            accentColor: '#d71920',
            sources: [],
          ),
          Retailer(
            id: 'checkers',
            name: 'Checkers',
            shortName: 'Checkers',
            group: 'Supermarket',
            program: 'Xtra Savings',
            sourceNote: 'Official store',
            verifiedOn: '2026-07-22',
            accentColor: '#009fe3',
            sources: [],
          ),
        ],
        sourceKinds: [],
      );

  @override
  Future<ProductComparisonResult> searchProductPrices({
    required String query,
    required List<String> retailerIds,
  }) async {
    this.query = query;
    this.retailerIds = retailerIds;
    return const ProductComparisonResult(
      checkedAt: '2026-07-22T00:00:00.000Z',
      country: CountryOption(
        code: 'ZA',
        currencyCode: 'ZAR',
        flag: 'ZA',
        name: 'South Africa',
      ),
      foundCount: 2,
      matches: [
        RetailerProductSearchMatch(
          retailerId: 'pick-n-pay',
          retailerName: 'Pick n Pay',
          status: 'priced',
          isCheapest: true,
          priceCents: 3299,
          productUrl: 'https://www.pnp.co.za/milk-2l',
          sourceKind: 'official-site',
          title: 'PnP Full Cream Fresh Milk 2L',
        ),
        RetailerProductSearchMatch(
          retailerId: 'checkers',
          retailerName: 'Checkers',
          status: 'priced',
          priceCents: 3499,
          productUrl: 'https://www.checkers.co.za/milk-2l',
          sourceKind: 'official-site',
          title: 'Clover Fresh Full Cream Milk 2L',
        ),
      ],
      pricedCount: 2,
      query: 'milk 2L',
      savingsCents: 200,
      unavailableCount: 0,
      cheapestRetailerId: 'pick-n-pay',
    );
  }
}
