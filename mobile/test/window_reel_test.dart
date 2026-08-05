import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/discovery_cache.dart';
import 'package:trolley_scout/screens/window_shopping_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/window_ends_pill.dart';
import 'package:trolley_scout/window_seen_store.dart';

/// What makes the reel worth staying in: it saves in one gesture, it varies
/// what it puts in front of you, it only claims an end date it actually has,
/// and it never stops dead.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({
        'window_music_muted': true,
      }));

  group('double-tap to save', () {
    testWidgets('keeps the deal and confirms it on the card', (tester) async {
      final api = _ReelApi(initialDeals: const [_alpha1]);

      await tester.pumpWidget(_wrap(_window(api)));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('window-save-burst')), findsNothing);

      await _doubleTapCard(tester);

      expect(api.savedIds, ['alpha-1']);
      expect(find.byKey(const ValueKey('window-save-burst')), findsOneWidget);

      // The confirmation is brief — it does not linger on the card — and the
      // rail settles on the filled bookmark plus the real save count.
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('window-save-burst')), findsNothing);
      expect(_railIcon(Icons.bookmark), findsOneWidget);
      expect(_railIcon(Icons.bookmark_border), findsNothing);
    });

    testWidgets('a second double tap never un-saves by accident',
        (tester) async {
      final api = _ReelApi(initialDeals: const [_alpha1]);

      await tester.pumpWidget(_wrap(_window(api)));
      await tester.pumpAndSettle();

      await _doubleTapCard(tester);
      await tester.pumpAndSettle();
      await _doubleTapCard(tester);
      await tester.pumpAndSettle();

      expect(api.savedIds, ['alpha-1']);
      expect(api.unsavedIds, isEmpty);
    });
  });

  group('serendipity', () {
    test('spreads shops across consecutive windows', () {
      final ordered = varyWindowOrder(const [
        _alpha1,
        _alpha2,
        _alpha3,
        _beta1,
        _beta2,
        _beta3,
      ]);

      expect(ordered.length, 6);
      expect(
        ordered.map((deal) => deal.id).toSet(),
        {'alpha-1', 'alpha-2', 'alpha-3', 'beta-1', 'beta-2', 'beta-3'},
      );
      for (var index = 1; index < ordered.length; index++) {
        expect(ordered[index].retailerName,
            isNot(ordered[index - 1].retailerName));
      }
    });

    test('spreads categories when the shop cannot be varied', () {
      final ordered = varyWindowOrder(const [
        _alpha1,
        _alpha2,
        _alphaOther,
      ]);

      // Same shop throughout, so the aisle is the only thing left to vary.
      expect(ordered.map((deal) => deal.id), contains('alpha-1'));
      expect(ordered.length, 3);
      expect(ordered[1].category, isNot(ordered[0].category));
    });

    test('never invents, duplicates or drops a deal', () {
      const input = [_alpha1, _alpha2, _alpha3, _beta1];
      final ordered = varyWindowOrder(input);

      expect(ordered.length, input.length);
      expect(ordered.toSet().length, input.length);
      for (final deal in input) {
        expect(ordered, contains(deal));
      }
    });

    testWidgets('opens on two different shops in a row', (tester) async {
      final api = _ReelApi(
        initialDeals: const [_alpha1, _alpha2, _beta1, _beta2],
      );

      await tester.pumpWidget(_wrap(_window(api)));
      await tester.pumpAndSettle();
      final first = _visibleDealTitle(tester);

      await tester.drag(find.byType(PageView), const Offset(0, -500));
      await tester.pumpAndSettle();
      final second = _visibleDealTitle(tester);

      expect(_storeOf(second), isNot(_storeOf(first)));
    });
  });

  group('end dates', () {
    final now = DateTime(2026, 7, 25, 10);

    test('reports only what the feed really said', () {
      expect(windowEndsLabel(null, now: now), isNull);
      expect(windowEndsLabel('not a date', now: now), isNull);
      expect(windowEndsLabel('2026-07-24T09:00:00', now: now), isNull);
      expect(windowEndsLabel('2026-07-25T18:00:00', now: now), 'Ends today');
      expect(windowEndsLabel('2026-07-26T12:00:00', now: now), 'Ends tomorrow');
      expect(
          windowEndsLabel('2026-07-28T12:00:00', now: now), 'Ends in 3 days');
      // Too far out to act on today, so the card stays quiet.
      expect(windowEndsLabel('2026-09-01T12:00:00', now: now), isNull);
    });

    testWidgets('shows a calm pill when a deal really ends', (tester) async {
      final api = _ReelApi(initialDeals: const [_endingDeal]);

      await tester.pumpWidget(_wrap(_window(api, now: () => now)));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('window-ends-pill')), findsOneWidget);
      expect(find.text('Ends tomorrow'), findsOneWidget);
    });

    testWidgets('shows nothing when the deal carries no end date',
        (tester) async {
      final api = _ReelApi(initialDeals: const [_alpha1]);

      await tester.pumpWidget(_wrap(_window(api, now: () => now)));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('window-ends-pill')), findsNothing);
    });

    testWidgets('shows nothing once the end date has passed', (tester) async {
      final api = _ReelApi(initialDeals: const [_expiredDeal]);

      await tester.pumpWidget(_wrap(_window(api, now: () => now)));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('window-ends-pill')), findsNothing);
    });
  });

  group('never a dead end', () {
    testWidgets('the end of the reel offers somewhere to go next',
        (tester) async {
      final api = _ReelApi(initialDeals: const [_alpha1]);

      await tester.pumpWidget(_wrap(_window(api)));
      await tester.pumpAndSettle();

      await tester.drag(find.byType(PageView), const Offset(0, -500));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('window-next-stop')), findsOneWidget);
      expect(find.text('That’s the whole window'), findsOneWidget);
      expect(find.text('Check for new deals'), findsOneWidget);
      expect(find.text('More from Alpha Store'), findsOneWidget);
      expect(find.text('Saved deals'), findsOneWidget);

      await tester.tap(find.text('Check for new deals'));
      await tester.pumpAndSettle();
      expect(api.dealSiteCalls, greaterThan(1));
    });

    testWidgets('counts only what is really on the screen', (tester) async {
      final api = _ReelApi(initialDeals: const [_alpha1, _beta1]);

      await tester.pumpWidget(_wrap(_window(api)));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(PageView), const Offset(0, -500));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(PageView), const Offset(0, -500));
      await tester.pumpAndSettle();

      expect(
          find.text('You’ve seen all 2 deals in this window.'), findsOneWidget);
      // Nothing has been kept yet, so no tally is claimed.
      expect(find.textContaining('kept so far'), findsNothing);
    });

    testWidgets('a failed load still offers a way forward', (tester) async {
      final api = _ReelApi(initialDeals: const [], failEverything: true);

      await tester.pumpWidget(_wrap(_window(api)));
      await tester.pumpAndSettle();

      expect(
          find.text('Could not load the window. Try again.'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(find.text('Saved deals'), findsOneWidget);
    });
  });

  testWidgets('warming a picture and painting it share one cache entry',
      (tester) async {
    late BuildContext captured;
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        captured = context;
        return const SizedBox.shrink();
      }),
    ));

    const url = 'https://example.test/a.jpg';
    final provider = windowImageProvider(captured, url);
    // Decoding is bounded, so a 1600px source never lands on the heap at full
    // size on a cheap phone.
    expect(provider, isA<ResizeImage>());
    expect((provider as ResizeImage).width, isNotNull);
    expect(provider.width, lessThanOrEqualTo(1440));

    // The warm-up and the paint must land on the same cache entry, or every
    // photo is fetched and decoded twice and the swipe still hits a blank.
    final warmed = await windowImageProvider(captured, url)
        .obtainKey(ImageConfiguration.empty);
    final painted = await provider.obtainKey(ImageConfiguration.empty);
    expect(warmed, equals(painted));
  });

  testWidgets('the first load shows the shape of the card that is coming',
      (tester) async {
    final api = _ReelApi(initialDeals: const [_alpha1]);

    // The very first frame, before the feed has answered.
    await tester.pumpWidget(_wrap(_window(api)));

    expect(find.byKey(const ValueKey('window-reel-skeleton')), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('window-reel-skeleton')), findsNothing);
  });
}

/// An icon on the card's own action rail, ignoring the identically-named
/// control in the top bar.
Finder _railIcon(IconData icon) => find.descendant(
      of: find.byKey(const ValueKey('window-card-alpha-1')),
      matching: find.byIcon(icon),
    );

/// Two taps on the middle of the picture, close enough together to read as one
/// double tap. Tapping by position rather than by finder because the photo sits
/// inside the slow zoom transform.
Future<void> _doubleTapCard(WidgetTester tester) async {
  final centre = tester.getCenter(
    find.byKey(const ValueKey('window-card-alpha-1')),
  );
  await tester.tapAt(centre);
  await tester.pump(const Duration(milliseconds: 60));
  await tester.tapAt(centre);
  await tester.pump(const Duration(milliseconds: 120));
}

/// The title on the card actually filling the reel. Neighbouring pages are
/// pre-built so the swipe never waits, so more than one card is in the tree.
String _visibleDealTitle(WidgetTester tester) {
  final height = tester.view.physicalSize.height / tester.view.devicePixelRatio;
  for (final title in const [
    'Alpha one',
    'Alpha two',
    'Beta one',
    'Beta two',
  ]) {
    final finder = find.text(title);
    if (finder.evaluate().isEmpty) continue;
    final dy = tester.getCenter(finder).dy;
    if (dy >= 0 && dy <= height) return title;
  }
  throw StateError('No deal card is visible.');
}

String _storeOf(String title) => title.split(' ').first;

WindowShoppingScreen _window(_ReelApi api, {DateTime Function()? now}) =>
    WindowShoppingScreen(
      api: api,
      cacheStore: _MemoryDiscoveryCache(),
      seenStore: api.seenStore,
      now: now,
    );

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

Widget _wrap(Widget child, {Brightness brightness = Brightness.dark}) {
  return MaterialApp(
    theme: brightness == Brightness.light ? TS.lightTheme() : TS.darkTheme(),
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: true),
        child: Scaffold(body: child),
      ),
    ),
  );
}

class _ReelApi extends Api {
  _ReelApi({required this.initialDeals, this.failEverything = false})
      : seenStore = _MemorySeenStore(),
        super(baseUrl: 'https://example.test');

  final List<ScrollDeal> initialDeals;
  final bool failEverything;
  final _MemorySeenStore seenStore;
  final List<String> savedIds = [];
  final List<String> unsavedIds = [];
  int dealSiteCalls = 0;

  @override
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async {
    dealSiteCalls++;
    if (failEverything) throw StateError('deal sites unavailable');
    return initialDeals;
  }

  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    if (failEverything) throw StateError('discovery unavailable');
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

  @override
  Future<SaveStat> saveWindowDeal(ScrollDeal deal) async {
    savedIds.add(deal.id);
    return const SaveStat(count: 1, saved: true);
  }

  @override
  Future<SaveStat> unsaveWindowDeal(String id) async {
    unsavedIds.add(id);
    return const SaveStat(count: 0, saved: false);
  }
}

class _MemorySeenStore extends WindowSeenStore {
  final Set<String> ids = {};

  @override
  Future<Set<String>> loadIds() async => Set<String>.of(ids);

  @override
  Future<void> markSeen(String id) async {
    ids.add(id);
  }
}

const _alpha1 = ScrollDeal(
  id: 'alpha-1',
  title: 'Alpha one',
  retailerName: 'Alpha Store',
  sourceLabel: 'Alpha',
  source: 'alpha',
  category: 'groceries',
  productUrl: 'https://example.test/alpha-1',
  imageUrl: 'https://example.test/alpha-1.jpg',
);

const _alpha2 = ScrollDeal(
  id: 'alpha-2',
  title: 'Alpha two',
  retailerName: 'Alpha Store',
  sourceLabel: 'Alpha',
  source: 'alpha',
  category: 'groceries',
  productUrl: 'https://example.test/alpha-2',
  imageUrl: 'https://example.test/alpha-2.jpg',
);

const _alpha3 = ScrollDeal(
  id: 'alpha-3',
  title: 'Alpha three',
  retailerName: 'Alpha Store',
  sourceLabel: 'Alpha',
  source: 'alpha',
  category: 'groceries',
  productUrl: 'https://example.test/alpha-3',
  imageUrl: 'https://example.test/alpha-3.jpg',
);

const _alphaOther = ScrollDeal(
  id: 'alpha-other',
  title: 'Alpha other',
  retailerName: 'Alpha Store',
  sourceLabel: 'Alpha',
  source: 'alpha',
  category: 'household',
  productUrl: 'https://example.test/alpha-other',
  imageUrl: 'https://example.test/alpha-other.jpg',
);

const _beta1 = ScrollDeal(
  id: 'beta-1',
  title: 'Beta one',
  retailerName: 'Beta Store',
  sourceLabel: 'Beta',
  source: 'beta',
  category: 'household',
  productUrl: 'https://example.test/beta-1',
  imageUrl: 'https://example.test/beta-1.jpg',
);

const _beta2 = ScrollDeal(
  id: 'beta-2',
  title: 'Beta two',
  retailerName: 'Beta Store',
  sourceLabel: 'Beta',
  source: 'beta',
  category: 'household',
  productUrl: 'https://example.test/beta-2',
  imageUrl: 'https://example.test/beta-2.jpg',
);

const _beta3 = ScrollDeal(
  id: 'beta-3',
  title: 'Beta three',
  retailerName: 'Beta Store',
  sourceLabel: 'Beta',
  source: 'beta',
  category: 'household',
  productUrl: 'https://example.test/beta-3',
  imageUrl: 'https://example.test/beta-3.jpg',
);

const _endingDeal = ScrollDeal(
  id: 'ending-deal',
  title: 'Ending deal',
  retailerName: 'Alpha Store',
  sourceLabel: 'Alpha',
  source: 'alpha',
  productUrl: 'https://example.test/ending-deal',
  imageUrl: 'https://example.test/ending-deal.jpg',
  expiresAt: '2026-07-26T12:00:00',
);

const _expiredDeal = ScrollDeal(
  id: 'expired-deal',
  title: 'Expired deal',
  retailerName: 'Alpha Store',
  sourceLabel: 'Alpha',
  source: 'alpha',
  productUrl: 'https://example.test/expired-deal',
  imageUrl: 'https://example.test/expired-deal.jpg',
  expiresAt: '2026-07-20T12:00:00',
);
