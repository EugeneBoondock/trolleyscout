import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/store_agent.dart';
import 'package:trolley_scout/store_sessions.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/agent_activity_panel.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('adds a signed-in shopper\'s item to the store cart', () async {
    final store = _FakeStore(cartBadge: 0);
    final browser = _FakeBrowser(store);
    final runner = _runnerFor(browser, [_jeans]);

    await runner.run();

    expect(store.cart, 1);
    expect(runner.addedCount, 1);
    expect(runner.phase, AgentPhase.finished);
    expect(browser.loaded.single, _jeans.productUri.toString());
    // The shopper sees the whole journey, not just the result.
    expect(
      runner.log.map((entry) => entry.phase),
      containsAllInOrder([
        AgentPhase.opening,
        AgentPhase.reading,
        AgentPhase.checkingSession,
        AgentPhase.adding,
        AgentPhase.confirming,
        AgentPhase.finished,
      ]),
    );
    expect(
      runner.log.map((entry) => entry.message).join(' | '),
      contains('Signed in at shop.test'),
    );
  });

  test('waits for the buy box instead of trusting readyState', () async {
    // A React storefront reports readyState complete while the buy box is
    // still empty. An agent that believes it says "no add-to-cart button" on a
    // product that plainly has one.
    final store = _FakeStore(cartBadge: 0, addControlAppearsOnPoll: 4);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    await runner.run();

    expect(store.cart, 1);
    expect(runner.phase, AgentPhase.finished);
  });

  test('chooses the size the shopper asked for', () async {
    final store = _FakeStore(cartBadge: 0, sizes: ['S', 'M', 'L']);
    final runner = _runnerFor(
      _FakeBrowser(store),
      [
        AgentItemPlan(
          title: 'Slim fit denim jeans',
          productUri: Uri.parse('https://shop.test/jeans'),
          variant: 'M',
        )
      ],
    );

    await runner.run();

    expect(store.chosenSize, 'M');
    expect(store.cart, 1);
  });

  test('takes an in-stock size when the shopper named none', () async {
    final store = _FakeStore(
      cartBadge: 0,
      sizes: ['S', 'M'],
      soldOutSizes: {'S'},
    );
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    await runner.run();

    expect(store.chosenSize, 'M');
  });

  test('stops rather than guess when the wanted size is sold out', () async {
    final store = _FakeStore(
      cartBadge: 0,
      sizes: ['S', 'M'],
      soldOutSizes: {'M'},
    );
    final runner = _runnerFor(
      _FakeBrowser(store),
      [
        AgentItemPlan(
          title: 'Slim fit denim jeans',
          productUri: Uri.parse('https://shop.test/jeans'),
          variant: 'M',
        )
      ],
    );

    await runner.run();

    expect(store.cart, 0);
    expect(runner.results.single.outcome, AgentItemOutcome.variantUnavailable);
    expect(runner.log.last.isError, isTrue);
  });

  test('pauses for sign-in and carries on once the shopper is in', () async {
    final store = _FakeStore(cartBadge: 0, signedIn: false);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    final running = runner.run();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(runner.awaitingSignIn, isTrue,
        reason: 'the agent must never shop from a signed-out session');
    expect(store.cart, 0);

    // The shopper signs in on the store's own page, in the same WebView.
    store.signedIn = true;
    runner.continueAfterSignIn();
    await running;

    expect(store.cart, 1);
    expect(runner.phase, AgentPhase.finished);
  });

  test('gives up when the shopper never completes the sign-in', () async {
    final store = _FakeStore(cartBadge: 0, signedIn: false);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    final running = runner.run();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    runner.continueAfterSignIn(); // still signed out

    await running;

    expect(store.cart, 0);
    expect(runner.results.single.outcome, AgentItemOutcome.failed);
  });

  test('reports out of stock without touching the page', () async {
    final store = _FakeStore(cartBadge: 0, outOfStock: true);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    await runner.run();

    expect(store.cart, 0);
    expect(store.addClicks, 0);
    expect(runner.results.single.outcome, AgentItemOutcome.outOfStock);
  });

  test('says so plainly when the add button is disabled', () async {
    final store = _FakeStore(cartBadge: 0, addBlocked: true);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    await runner.run();

    expect(runner.results.single.outcome, AgentItemOutcome.noControl);
    expect(
      runner.log.map((entry) => entry.message).join(' '),
      contains('disabled'),
    );
  });

  test('adds the asked-for quantity, one confirmed press at a time', () async {
    final store = _FakeStore(cartBadge: 0);
    final runner = _runnerFor(
      _FakeBrowser(store),
      [
        AgentItemPlan(
          title: 'Milk 2L',
          productUri: Uri.parse('https://shop.test/milk'),
          quantity: 3,
        )
      ],
    );

    await runner.run();

    expect(store.addClicks, 3);
    expect(store.cart, 3);
    expect(runner.addedCount, 3);
  });

  test('will not claim a confirmation a store never gave', () async {
    // The shop hides its cart badge. The press still happened, and the agent
    // says exactly that rather than inventing a confirmation.
    final store = _FakeStore(cartBadge: null);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    await runner.run();

    expect(store.addClicks, 1);
    expect(
      runner.log.map((entry) => entry.message).join(' '),
      contains('does not show a cart count'),
    );
  });

  test('works across two different stores in one run', () async {
    final store = _FakeStore(cartBadge: 0);
    final browser = _FakeBrowser(store);
    final runner = _runnerFor(browser, [
      _jeans,
      AgentItemPlan(
        title: 'Sneakers',
        productUri: Uri.parse('https://other-shop.test/sneakers'),
      ),
    ]);

    await runner.run();

    expect(browser.loaded, [
      'https://shop.test/jeans',
      'https://other-shop.test/sneakers',
    ]);
    expect(store.cart, 2);
    expect(
      runner.log.map((entry) => entry.message).join(' | '),
      contains('other-shop.test'),
    );
  });

  test('stopping leaves the rest of the list untouched', () async {
    final store = _FakeStore(cartBadge: 0);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans, _jeans]);

    final running = runner.run();
    runner.cancel();
    await running;

    expect(runner.phase, AgentPhase.cancelled);
    expect(store.cart, lessThan(2));
  });


  test('tries another size when the shop only reveals stock after picking',
      () async {
    // PEP lists "Size 6" as pickable, then swaps its buy box for an
    // out-of-stock notice once chosen. Reporting "no add-to-cart button" on a
    // product that is plainly on sale is the wrong answer; trying the next
    // size is the right one.
    final store = _FakeStore(
      cartBadge: 0,
      sizes: ['6', '7', '8'],
      sizesThatGoOutOfStockOnPick: {'6', '7'},
    );
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    await runner.run();

    expect(store.chosenSize, '8');
    expect(store.cart, 1);
    expect(runner.phase, AgentPhase.finished);
    expect(
      runner.log.map((entry) => entry.message).join(' | '),
      contains('6 is sold out'),
    );
  });

  test('says the named size is sold out instead of silently picking another',
      () async {
    final store = _FakeStore(
      cartBadge: 0,
      sizes: ['6', '8'],
      sizesThatGoOutOfStockOnPick: {'6'},
    );
    final runner = _runnerFor(
      _FakeBrowser(store),
      [
        AgentItemPlan(
          title: 'Sandals',
          productUri: Uri.parse('https://shop.test/sandals'),
          variant: '6',
        )
      ],
    );

    await runner.run();

    expect(store.cart, 0);
    expect(runner.results.single.outcome, AgentItemOutcome.variantUnavailable);
    expect(runner.results.single.note, contains('sold out'));
  });

  testWidgets('the panel narrates each step as it happens', (tester) async {
    final store = _FakeStore(cartBadge: 0, signedIn: false);
    final runner = _runnerFor(_FakeBrowser(store), [_jeans]);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: AgentActivityPanel(
          runner: runner,
          onSignIn: runner.continueAfterSignIn,
        ),
      ),
    ));

    expect(find.text('Starting up...'), findsOneWidget);

    final running = runner.run();
    await tester.pump();
    await tester.pump();

    // Signed out: the shopper is asked to sign in, not shopped for.
    expect(find.text('Waiting for you to sign in'), findsOneWidget);
    expect(find.byKey(const ValueKey('agent-continue-after-sign-in')),
        findsOneWidget);

    store.signedIn = true;
    await tester.tap(find.byKey(const ValueKey('agent-continue-after-sign-in')));
    await running;
    await tester.pump();
    // The activity list scrolls itself to the newest line.
    await tester.pumpAndSettle();

    expect(find.text('All done'), findsOneWidget);
    expect(find.byKey(const ValueKey('agent-open-cart')), findsOneWidget);
    expect(
      find.textContaining('Added 1 item to your cart'),
      findsOneWidget,
    );
  });

  testWidgets('the panel offers a stop while the agent is working',
      (tester) async {
    final browser = _FakeBrowser(_FakeStore(cartBadge: 0));
    // Hold the agent on the store's page so the panel can be inspected
    // mid-flight, the way a shopper would see it.
    final gate = Completer<void>();
    browser.holdBeforeAdd = gate.future;
    final runner = _runnerFor(browser, [_jeans, _jeans]);
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: AgentActivityPanel(runner: runner)),
    ));

    final running = runner.run();
    await tester.pump();

    expect(find.byKey(const ValueKey('agent-stop')), findsOneWidget);
    expect(find.text('Adding to cart'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('agent-stop')));
    gate.complete();
    await running;
    await tester.pump();

    expect(runner.phase, AgentPhase.cancelled);
    expect(find.byKey(const ValueKey('agent-stop')), findsNothing);
  });

  test('store sign-ins are remembered across app restarts', () async {
    final preferences = await SharedPreferences.getInstance();
    final first = StoreSessionStore(preferences: preferences);
    await first.remember('checkers', accountLabel: 'Eugene');

    // A fresh launch reads the same store of record.
    final second = StoreSessionStore(preferences: preferences);
    await second.load();

    expect(second.isSignedIn('checkers'), isTrue);
    expect(second.recordFor('checkers')?.accountLabel, 'Eugene');
    expect(second.isSignedIn('woolworths'), isFalse);

    await second.forget('checkers');
    final third = StoreSessionStore(preferences: preferences);
    await third.load();
    expect(third.isSignedIn('checkers'), isFalse);
  });

  test('a product host maps to the store the shopper signed into', () {
    expect(storeForHost('www.checkers.co.za')?.id, 'checkers');
    expect(storeForHost('takealot.com')?.id, 'takealot');
    expect(storeForHost('unknown-shop.test'), isNull);
  });
}

final _jeans = AgentItemPlan(
  title: 'Slim fit denim jeans',
  productUri: Uri.parse('https://shop.test/jeans'),
);

StoreAgentRunner _runnerFor(AgentBrowser browser, List<AgentItemPlan> items) =>
    StoreAgentRunner(
      browser: browser,
      items: items,
      // Tests drive the clock, not the wall.
      wait: (_) async {},
      pollAttempts: 8,
    );

/// A storefront in miniature: the states the agent has to survive on a real
/// shop, with none of the HTML.
class _FakeStore {
  _FakeStore({
    required this.cartBadge,
    this.signedIn = true,
    this.sizes = const [],
    this.soldOutSizes = const {},
    this.sizesThatGoOutOfStockOnPick = const {},
    this.outOfStock = false,
    this.addBlocked = false,
    this.addControlAppearsOnPoll = 0,
  });

  bool signedIn;
  final List<String> sizes;
  final Set<String> soldOutSizes;

  /// Sizes the shop offers but refuses once chosen.
  final Set<String> sizesThatGoOutOfStockOnPick;
  final bool outOfStock;
  final bool addBlocked;

  /// null models a shop that never shows a cart count.
  final int? cartBadge;
  int overlays = 0;

  /// How many page-state reads happen before the buy box renders.
  final int addControlAppearsOnPoll;

  String? chosenSize;
  int cart = 0;
  int addClicks = 0;
  int stateReads = 0;
}

class _FakeBrowser implements AgentBrowser {
  _FakeBrowser(this.store);

  final _FakeStore store;
  final List<String> loaded = [];
  final List<String> scripts = [];

  /// Lets a test freeze the agent right before it presses add.
  Future<void>? holdBeforeAdd;

  @override
  Future<void> load(Uri uri) async {
    loaded.add(uri.toString());
    store.stateReads = 0;
  }

  @override
  Future<Object?> evaluate(String script) async {
    final name = RegExp(r'/\*ts:([a-z-]+)\*/').firstMatch(script)?.group(1);
    scripts.add(name ?? 'unknown');
    if (name == 'add-to-cart' && holdBeforeAdd != null) {
      await holdBeforeAdd;
      holdBeforeAdd = null;
    }
    return switch (name) {
      'page-state' => _pageState(),
      'dismiss-overlays' => _dismiss(),
      'select-variant' => _selectVariant(script),
      'add-to-cart' => _addToCart(),
      'cart-count' => jsonEncode({
          'status': 'ok',
          'count': store.cartBadge == null ? null : store.cart,
        }),
      _ => jsonEncode({'status': 'ok'}),
    };
  }

  String _pageState() {
    store.stateReads += 1;
    final buyBoxUp = store.stateReads > store.addControlAppearsOnPoll;
    return jsonEncode({
      'ready': true,
      'url': loaded.isEmpty ? 'about:blank' : loaded.last,
      'signedIn': store.signedIn,
      'accountLabel': null,
      'onLoginPage': !store.signedIn,
      'cartCount': store.cartBadge == null ? null : store.cart,
      'outOfStock': store.outOfStock ||
          (store.chosenSize != null &&
              store.sizesThatGoOutOfStockOnPick.contains(store.chosenSize)),
      'needsVariant': store.sizes.isNotEmpty && store.chosenSize == null,
      'addControlCount': buyBoxUp &&
              !store.outOfStock &&
              !store.addBlocked &&
              !(store.chosenSize != null &&
                  store.sizesThatGoOutOfStockOnPick.contains(store.chosenSize))
          ? 1
          : 0,
      'blockedAddControl': buyBoxUp && store.addBlocked,
      'overlayCount': store.overlays,
    });
  }

  String _dismiss() {
    final closed = store.overlays;
    store.overlays = 0;
    return jsonEncode({'status': 'ok', 'dismissed': closed});
  }

  String _selectVariant(String script) {
    final wanted =
        RegExp(r"const wanted = '([^']*)'").firstMatch(script)?.group(1) ?? '';
    final triedRaw =
        RegExp(r"const tried = '([^']*)'").firstMatch(script)?.group(1) ?? '';
    final tried = triedRaw
        .split('')
        .where((value) => value.trim().isNotEmpty)
        .map((value) => value.toLowerCase())
        .toSet();
    final options = store.sizes.where((size) =>
        !store.soldOutSizes.contains(size) &&
        !tried.contains(size.toLowerCase()) &&
        (wanted.isEmpty || size.toLowerCase() == wanted.toLowerCase()));
    if (options.isEmpty) {
      return jsonEncode({
        'status': store.sizes.isEmpty ? 'not-found' : 'unavailable',
        'label': wanted.isEmpty ? null : wanted,
      });
    }
    store.chosenSize = options.first;
    return jsonEncode({'status': 'selected', 'label': options.first});
  }

  String _addToCart() {
    if (store.addBlocked) {
      return jsonEncode({'status': 'blocked', 'label': 'add to cart'});
    }
    store.addClicks += 1;
    store.cart += 1;
    return jsonEncode({'status': 'clicked', 'label': 'add to cart'});
  }
}
