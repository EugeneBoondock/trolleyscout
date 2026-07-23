import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/member_state_sync.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/auto_compare_tool.dart';

void main() {
  testWidgets('mobile compare searches selected retailers live',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    SharedPreferences.setMockInitialValues({});
    final api = _CompareApi();
    MemberStateSync.instance.configure(api);
    addTearDown(() => MemberStateSync.instance.configure(null));

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

  testWidgets('mobile compare restores and syncs the saved store choice',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      MemberStateSync.compareRetailersKey: jsonEncode(['checkers']),
    });
    final api = _CompareApi();
    MemberStateSync.instance.configure(api);
    addTearDown(() => MemberStateSync.instance.configure(null));

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: ThemeMode.dark,
      home: Scaffold(
        body: SingleChildScrollView(child: AutoCompareTool(api: api)),
      ),
    ));
    await tester.pumpAndSettle();

    final checkers = tester.widget<FilterChip>(
      find.widgetWithText(FilterChip, 'Checkers'),
    );
    final pickNPay = tester.widget<FilterChip>(
      find.widgetWithText(FilterChip, 'Pick n Pay'),
    );
    expect(checkers.selected, isTrue);
    expect(pickNPay.selected, isFalse);
    expect(find.textContaining('saved across web and mobile'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilterChip, 'Pick n Pay'));
    await tester.pumpAndSettle();

    expect(api.stateKey, MemberStateSync.compareRetailersKey);
    expect(api.stateValue, {
      'ids': ['checkers', 'pick-n-pay'],
      'updatedAt': isA<int>(),
    });
    final preferences = await SharedPreferences.getInstance();
    expect(
        jsonDecode(preferences.getString(MemberStateSync.compareRetailersKey)!),
        {
          'ids': ['checkers', 'pick-n-pay'],
          'updatedAt': isA<int>(),
        });
  });

  testWidgets('mobile compare keeps rapid preference writes in order',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      MemberStateSync.compareRetailersKey: jsonEncode(['checkers']),
    });
    final api = _CompareApi(
      delayFirstStateWrite: true,
      remoteState: ['checkers'],
    );
    MemberStateSync.instance.configure(api);
    addTearDown(() => MemberStateSync.instance.configure(null));

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: SingleChildScrollView(child: AutoCompareTool(api: api)),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilterChip, 'Pick n Pay'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilterChip, 'Checkers'));
    await tester.pump(const Duration(milliseconds: 10));

    // Device storage reaches the latest choice without waiting for the first
    // account request to finish.
    expect(api.stateValue, isNull);
    final preferences = await SharedPreferences.getInstance();
    expect(
        jsonDecode(preferences.getString(MemberStateSync.compareRetailersKey)!),
        {
          'ids': ['pick-n-pay'],
          'updatedAt': isA<int>(),
        });

    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(api.stateValue, {
      'ids': ['pick-n-pay'],
      'updatedAt': isA<int>(),
    });
  });

  testWidgets('mobile compare keeps and retries a newer local choice',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      MemberStateSync.compareRetailersKey: jsonEncode({
        'ids': ['checkers'],
        'updatedAt': 300,
      }),
    });
    final api = _CompareApi(remoteState: {
      'ids': ['pick-n-pay'],
      'updatedAt': 200,
    });
    MemberStateSync.instance.configure(api);
    addTearDown(() => MemberStateSync.instance.configure(null));

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: SingleChildScrollView(child: AutoCompareTool(api: api)),
      ),
    ));
    await tester.pumpAndSettle();

    final checkers = tester.widget<FilterChip>(
      find.widgetWithText(FilterChip, 'Checkers'),
    );
    final pickNPay = tester.widget<FilterChip>(
      find.widgetWithText(FilterChip, 'Pick n Pay'),
    );
    expect(checkers.selected, isTrue);
    expect(pickNPay.selected, isFalse);
    expect(api.stateValue, {
      'ids': ['checkers'],
      'updatedAt': 300,
    });
  });
}

class _CompareApi extends Api {
  _CompareApi({this.delayFirstStateWrite = false, this.remoteState})
      : super(baseUrl: 'https://example.test');

  final bool delayFirstStateWrite;
  final Object? remoteState;

  String? query;
  List<String>? retailerIds;
  String? stateKey;
  Object? stateValue;
  int _stateWriteCount = 0;

  @override
  Future<Object?> getMemberState(String key) async => remoteState;

  @override
  Future<RetailerCatalog> retailers(
          {String query = '',
          String kind = 'all',
          bool summary = false}) async =>
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

  @override
  Future<void> setMemberState(String key, Object? value) async {
    _stateWriteCount += 1;
    if (delayFirstStateWrite && _stateWriteCount == 1) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    stateKey = key;
    stateValue = value;
  }
}
