import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
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

  testWidgets('filters deals seen during an earlier app visit', (tester) async {
    final api = _WindowApi(
      initialDeals: const [_deal1, _deal2],
      initiallySeen: const {'deal-1'},
    );

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    expect(find.text('Seen deal'), findsNothing);
    expect(find.text('Unseen deal'), findsOneWidget);
    expect(
        tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        isA<SliverChildBuilderDelegate>().having(
          (delegate) => delegate.childCount,
          'unseen child count',
          1,
        ));
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
    expect(
        tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        isA<SliverChildBuilderDelegate>().having(
          (delegate) => delegate.childCount,
          'finite child count',
          2,
        ));
    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(
      tester.widget<PageView>(find.byType(PageView)).controller?.page,
      closeTo(1, 0.01),
    );
  });

  testWidgets('pulling down on the first deal requests a fresh deal-site feed',
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

    expect(api.dealSiteForceLiveCalls, [false, true]);
    expect(api.discoveryForceLiveCalls, [false, false]);
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

    expect(api.dealSiteForceLiveCalls, [false, true]);
    expect(secondCompleted, isFalse);
    api.completeForcedDealSites();
    await Future.wait([firstRefresh, secondRefresh]);
    await tester.pumpAndSettle();
  });

  testWidgets('product galleries swipe horizontally and expose arrows and dots',
      (tester) async {
    final api = _WindowApi(initialDeals: const [_galleryDeal]);

    await tester.pumpWidget(_wrap(_window(api)));
    await tester.pumpAndSettle();

    final horizontalPager = find.byWidgetPredicate(
      (widget) =>
          widget is PageView && widget.scrollDirection == Axis.horizontal,
    );
    expect(horizontalPager, findsOneWidget);
    expect(find.byTooltip('Previous image'), findsOneWidget);
    expect(find.byTooltip('Next image'), findsOneWidget);
    expect(find.byKey(const ValueKey('window-image-dot-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('window-image-dot-1')), findsOneWidget);
    expect(find.bySemanticsLabel('Product image 1 of 2'), findsOneWidget);
    expect(
      tester.widgetList<Image>(find.byType(Image)).every(
            (image) => image.fit == BoxFit.contain,
          ),
      isTrue,
    );

    final nextImage = find.descendant(
      of: find.byTooltip('Next image'),
      matching: find.byIcon(Icons.chevron_right),
    );
    expect(nextImage.hitTestable(), findsOneWidget);
    final nextButtonFinder = find.ancestor(
      of: find.byTooltip('Next image'),
      matching: find.byType(IconButton),
    );
    final nextButton = tester.widget<IconButton>(nextButtonFinder);
    expect(nextButton.onPressed, isNotNull);
    await tester.tap(nextButtonFinder);
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
    final firstTitle = _currentDealTitle();
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
    final firstTitle = _currentDealTitle();
    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();
    final secondTitle = _currentDealTitle();

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    now = now.add(const Duration(hours: 3));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.text(firstTitle), findsNothing);
    expect(find.text(secondTitle), findsNothing);
    expect(
        tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        isA<SliverChildBuilderDelegate>().having(
          (delegate) => delegate.childCount,
          'remaining unseen child count',
          2,
        ));
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

    expect(
        tester.widget<PageView>(find.byType(PageView)).childrenDelegate,
        isA<SliverChildBuilderDelegate>().having(
          (delegate) => delegate.childCount,
          'preserved unseen child count',
          2,
        ));
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
    seenStore: api.seenStore,
    now: now,
  );
}

String _currentDealTitle() {
  for (final title in const [
    'Seen deal',
    'Unseen deal',
    'Third deal',
    'Fourth deal',
  ]) {
    if (find.text(title).evaluate().isNotEmpty) return title;
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
    this.refreshedDeals = const [],
    this.failDealSitesAfterFirst = false,
    this.failDiscoveryAfterFirst = false,
    this.holdForcedDealSites = false,
    Set<String> initiallySeen = const {},
  })  : seenStore = _MemorySeenStore(initiallySeen),
        super(baseUrl: 'https://example.test');

  final List<ScrollDeal> initialDeals;
  final List<ScrollDeal> refreshedDeals;
  final bool failDealSitesAfterFirst;
  final bool failDiscoveryAfterFirst;
  final bool holdForcedDealSites;
  final _MemorySeenStore seenStore;
  final List<bool> dealSiteForceLiveCalls = [];
  final List<bool> discoveryForceLiveCalls = [];
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
    if (forceLive && holdForcedDealSites) {
      return _forcedDealSitesCompleter.future;
    }
    return forceLive ? refreshedDeals : initialDeals;
  }

  @override
  Future<DiscoveryResult> discovery({bool forceLive = false}) async {
    discoveryForceLiveCalls.add(forceLive);
    if (failDiscoveryAfterFirst && discoveryForceLiveCalls.length > 1) {
      throw StateError('discovery unavailable');
    }
    return const DiscoveryResult(
      deals: [],
      foundDealCount: 0,
      checkedSourceCount: 0,
      unavailableSourceCount: 0,
      leafletCount: 0,
    );
  }

  @override
  Future<List<ScrollDeal>> windowSaves() async => const [];

  @override
  Future<Map<String, SaveStat>> windowSaveCounts(List<String> ids) async =>
      const {};
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
