import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/clothing_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('renders the scouted rail with a try-on where it fits',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(_wrap(ClothingScreen(api: _ClothingApi())));
    await tester.pumpAndSettle();

    expect(find.text('See it on you first'), findsOneWidget);
    expect(find.text('Slim fit denim jeans'), findsOneWidget);
    expect(find.text('Canvas sneaker'), findsOneWidget);
    expect(find.text('R299.00'), findsOneWidget);
    expect(find.text('Mr Price'), findsOneWidget);

    // The model dresses a body, not feet: the jeans offer a fitting, the
    // sneaker is browse-only.
    expect(find.text('Try it on'), findsOneWidget);
    expect(find.byIcon(Icons.checkroom), findsOneWidget);
    expect(find.text('View in store'), findsOneWidget);
  });

  testWidgets('asks the server to filter by who the clothing is for',
      (tester) async {
    final api = _ClothingApi();
    await tester.pumpWidget(_wrap(ClothingScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Men'));
    await tester.pumpAndSettle();

    // Filtering is a server query, not a local sift, so the rail is re-asked
    // for with the chosen audience.
    expect(api.audiences.last, 'men');
  });

  testWidgets('searches the whole rail server-side as the shopper types',
      (tester) async {
    final api = _ClothingApi();
    await tester.pumpWidget(_wrap(ClothingScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('clothing-search')), 'nike');
    // Debounced, so nothing is asked for until typing settles.
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    expect(api.queries.last, 'nike');
  });

  testWidgets('keeps outfit building behind the Scout plan', (tester) async {
    var upgraded = false;
    await tester.pumpWidget(_wrap(ClothingScreen(
      api: _ClothingApi(),
      canBuildOutfits: false,
      onUpgrade: () => upgraded = true,
    )));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('outfit-mode-toggle')));
    await tester.pumpAndSettle();

    // No picker appears; the shopper is pointed at the plan instead.
    expect(find.text('Add to outfit'), findsNothing);
    expect(upgraded, isTrue);
  });

  testWidgets('builds an outfit from several garments', (tester) async {
    await tester.pumpWidget(_wrap(ClothingScreen(api: _ClothingApi())));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('outfit-mode-toggle')));
    await tester.pumpAndSettle();
    expect(find.text('Add to outfit'), findsOneWidget);

    await tester.tap(find.text('Add to outfit'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('outfit-tray')), findsOneWidget);
    expect(find.text('Wear 1'), findsOneWidget);
  });

  testWidgets('shows the empty rail while the scout is still stocking it',
      (tester) async {
    await tester.pumpWidget(
        _wrap(ClothingScreen(api: _ClothingApi(items: const []))));
    await tester.pumpAndSettle();

    expect(find.textContaining('rail is being stocked'), findsOneWidget);
  });

  testWidgets('shows the error pane with a retry when the rail fails',
      (tester) async {
    await tester
        .pumpWidget(_wrap(ClothingScreen(api: _ClothingApi(fail: true))));
    await tester.pumpAndSettle();

    expect(find.text('The fitting room rail is unavailable right now.'),
        findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: TS.lightTheme(),
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: true),
        child: Scaffold(body: child),
      ),
    ),
  );
}

const _railItems = [
  ClothingItem(
    id: 'mrp:1',
    title: 'Slim fit denim jeans',
    retailerId: 'mrp',
    retailerName: 'Mr Price',
    priceCents: 29900,
    imageUrl: 'https://cdn.example.test/jeans.jpg',
    productUrl: 'https://mrp.test/jeans',
    audience: 'any',
    garmentType: 'bottoms',
  ),
  ClothingItem(
    id: 'ack:2',
    title: 'Canvas sneaker',
    retailerId: 'ackermans',
    retailerName: 'Ackermans',
    priceCents: 19900,
    imageUrl: 'https://cdn.example.test/sneaker.jpg',
    productUrl: 'https://ackermans.test/sneaker',
    audience: 'any',
    garmentType: 'footwear',
  ),
];

class _ClothingApi extends Api {
  _ClothingApi({this.items = _railItems, this.fail = false})
      : super(baseUrl: 'https://example.test');

  final List<ClothingItem> items;
  final bool fail;
  final List<String> audiences = [];
  final List<String> queries = [];

  @override
  Future<ClothingRail> clothingRail({
    String retailerId = 'all',
    String audience = 'any',
    String garmentType = 'any',
    String query = '',
    bool tryOnableOnly = false,
    int limit = 60,
    int offset = 0,
  }) async {
    audiences.add(audience);
    queries.add(query);
    if (fail) throw const ApiException('The rail is offline.');
    final visible = audience == 'any'
        ? items
        : items.where((item) => item.audience == audience).toList();
    return ClothingRail(
      items: visible,
      retailers: items.isEmpty
          ? const []
          : const [
              ClothingRetailerCount(id: 'mrp', name: 'Mr Price', count: 1),
              ClothingRetailerCount(
                  id: 'ackermans', name: 'Ackermans', count: 1),
            ],
    );
  }
}
