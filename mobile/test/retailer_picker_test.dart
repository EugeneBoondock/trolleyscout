import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/deals_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/retailer_picker.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('store options carry a per-store deal count, sorted A–Z', () {
    final options = retailerOptionsFromDeals(_deals);

    expect(options.map((option) => option.name), [
      'Boxer',
      'Café Milano',
      'Checkers',
      'Game',
      'Makro',
      'Pick ’n Pay',
      'Spar',
      'Woolworths',
    ]);
    expect(options.first.dealCountLabel, '1 deal');
    expect(
      options.firstWhere((option) => option.id == 'checkers').dealCountLabel,
      '3 deals',
    );
  });

  test('search folds case and diacritics', () {
    final options = retailerOptionsFromDeals(_deals);

    expect(filterRetailerOptions(options, 'CAFE').map((o) => o.id),
        ['cafe-milano']);
    expect(filterRetailerOptions(options, 'pick n').map((o) => o.id),
        ['pick-n-pay']);
    expect(filterRetailerOptions(options, '').length, options.length);
  });

  testWidgets('the trigger opens the picker sheet', (tester) async {
    await _useTallViewport(tester);
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('retailer-picker-search')), findsNothing);

    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    expect(find.text('Choose a store'), findsOneWidget);
    expect(find.byKey(const Key('retailer-picker-search')), findsOneWidget);
    // "All retailers" first, then the shortcut section, then the A–Z rows.
    expect(find.byKey(const Key('retailer-option-all')), findsOneWidget);
    expect(find.text('Most deals'.toUpperCase()), findsOneWidget);
    expect(find.byKey(const Key('retailer-top-checkers')), findsOneWidget);
    expect(find.byKey(const Key('retailer-option-woolworths')), findsOneWidget);
  });

  testWidgets('typing filters the store list', (tester) async {
    await _useTallViewport(tester);
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('retailer-picker-search')), 'cafe');
    await tester.pump();

    expect(find.byKey(const Key('retailer-option-cafe-milano')), findsOneWidget);
    expect(find.byKey(const Key('retailer-option-checkers')), findsNothing);
    // Sections and shortcuts collapse into a flat result list while searching.
    expect(find.byKey(const Key('retailer-top-checkers')), findsNothing);
    expect(find.byKey(const Key('retailer-option-all')), findsNothing);
  });

  testWidgets('an unmatched query shows the empty state and can be cleared',
      (tester) async {
    await _useTallViewport(tester);
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('retailer-picker-search')), 'zzzz');
    await tester.pump();

    expect(find.text('No store matches “zzzz”.'), findsOneWidget);
    expect(find.byKey(const Key('retailer-option-checkers')), findsNothing);

    await tester.tap(find.text('Clear search'));
    await tester.pumpAndSettle();

    expect(find.textContaining('No store matches'), findsNothing);
    expect(find.byKey(const Key('retailer-option-checkers')), findsOneWidget);
  });

  testWidgets('an empty catalogue explains itself instead of showing rows',
      (tester) async {
    await _useTallViewport(tester);
    await tester.pumpWidget(_host(options: const [], totalDealCount: 0));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    expect(find.text('No deals loaded yet'), findsOneWidget);
    expect(find.text('No stores yet.'), findsOneWidget);
    expect(find.byKey(const Key('retailer-option-all')), findsNothing);
  });

  testWidgets('choosing a store reports its retailer id', (tester) async {
    await _useTallViewport(tester);
    final chosen = <String>[];
    await tester.pumpWidget(_host(onChanged: chosen.add));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('retailer-option-woolworths')));
    await tester.pumpAndSettle();

    expect(chosen, ['woolworths']);
    expect(find.byKey(const Key('retailer-picker-search')), findsNothing);
  });

  testWidgets('"All retailers" clears the filter', (tester) async {
    await _useTallViewport(tester);
    final chosen = <String>[];
    await tester
        .pumpWidget(_host(selectedId: 'checkers', onChanged: chosen.add));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('retailer-option-all')));
    await tester.pumpAndSettle();

    expect(chosen, [allRetailersId]);
  });

  testWidgets('deal counts render on the trigger and on every row',
      (tester) async {
    await _useTallViewport(tester);
    await tester.pumpWidget(_host(selectedId: 'checkers'));
    await tester.pumpAndSettle();

    expect(find.text('Checkers'), findsOneWidget);
    expect(find.text('3 deals'), findsOneWidget);

    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    expect(find.text('8 stores · 11 deals'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('retailer-option-all')),
        matching: find.text('11 deals'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const Key('retailer-option-boxer')),
        matching: find.text('1 deal'),
      ),
      findsOneWidget,
    );
    // The pick is marked, not merely highlighted.
    expect(
      find.descendant(
        of: find.byKey(const Key('retailer-option-checkers')),
        matching: find.byIcon(Icons.check_circle),
      ),
      findsOneWidget,
    );
  });

  testWidgets('a phone-sized sheet opens scrolled to the current pick',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    // One store per letter, so the pick sits thousands of pixels below the fold
    // and can only be reached if the sheet scrolled to it.
    final options = retailerOptionsFromDeals([
      for (final letter in 'abcdefghijklmnopqrstuvwxyz'.split(''))
        _deal('d-$letter', 'store-$letter', '${letter.toUpperCase()}town Grocer')
    ]);

    await tester.pumpWidget(_host(
      options: options,
      selectedId: 'store-z',
      totalDealCount: options.length,
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    final selected = find.byKey(const Key('retailer-option-store-z'));
    expect(selected, findsOneWidget);
    expect(tester.getRect(selected).top, lessThan(844));
    // The top of the list is far behind us.
    expect(find.byKey(const Key('retailer-option-all')), findsNothing);
  });

  testWidgets('the picker renders on the dark theme', (tester) async {
    await _useTallViewport(tester);
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: ThemeMode.dark,
      home: Scaffold(
        body: Center(
          child: RetailerFilterField(
            options: retailerOptionsFromDeals(_deals),
            selectedId: 'checkers',
            totalDealCount: 11,
            onChanged: (_) {},
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Choose a store'), findsOneWidget);
    expect(find.byKey(const Key('retailer-option-checkers')), findsOneWidget);
  });

  testWidgets('Find a deal filters through the picker, not a dropdown',
      (tester) async {
    await _useTallViewport(tester);
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: DealsScreen(api: _PickerApi(), isAuthenticated: true)),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Advanced filters'));
    await tester.pumpAndSettle();

    // Only Source is still a dropdown; Retailer became the picker trigger.
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
    expect(find.byKey(const Key('retailer-filter-trigger')), findsOneWidget);
    expect(find.text('Deals (5)'), findsOneWidget);

    await tester.tap(find.byKey(const Key('retailer-filter-trigger')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retailer-option-checkers')));
    await tester.pumpAndSettle();

    expect(find.text('Deals (3)'), findsOneWidget);
    expect(find.text('3 matching deals'), findsOneWidget);
    expect(find.text('Checkers'), findsOneWidget);
  });

  // A shop that happens to be running no promotion used to vanish from the
  // picker entirely, which reads as "not covered" rather than "nothing on
  // today". Mr Price prices its markdowns without ever recording a previous
  // price, so it would never once have appeared.
  test('lists a shop we scout even when it has nothing on today', () {
    final options = retailerOptionsFromDeals(
      [_deal('p1', 'pep', 'PEP')],
      catalog: [_retailer('mr-price', 'Mr Price'), _retailer('pep', 'PEP')],
    );

    expect(options.map((option) => option.id), containsAll(['mr-price', 'pep']));

    final quiet = options.firstWhere((option) => option.id == 'mr-price');
    expect(quiet.dealCount, 0);
    expect(quiet.dealCountLabel, '0 deals');

    // The shop with deals still reports the real number.
    expect(options.firstWhere((option) => option.id == 'pep').dealCount, 1);
  });

  // The name on the card and the name in the picker have to agree, so the one
  // the deal carries wins.
  test('prefers the name the deal itself carries', () {
    final options = retailerOptionsFromDeals(
      [_deal('p1', 'pep', 'PEP')],
      catalog: [_retailer('pep', 'Pep Stores')],
    );

    expect(options.single.name, 'PEP');
  });
}

Future<void> _useTallViewport(WidgetTester tester) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(420, 2000);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
}

Widget _host({
  List<RetailerOption>? options,
  String selectedId = allRetailersId,
  int totalDealCount = 11,
  ValueChanged<String>? onChanged,
}) =>
    MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: Center(
          child: RetailerFilterField(
            options: options ?? retailerOptionsFromDeals(_deals),
            selectedId: selectedId,
            totalDealCount: totalDealCount,
            onChanged: onChanged ?? (_) {},
          ),
        ),
      ),
    );

Deal _deal(String id, String retailerId, String retailerName) => Deal(
      id: id,
      title: 'Deal $id',
      retailerId: retailerId,
      retailerName: retailerName,
      sourceLabel: 'Weekly specials',
    );

final _deals = <Deal>[
  _deal('c1', 'checkers', 'Checkers'),
  _deal('c2', 'checkers', 'Checkers'),
  _deal('c3', 'checkers', 'Checkers'),
  _deal('w1', 'woolworths', 'Woolworths'),
  _deal('w2', 'woolworths', 'Woolworths'),
  _deal('b1', 'boxer', 'Boxer'),
  _deal('m1', 'cafe-milano', 'Café Milano'),
  _deal('g1', 'game', 'Game'),
  _deal('k1', 'makro', 'Makro'),
  _deal('p1', 'pick-n-pay', 'Pick ’n Pay'),
  _deal('s1', 'spar', 'Spar'),
];

class _PickerApi extends Api {
  _PickerApi() : super(baseUrl: 'https://example.test');

  @override
  Future<DiscoveryResult> discovery(
          {bool forceLive = false, bool summary = false}) async =>
      DiscoveryResult(
        deals: [
          _deal('c1', 'checkers', 'Checkers'),
          _deal('c2', 'checkers', 'Checkers'),
          _deal('c3', 'checkers', 'Checkers'),
          _deal('w1', 'woolworths', 'Woolworths'),
          _deal('w2', 'woolworths', 'Woolworths'),
        ],
        foundDealCount: 5,
        checkedSourceCount: 2,
        unavailableSourceCount: 0,
        leafletCount: 0,
      );

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async => const [];

  @override
  Future<List<PublicAd>> publicAds(String placement) async => const [];

  @override
  Future<NotificationPreferences> notificationPreferences() async =>
      const NotificationPreferences.off();
}

Retailer _retailer(String id, String name) => Retailer(
      id: id,
      name: name,
      shortName: name,
      group: 'Supermarket',
      program: '$name specials',
      sourceNote: 'Official pages.',
      verifiedOn: '2026-07-23',
      accentColor: '#000000',
      sources: const [],
    );
