import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/coverage_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  testWidgets('coverage shows exact market counts and freshness',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(body: CoverageScreen(api: _CoverageApi())),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Coverage you can inspect'), findsOneWidget);
    expect(find.text('South Africa'), findsOneWidget);
    expect(find.text('Activity checked within 24 hours'), findsOneWidget);
    expect(find.text('182'), findsNWidgets(2));
    expect(find.text('241'), findsNWidgets(2));
    expect(find.text('321'), findsNWidgets(2));
  });

  testWidgets('coverage remains readable in dark mode', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: ThemeMode.dark,
      home: Scaffold(body: CoverageScreen(api: _CoverageApi())),
    ));
    await tester.pumpAndSettle();

    final context = tester.element(find.text('Coverage you can inspect'));
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(find.text('Official sources'), findsWidgets);
  });
}

class _CoverageApi extends Api {
  @override
  Future<CoverageLedger> coverage() async => const CoverageLedger(
        generatedAt: '2026-08-01T08:00:00.000Z',
        markets: [
          CoverageMarket(
            activeCatalogueCount: 321,
            activeCatalogueRetailerCount: 103,
            activeDealCount: 182,
            activeDealRetailerCount: 9,
            code: 'ZA',
            discoveredStoreCount: 241,
            flag: '🇿🇦',
            freshness: 'live',
            lastDealCapturedAt: '2026-08-01T07:45:00.000Z',
            name: 'South Africa',
            officialSourceCount: 32,
            retailerCount: 17,
            storesWithPromotionsCount: 88,
          ),
        ],
        summary: CoverageSummary(
          activeCatalogueCount: 321,
          activeDealCount: 182,
          activeMarketCount: 1,
          discoveredStoreCount: 241,
          liveMarketCount: 1,
          officialSourceCount: 32,
          retailerCount: 17,
        ),
      );
}
