import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/store_carts.dart';
import 'package:trolley_scout/store_sessions.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/store_carts_sheet.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  StoreCartLine line(String title, {int quantity = 1, String? url}) =>
      StoreCartLine(
        title: title,
        productUrl: url ?? 'https://www.pnp.co.za/$title',
        quantity: quantity,
        addedAt: DateTime.parse('2026-08-07T09:00:00.000Z'),
      );

  test('keeps a separate cart per shop', () async {
    final preferences = await SharedPreferences.getInstance();
    final carts = StoreCartStore(preferences: preferences);

    await carts.record('pick-n-pay', 'Pick n Pay', line('Braaipack 5kg'));
    await carts.record(
      'takealot',
      'Takealot',
      line('Hoodie', url: 'https://www.takealot.com/hoodie'),
    );

    expect(carts.carts.map((cart) => cart.storeName),
        containsAll(['Pick n Pay', 'Takealot']));
    expect(carts.cartFor('pick-n-pay')?.lines.single.title, 'Braaipack 5kg');
    expect(carts.totalItemCount, 2);
  });

  test('the same product added twice is one line with a bigger quantity',
      () async {
    final carts = StoreCartStore(
      preferences: await SharedPreferences.getInstance(),
    );

    await carts.record('pick-n-pay', 'Pick n Pay', line('Braaipack 5kg'));
    await carts.record(
      'pick-n-pay',
      'Pick n Pay',
      line('Braaipack 5kg', quantity: 2),
    );

    final cart = carts.cartFor('pick-n-pay');
    expect(cart?.lines, hasLength(1));
    expect(cart?.lines.single.quantity, 3);
    expect(cart?.itemCount, 3);
  });

  test('store carts survive a restart', () async {
    final preferences = await SharedPreferences.getInstance();
    await StoreCartStore(preferences: preferences)
        .record('pick-n-pay', 'Pick n Pay', line('Braaipack 5kg'));

    final reopened = StoreCartStore(preferences: preferences);
    await reopened.load();

    expect(reopened.cartFor('pick-n-pay')?.lines.single.title, 'Braaipack 5kg');
  });

  test('removing the last line drops the shop entirely', () async {
    final carts = StoreCartStore(
      preferences: await SharedPreferences.getInstance(),
    );
    await carts.record('pick-n-pay', 'Pick n Pay', line('Braaipack 5kg'));

    await carts.removeLine('pick-n-pay', line('Braaipack 5kg').productUrl);

    expect(carts.carts, isEmpty);
    expect(carts.cartFor('pick-n-pay'), isNull);
  });

  testWidgets('the sheet labels each shop and lists what went in it',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await StoreCartStore.instance
        .record('pick-n-pay', 'Pick n Pay', line('Braaipack 5kg', quantity: 2));
    await StoreCartStore.instance.record(
      'takealot',
      'Takealot',
      line('Fleece hoodie', url: 'https://www.takealot.com/hoodie'),
    );
    addTearDown(StoreCartStore.instance.clearAll);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const Scaffold(body: StoreCartsSheet()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Pick n Pay'), findsOneWidget);
    expect(find.text('Takealot'), findsOneWidget);
    expect(find.text('Braaipack 5kg'), findsOneWidget);
    expect(find.text('Fleece hoodie'), findsOneWidget);
    expect(find.text('2x'), findsOneWidget);
    expect(find.text('Open the Pick n Pay cart'), findsOneWidget);
    expect(find.textContaining('3 items across 2 shops'), findsOneWidget);
  });

  testWidgets('an empty sheet explains how to fill a store cart',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const Scaffold(body: StoreCartsSheet()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Nothing in a store cart yet'), findsOneWidget);
    expect(find.textContaining('braai pack'), findsOneWidget);
  });

  test('PEP is somewhere the shopper can sign in', () {
    // It was missing while PEP was already stocked on the fitting-room rail.
    expect(supportedStores.map((store) => store.id), contains('pep'));
    expect(storeForHost('www.pepstores.com')?.name, 'PEP');
  });

  test('a chat answer carries a cart action the app can act on', () {
    final answer = ScoutChatAnswer.fromJson({
      'reply': 'I can add that for you.',
      'cartAction': {
        'retailerId': 'pick-n-pay',
        'retailerName': 'Pick n Pay',
        'items': [
          {
            'title': 'No Name Frozen Chicken Braaipack 5kg',
            'productUrl': 'https://www.pnp.co.za/braaipack/p/1',
            'quantity': 2,
            'priceText': 'R199.99',
          },
        ],
      },
    });

    expect(answer.cartAction?.retailerName, 'Pick n Pay');
    expect(answer.cartAction?.isUsable, isTrue);
    expect(answer.cartAction?.items.single.quantity, 2);
  });

  test('a cart action with an unusable link is not offered', () {
    final answer = ScoutChatAnswer.fromJson({
      'reply': 'x',
      'cartAction': {
        'retailerId': 'pick-n-pay',
        'retailerName': 'Pick n Pay',
        'items': [
          {'title': 'Braaipack', 'productUrl': 'not-a-link', 'quantity': 1},
        ],
      },
    });

    expect(answer.cartAction?.isUsable, isFalse);
  });
}
