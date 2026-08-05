import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/discovery_cache.dart';
import 'package:trolley_scout/screens/window_shopping_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/window_seen_store.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({
        'window_music_muted': true,
      }));

  test('window deal links allow only hosted web URLs', () {
    expect(safeWindowWebUri('https://example.test/deal')?.host, 'example.test');
    expect(safeWindowWebUri('http://example.test/deal')?.host, 'example.test');
    expect(safeWindowWebUri('intent://scan/#Intent;scheme=zxing;end'), isNull);
    expect(safeWindowWebUri('javascript:alert(1)'), isNull);
    expect(safeWindowWebUri('/relative/deal'), isNull);
  });

  // Said on the card, before the shopper taps through and finds it gone.
  testWidgets('badges a sold-out deal in the reel', (tester) async {
    final api = _WindowApi(initialDeals: const [_soldOutDeal]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('scroll-sold-out-deal-gone')), findsOneWidget);
    expect(find.text('SOLD OUT'), findsOneWidget);
  });

  testWidgets('drops the saving from a sold-out card', (tester) async {
    // A discount on something nobody can buy is not the news, and the reel is
    // scrolled fast enough that a second badge reads as an offer.
    final api = _WindowApi(initialDeals: const [_soldOutDeal]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(find.text('40% off'), findsNothing);
  });

  testWidgets('leaves an in-stock deal showing its saving', (tester) async {
    const stocked = ScrollDeal(
      id: 'deal-stocked',
      title: 'Stocked deal',
      retailerName: 'Example Store',
      sourceLabel: 'Example',
      source: 'onedayonly',
      productUrl: 'https://example.test/deal-stocked',
      imageUrl: 'https://example.test/deal-stocked.jpg',
      savingText: '40% off',
    );
    final api = _WindowApi(initialDeals: const [stocked]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('scroll-sold-out-deal-stocked')), findsNothing);
    expect(find.text('40% off'), findsOneWidget);
  });

  testWidgets('search text stays visible in light and dark themes',
      (tester) async {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      final api = _WindowApi(initialDeals: const [_deal1]);
      await tester.pumpWidget(
        _wrap(_window(api), brightness: brightness),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Search the window'));
      await tester.pump();

      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.style?.color, Colors.white);
      expect(field.decoration?.filled, isTrue);
      expect(field.decoration?.fillColor, Colors.transparent);
      await tester.enterText(find.byType(TextField), 'coffee');
      expect(find.text('coffee'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
  });

  testWidgets('labels a Bob Shop auction amount as a current bid in the reel',
      (tester) async {
    final api = _WindowApi(initialDeals: const [_bidDeal]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('window-price-qualifier-bobshop-bid')),
      findsOneWidget,
    );
    expect(find.text('Current bid'), findsOneWidget);
  });

  testWidgets('saves a window item to the member saved-deals list',
      (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1],
      windowSavedDeals: const [_deal1],
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(find.text('Save to saved deals'), findsNothing);
    final windowCard = tester.widget<Container>(
      find.byKey(const ValueKey('window-card-deal-1')),
    );
    expect(windowCard.clipBehavior, Clip.antiAlias);
    expect(
      (windowCard.decoration! as BoxDecoration).borderRadius,
      isNotNull,
    );

    await tester.tap(find.byTooltip('Saved deals'));
    await tester.pumpAndSettle();

    expect(find.text('Saved from window shopping'), findsOneWidget);
    final saveButton =
        find.byKey(const ValueKey('window-save-to-deals-deal-1'));
    expect(saveButton, findsOneWidget);
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(api.savedDealTitles, ['Seen deal']);
    expect(find.text('Saved to your deals.'), findsOneWidget);
  });

  testWidgets('filters deals seen during an earlier app visit', (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1, _deal2],
      initiallySeen: const {'deal-1'},
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(find.text('Seen deal'), findsNothing);
    expect(find.text('Unseen deal'), findsOneWidget);
    expect(tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        _reelDealCount(1));
  });

  testWidgets('records each displayed deal and does not wrap the reel',
      (tester) async {
    final api = _WindowApi(initialDeals: const [_deal1, _deal2]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();

    expect(api.seenStore.ids, containsAll(<String>['deal-1', 'deal-2']));
    expect(find.byType(PageView), findsOneWidget);
    expect(tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        _reelDealCount(2));

    // Swiping past the last deal lands on the end-of-window card rather than
    // wrapping back to the first deal.
    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(
      tester.widget<PageView>(find.byType(PageView)).controller?.page,
      closeTo(2, 0.01),
    );
    expect(find.text('That’s the whole window'), findsOneWidget);
    expect(
        find.text('You’ve seen all 2 deals in this window.'), findsOneWidget);
  });

  testWidgets('keeps the full window inside the member deal allowance',
      (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1, _deal2],
      discoveryAccess: const DiscoveryAccess(
        availableCatalogueCount: 0,
        availableDealCount: 2,
        catalogueLimit: 50,
        dealLimit: 1,
        planId: 'free',
      ),
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(
      tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
      _reelDealCount(1),
    );
  });

  testWidgets('pulling down on the first deal asks the server for what is live',
      (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1],
      refreshedDeals: const [_deal2],
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();
    expect(find.text('Seen deal'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(0, 600));
    await tester.pumpAndSettle();

    // A pull to refresh is the shopper asking for what is there now, so the
    // second read bypasses both the stored copy and the server's cache.
    expect(api.dealSiteForceLiveCalls, [false, true]);
    expect(api.discoveryForceLiveCalls, [false, true]);
    expect(find.text('Unseen deal'), findsOneWidget);
  });

  testWidgets('overlapping refresh gestures share one live request',
      (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1],
      refreshedDeals: const [_deal2],
      holdForcedDealSites: true,
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    final state = tester.state(find.byType(WindowShoppingScreen));
    final firstRefresh = (state as dynamic).refreshForTest() as Future<void>;
    final secondRefresh = (state as dynamic).refreshForTest() as Future<void>;
    var secondCompleted = false;
    unawaited(secondRefresh.then((_) => secondCompleted = true));
    await tester.pump();

    // The point here is deduplication: the second gesture must join the
    // in-flight refresh rather than firing its own request.
    expect(api.dealSiteForceLiveCalls, [false, true]);
    expect(secondCompleted, isFalse);
    api.completeForcedDealSites();
    await Future.wait([firstRefresh, secondRefresh]);
    await tester.pumpAndSettle();
  });

  testWidgets('product galleries swipe horizontally and show dots, not arrows',
      (tester) async {
    final api = _WindowApi(initialDeals: const [_galleryDeal]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    final horizontalPager = find.byWidgetPredicate(
      (widget) =>
          widget is PageView && widget.scrollDirection == Axis.horizontal,
    );
    expect(horizontalPager, findsOneWidget);

    // The dots say how many pictures there are and which one is showing.
    expect(find.byKey(const ValueKey('window-image-dot-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('window-image-dot-1')), findsOneWidget);
    expect(find.bySemanticsLabel('Product image 1 of 2'), findsOneWidget);

    // No chevrons over the product. Swiping is how anyone moves through a
    // full-bleed feed, and arrows only cover the thing being looked at.
    expect(find.byTooltip('Previous image'), findsNothing);
    expect(find.byTooltip('Next image'), findsNothing);
    expect(find.byIcon(Icons.chevron_left), findsNothing);

    expect(
      tester.widgetList<Image>(find.byType(Image)).every(
            (image) => image.fit == BoxFit.contain,
          ),
      isTrue,
    );

    // Swiping still moves through the gallery, and back again.
    await tester.drag(horizontalPager, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(
      tester.widget<PageView>(horizontalPager).controller?.page,
      closeTo(1, 0.01),
    );

    await tester.drag(horizontalPager, const Offset(500, 0));
    await tester.pumpAndSettle();
    expect(
      tester.widget<PageView>(horizontalPager).controller?.page,
      closeTo(0, 0.01),
    );
  });

  testWidgets('opens a distraction-free showcase with swipe and zoom controls',
      (tester) async {
    final api = _WindowApi(initialDeals: const [_galleryDeal]);
    final platformCalls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      platformCalls.add(call);
      return null;
    });
    addTearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('View product full screen'));
    await tester.pumpAndSettle();

    final showcase =
        find.byKey(const ValueKey('window-product-showcase-gallery-deal'));
    expect(showcase, findsOneWidget);
    expect(
      find.descendant(of: showcase, matching: find.byType(InteractiveViewer)),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: showcase,
        matching: find.byKey(const ValueKey('window-showcase-page-0')),
      ),
      findsOneWidget,
    );
    expect(find.byTooltip('Close full screen'), findsOneWidget);
    final voiceButton = find.byTooltip('Ask Mr Scout about this product');
    expect(voiceButton, findsOneWidget);
    expect(find.byTooltip('Zoom out'), findsOneWidget);
    expect(find.byTooltip('Reset zoom'), findsOneWidget);
    expect(find.byTooltip('Zoom in'), findsOneWidget);
    expect(
      platformCalls.any(
        (call) =>
            call.method == 'SystemChrome.setEnabledSystemUIMode' &&
            call.arguments == 'SystemUiMode.immersiveSticky',
      ),
      isTrue,
    );
    final logicalHeight =
        tester.view.physicalSize.height / tester.view.devicePixelRatio;
    expect(
      tester.getBottomRight(voiceButton).dy,
      lessThanOrEqualTo(logicalHeight - 20),
      reason: 'Showcase controls must stay above Android gesture navigation.',
    );

    await tester.tap(voiceButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.byKey(const ValueKey('scout-voice-sheet')), findsOneWidget);
    await tester.tap(find.byTooltip('Close voice chat'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    final showcasePager =
        find.descendant(of: showcase, matching: find.byType(PageView));
    await tester.drag(showcasePager, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: showcase,
        matching: find.byKey(const ValueKey('window-showcase-page-1')),
      ),
      findsOneWidget,
    );

    await tester.tap(find.byTooltip('Zoom in'));
    await tester.pumpAndSettle();
    final firstViewer = tester.widget<InteractiveViewer>(
      find
          .descendant(of: showcase, matching: find.byType(InteractiveViewer))
          .first,
    );
    expect(firstViewer.transformationController!.value.getMaxScaleOnAxis(),
        greaterThan(1));

    await tester.tap(find.byTooltip('Close full screen'));
    await tester.pumpAndSettle();
    expect(showcase, findsNothing);
    expect(
      platformCalls.any(
        (call) =>
            call.method == 'SystemChrome.setEnabledSystemUIMode' &&
            call.arguments == 'SystemUiMode.edgeToEdge',
      ),
      isTrue,
    );
  });

  testWidgets('product images begin fitted and ease outward', (tester) async {
    await tester.pumpWidget(_wrap(
      WindowProductImage(
        url: 'https://example.test/decoded.png',
        imageProvider: MemoryImage(base64Decode(_onePixelPng)),
      ),
      disableAnimations: false,
    ));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    await tester.pump();

    final imageScale = find.byKey(
      const ValueKey('window-image-scale-https://example.test/decoded.png'),
    );
    ScaleTransition transition = tester.widget(imageScale);
    expect(transition.scale.value, closeTo(1, 0.01));
    final image = tester.widget<Image>(find.byType(Image).first);
    expect(image.fit, BoxFit.contain);

    await tester.pump(const Duration(seconds: 1));
    transition = tester.widget(imageScale);
    expect(transition.scale.value, lessThan(1));
  });

  testWidgets('a decoded offscreen image waits until it becomes active',
      (tester) async {
    var active = false;
    late StateSetter update;
    final provider = MemoryImage(base64Decode(_onePixelPng));

    await tester.pumpWidget(_wrap(
      StatefulBuilder(
        builder: (context, setState) {
          update = setState;
          return WindowProductImage(
            key: const ValueKey('delayed-window-image'),
            url: 'https://example.test/offscreen.png',
            active: active,
            imageProvider: provider,
          );
        },
      ),
      disableAnimations: false,
    ));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 14));

    final imageScale = find.byKey(
      const ValueKey('window-image-scale-https://example.test/offscreen.png'),
    );
    expect(
      tester.widget<ScaleTransition>(imageScale).scale.value,
      closeTo(1, 0.01),
    );

    update(() => active = true);
    await tester.pump();
    expect(
      tester.widget<ScaleTransition>(imageScale).scale.value,
      closeTo(1, 0.01),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(tester.widget<ScaleTransition>(imageScale).scale.value, lessThan(1));
  });

  testWidgets('gallery dots stay above details on a compact phone',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = _WindowApi(initialDeals: const [_galleryDeal]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    final dots = find.byKey(const ValueKey('window-image-dots'));
    final details = find.byKey(const ValueKey('window-deal-details'));
    final controls = find.byKey(const ValueKey('window-top-controls'));
    expect(dots, findsOneWidget);
    expect(details, findsOneWidget);
    expect(controls, findsOneWidget);
    expect(tester.getTopLeft(dots).dy,
        greaterThan(tester.getBottomLeft(controls).dy));
    expect(
        tester.getBottomLeft(dots).dy, lessThan(tester.getTopLeft(details).dy));
  });

  testWidgets('a downward swipe from a later deal does not refresh',
      (tester) async {
    final api = _WindowApi(initialDeals: const [_deal1, _deal2]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();

    await tester.drag(find.byType(PageView), const Offset(0, 600));
    await tester.pumpAndSettle();

    expect(api.dealSiteForceLiveCalls, [false]);
  });

  testWidgets('refreshing without unseen IDs moves to the caught-up state',
      (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1],
      refreshedDeals: const [_deal1],
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(PageView), const Offset(0, 600));
    await tester.pumpAndSettle();

    expect(find.text('You’re all caught up.'), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, 600));
    await tester.pumpAndSettle();
    // First read is the stored feed; both pull-to-refresh gestures ask the
    // server for what is live.
    expect(api.dealSiteForceLiveCalls, [false, true, true]);
  });

  testWidgets('a long app background refreshes and skips the displayed card',
      (tester) async {
    var now = DateTime(2026, 7, 19, 10);
    final api = _WindowApi(
      initialDeals: const [_deal1, _deal2, _deal3, _deal4],
    );

    await tester.pumpWidget(_wrap(_window(api, now: () => now)));
    await tester.pumpAndSettle();
    final firstTitle = _currentDealTitle(tester);
    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(
      tester.widget<PageView>(find.byType(PageView)).controller?.page,
      closeTo(1, 0.01),
    );

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    now = now.add(const Duration(hours: 3));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(api.dealSiteForceLiveCalls, [false, false]);
    expect(find.text(firstTitle), findsNothing);
    expect(
      tester.widget<PageView>(find.byType(PageView)).controller?.page,
      closeTo(0, 0.01),
    );
  });

  testWidgets('a failed long-resume fetch keeps only unviewed cards',
      (tester) async {
    var now = DateTime(2026, 7, 19, 10);
    final api = _WindowApi(
      initialDeals: const [_deal1, _deal2, _deal3, _deal4],
      failDealSitesAfterFirst: true,
      failDiscoveryAfterFirst: true,
    );

    await tester.pumpWidget(_wrap(_window(api, now: () => now)));
    await tester.pumpAndSettle();
    final firstTitle = _currentDealTitle(tester);
    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();
    final secondTitle = _currentDealTitle(tester);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    now = now.add(const Duration(hours: 3));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.text(firstTitle), findsNothing);
    expect(find.text(secondTitle), findsNothing);
    expect(tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        _reelDealCount(2));
    expect(
      tester.widget<PageView>(find.byType(PageView)).controller?.page,
      closeTo(0, 0.01),
    );
  });

  testWidgets('a partial refresh keeps unseen cards from the failed source',
      (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1, _deal2, _deal3],
      refreshedDeals: const [_deal4],
      failDealSitesAfterFirst: true,
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(PageView), const Offset(0, 600));
    await tester.pumpAndSettle();

    expect(tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        _reelDealCount(2));
  });

  testWidgets('caught-up state stays pull-to-refreshable in light mode',
      (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1],
      initiallySeen: const {'deal-1'},
    );

    await tester.pumpWidget(_wrap(
      _window(api),
      brightness: Brightness.light,
    ));
    await tester.pumpAndSettle();

    expect(find.text('You’re all caught up.'), findsOneWidget);
    expect(find.text('Pull down to check for fresh deals.'), findsOneWidget);
    expect(find.text('Saved deals'), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
  });
}

WindowShoppingScreen _window(
  _WindowApi api, {
  DateTime Function()? now,
}) {
  return WindowShoppingScreen(
    api: api,
    cacheStore: _MemoryDiscoveryCache(),
    seenStore: api.seenStore,
    now: now,
  );
}

class _MemoryDiscoveryCache extends DiscoveryCache {
  @override
  Future<CachedDiscovery?> load([
    String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async =>
      null;

  @override
  Future<void> save(
    DiscoveryResult result,
    DateTime fetchedAt, [
    String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async {}
}

/// Matches the reel's page count. The reel always builds one page past the
/// last deal — the end-of-window card that offers somewhere to go next — so the
/// number of deal cards is one less than the child count.
Matcher _reelDealCount(int deals) => isA<SliverChildBuilderDelegate>().having(
      (delegate) => delegate.childCount,
      'deal cards plus the end-of-window card',
      deals + 1,
    );

/// The title on the card currently filling the reel. Neighbouring pages are
/// pre-built so a swipe never waits on a decode, which means several cards sit
/// in the tree at once — only the current one is actually on screen.
String _currentDealTitle(WidgetTester tester) {
  final height = tester.view.physicalSize.height / tester.view.devicePixelRatio;
  for (final title in const [
    'Seen deal',
    'Unseen deal',
    'Third deal',
    'Fourth deal',
  ]) {
    final finder = find.text(title);
    if (finder.evaluate().isEmpty) continue;
    final dy = tester.getCenter(finder).dy;
    if (dy >= 0 && dy <= height) return title;
  }
  throw StateError('No deal card is visible.');
}

Widget _wrap(
  Widget child, {
  Brightness brightness = Brightness.dark,
  bool disableAnimations = true,
}) {
  return MaterialApp(
    theme: brightness == Brightness.light ? TS.lightTheme() : TS.darkTheme(),
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(disableAnimations: disableAnimations),
        child: Scaffold(body: child),
      ),
    ),
  );
}

class _WindowApi extends Api {
  _WindowApi({
    required this.initialDeals,
    this.discoveryAccess,
    this.refreshedDeals = const [],
    this.failDealSitesAfterFirst = false,
    this.failDiscoveryAfterFirst = false,
    this.holdForcedDealSites = false,
    this.windowSavedDeals = const [],
    Set<String> initiallySeen = const {},
  })  : seenStore = _MemorySeenStore(initiallySeen),
        super(baseUrl: 'https://example.test');

  final List<ScrollDeal> initialDeals;
  final DiscoveryAccess? discoveryAccess;
  final List<ScrollDeal> refreshedDeals;
  final bool failDealSitesAfterFirst;
  final bool failDiscoveryAfterFirst;
  final bool holdForcedDealSites;
  final List<ScrollDeal> windowSavedDeals;
  final _MemorySeenStore seenStore;
  final List<bool> dealSiteForceLiveCalls = [];
  final List<bool> discoveryForceLiveCalls = [];
  final List<String> savedDealTitles = [];
  final Completer<List<ScrollDeal>> _forcedDealSitesCompleter =
      Completer<List<ScrollDeal>>();

  void completeForcedDealSites() {
    if (!_forcedDealSitesCompleter.isCompleted) {
      _forcedDealSitesCompleter.complete(refreshedDeals);
    }
  }

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async {
    dealSiteForceLiveCalls.add(forceLive);
    if (failDealSitesAfterFirst && dealSiteForceLiveCalls.length > 1) {
      throw StateError('deal sites unavailable');
    }
    if (dealSiteForceLiveCalls.length > 1 && holdForcedDealSites) {
      return _forcedDealSitesCompleter.future;
    }
    return dealSiteForceLiveCalls.length > 1 && refreshedDeals.isNotEmpty
        ? refreshedDeals
        : initialDeals;
  }

  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    discoveryForceLiveCalls.add(forceLive);
    if (failDiscoveryAfterFirst && discoveryForceLiveCalls.length > 1) {
      throw StateError('discovery unavailable');
    }
    return DiscoveryResult(
      access: discoveryAccess,
      deals: [],
      foundDealCount: 0,
      checkedSourceCount: 0,
      unavailableSourceCount: 0,
      leafletCount: 0,
    );
  }

  @override
  Future<List<ScrollDeal>> windowSaves() async => windowSavedDeals;

  @override
  Future<Map<String, SaveStat>> windowSaveCounts(List<String> ids) async =>
      const {};

  @override
  Future<List<SavedDeal>> saveDeal(Deal deal) async {
    savedDealTitles.add(deal.title);
    return [
      SavedDeal(
        id: 'saved-${deal.id}',
        retailerId: deal.retailerId,
        retailerName: deal.retailerName,
        sourceLabel: deal.sourceLabel,
        sourceUrl: deal.sourceUrl,
        title: deal.title,
        capturedAt: deal.capturedAt,
        evidenceText: deal.evidenceText,
        productUrl: deal.productUrl,
        savedAt: '2026-07-21T12:00:00.000Z',
      ),
    ];
  }
}

class _MemorySeenStore extends WindowSeenStore {
  _MemorySeenStore(Set<String> initialIds) : ids = Set<String>.of(initialIds);

  final Set<String> ids;

  @override
  Future<Set<String>> loadIds() async => Set<String>.of(ids);

  @override
  Future<void> markSeen(String id) async {
    ids.add(id);
  }
}

const _deal1 = ScrollDeal(
  id: 'deal-1',
  title: 'Seen deal',
  retailerName: 'Example Store',
  sourceLabel: 'Example',
  source: 'example',
  productUrl: 'https://example.test/deal-1',
  imageUrl: 'https://example.test/deal-1.jpg',
);

const _soldOutDeal = ScrollDeal(
  id: 'deal-gone',
  title: 'Gone deal',
  retailerName: 'Example Store',
  sourceLabel: 'Example',
  source: 'onedayonly',
  productUrl: 'https://example.test/deal-gone',
  imageUrl: 'https://example.test/deal-gone.jpg',
  savingText: '40% off',
  soldOut: true,
);

const _bidDeal = ScrollDeal(
  id: 'bobshop-bid',
  title: 'Camera auction',
  retailerName: 'Bob Shop',
  sourceLabel: 'Featured listings',
  source: 'bobshop',
  productUrl: 'https://www.bobshop.co.za/camera/p/1',
  imageUrl: 'https://img.bobshop.co.za/camera.jpg',
  priceText: 'R250.00',
  unitText: 'Current bid',
);

const _deal2 = ScrollDeal(
  id: 'deal-2',
  title: 'Unseen deal',
  retailerName: 'Example Store',
  sourceLabel: 'Example',
  source: 'example',
  productUrl: 'https://example.test/deal-2',
  imageUrl: 'https://example.test/deal-2.jpg',
);

const _deal3 = ScrollDeal(
  id: 'deal-3',
  title: 'Third deal',
  retailerName: 'Example Store',
  sourceLabel: 'Example',
  source: 'example',
  productUrl: 'https://example.test/deal-3',
  imageUrl: 'https://example.test/deal-3.jpg',
);

const _deal4 = ScrollDeal(
  id: 'deal-4',
  title: 'Fourth deal',
  retailerName: 'Example Store',
  sourceLabel: 'Example',
  source: 'example',
  productUrl: 'https://example.test/deal-4',
  imageUrl: 'https://example.test/deal-4.jpg',
);

const _galleryDeal = ScrollDeal(
  id: 'gallery-deal',
  title: 'Gallery deal',
  retailerName: 'Example Store',
  sourceLabel: 'Example',
  source: 'example',
  productUrl: 'https://example.test/gallery-deal',
  imageUrl: 'https://example.test/gallery-cover.jpg',
  images: [
    'https://example.test/gallery-cover.jpg',
    'https://example.test/gallery-side.jpg',
  ],
);

const _onePixelPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
