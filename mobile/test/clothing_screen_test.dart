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

  testWidgets('renders only clothing deals as cards with a try-on button',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(_wrap(ClothingScreen(api: _ClothingApi())));
    await tester.pumpAndSettle();

    expect(find.text('Dress for less'), findsOneWidget);
    expect(find.text('Slim fit denim jeans'), findsOneWidget);
    expect(find.text('Canvas sneaker'), findsOneWidget);
    // The grocery deal is classified out of the clothing rail.
    expect(find.text('Full cream milk 2L'), findsNothing);
    expect(find.text('R299'), findsOneWidget);
    expect(find.text('Mr Price'), findsOneWidget);

    // Both garments have images, so both cards offer the fitting room.
    expect(find.text('Try it on'), findsNWidgets(2));
    expect(find.byIcon(Icons.checkroom), findsNWidgets(2));
  });

  testWidgets('shows the empty rail when no clothing deals are found',
      (tester) async {
    await tester
        .pumpWidget(_wrap(ClothingScreen(api: _ClothingApi(feedDeals: const []))));
    await tester.pumpAndSettle();

    expect(find.textContaining('No clothing deals'), findsOneWidget);
  });

  testWidgets('shows the error pane with a retry when the feed fails',
      (tester) async {
    await tester
        .pumpWidget(_wrap(ClothingScreen(api: _ClothingApi(fail: true))));
    await tester.pumpAndSettle();

    expect(
        find.text('Clothing deals are unavailable right now.'), findsOneWidget);
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

const _clothingDeals = [
  Deal(
    id: 'deal-1',
    title: 'Slim fit denim jeans',
    retailerName: 'Mr Price',
    priceText: 'R299',
    imageUrl: 'https://cdn.example.test/jeans.jpg',
  ),
  Deal(
    id: 'deal-2',
    title: 'Canvas sneaker',
    retailerName: 'Ackermans',
    priceText: 'R199',
    imageUrl: 'https://cdn.example.test/sneaker.jpg',
  ),
  Deal(
    id: 'deal-3',
    title: 'Full cream milk 2L',
    retailerName: 'Shoprite',
    priceText: 'R32',
    imageUrl: 'https://cdn.example.test/milk.jpg',
  ),
];

class _ClothingApi extends Api {
  _ClothingApi({this.feedDeals = _clothingDeals, this.fail = false})
      : super(baseUrl: 'https://example.test');

  final List<Deal> feedDeals;
  final bool fail;

  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    if (fail) throw const ApiException('The feed is unreachable.');
    return DiscoveryResult(
      deals: feedDeals,
      foundDealCount: feedDeals.length,
      checkedSourceCount: 1,
      unavailableSourceCount: 0,
      leafletCount: 0,
    );
  }
}
