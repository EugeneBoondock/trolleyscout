import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../api.dart';
import '../currency.dart';
import '../dashboard_stories.dart';
import '../discovery_cache.dart';
import '../price_display.dart';
import '../theme.dart';
import '../top_savings.dart';
import '../ux.dart';
import '../widgets/app_drawer.dart';
import '../widgets/common.dart';
import '../widgets/neo.dart';
import '../widgets/dashboard_stories.dart';
import '../widgets/dashboard_stories_skeleton.dart';
import '../widgets/in_app_browser.dart';

/// The first screen after sign-in, so it has to do more than report numbers.
///
/// It leads with the shopper by name, then with the one figure that says the
/// app is working — the money they kept — and only then with the supporting
/// counts. Deals appear as pictures of real products rather than as a tally,
/// because a photo of a discounted tub of margarine says "this app found you
/// something" far faster than the digit 7 ever will.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.api,
    required this.session,
    required this.onNavigate,
    this.cacheStore,
  });

  final Api api;
  final MemberSession session;
  final ValueChanged<AppDestination> onNavigate;
  final DiscoveryCache? cacheStore;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<_DashboardData> _future;
  Future<DiscoveryResult>? _storiesFuture;
  int _loadGeneration = 0;
  late final DiscoveryCache _cacheStore = widget.cacheStore ?? DiscoveryCache();

  @override
  void initState() {
    super.initState();
    _future = _load();
    _scheduleStoriesAfter(_future);
  }

  Future<_DashboardData> _load() async {
    // Each lane falls back independently, but failures are COUNTED so an
    // offline dashboard says "couldn't refresh" instead of quietly rendering
    // zeros that look identical to a brand-new account.
    var failedLanes = 0;
    Future<T> or<T>(Future<T> operation, T fallback) async {
      try {
        return await operation;
      } catch (_) {
        failedLanes += 1;
        return fallback;
      }
    }

    final results = await Future.wait<dynamic>([
      or(widget.api.discovery(summary: true), _emptyDiscovery),
      or(widget.api.retailers(summary: true), _emptyRetailers),
      or(widget.api.discoveredStores(summary: true), _emptyDiscovered),
      or(widget.api.savedDeals(), const <SavedDeal>[]),
      or(widget.api.basket(), const Basket.empty()),
      or(widget.api.voucherCount(), 0),
    ]);
    final discovery = results[0] as DiscoveryResult;
    // The server summary keeps this useful on a new device. The on-device
    // cache adds any fresher deals the shopper has already opened locally.
    final previewDeals = <String, Deal>{
      for (final deal in discovery.deals)
        '${deal.id}:${deal.productUrl ?? ''}': deal,
    };
    try {
      for (final deal in await _cachedTopDeals()) {
        previewDeals.putIfAbsent(
          '${deal.id}:${deal.productUrl ?? ''}',
          () => deal,
        );
      }
    } catch (_) {
      // Cache misses are expected on first run.
    }
    return _DashboardData(
      discovery: discovery,
      retailers: results[1] as RetailerCatalog,
      discovered: results[2] as DiscoveredStoresResult,
      savedDeals: results[3] as List<SavedDeal>,
      basket: results[4] as Basket,
      voucherCount: results[5] as int,
      topDeals: topSavingsDeals(previewDeals.values.toList()),
      failedLaneCount: failedLanes,
    );
  }

  static const _emptyDiscovery = DiscoveryResult(
    deals: [],
    foundDealCount: 0,
    checkedSourceCount: 0,
    unavailableSourceCount: 0,
    leafletCount: 0,
  );
  static const _emptyRetailers =
      RetailerCatalog(retailers: [], sourceKinds: []);
  static const _emptyDiscovered = DiscoveredStoresResult(
    stores: [],
    storeCount: 0,
    areaCount: 0,
    knownChainCount: 0,
    withPromotionsCount: 0,
  );

  // The Find-deals cache is already on-device; showing the biggest live
  // markdowns from it costs nothing and gives the dashboard a reason to be
  // opened every day.
  Future<List<Deal>> _cachedTopDeals() async {
    final cached = await _cacheStore.load(
      widget.api.effectiveCountryCode,
      widget.api.discoveryCacheScope,
    );
    return topSavingsDeals(cached?.result.deals ?? const []);
  }

  Future<DiscoveryResult> _loadStoriesDiscovery({
    bool forceRefresh = false,
  }) async {
    final countryCode = widget.api.effectiveCountryCode;
    final cached = await _cacheStore.load(countryCode);
    if (!forceRefresh && cached?.isFresh(DateTime.now()) == true) {
      return cached!.result;
    }

    try {
      final discovery = await widget.api.discovery();
      await _cacheStore.save(discovery, DateTime.now(), countryCode);
      return discovery;
    } catch (_) {
      if (cached != null) return cached.result;
      rethrow;
    }
  }

  void _scheduleStoriesAfter(
    Future<_DashboardData> dashboardFuture, {
    bool forceRefresh = false,
  }) {
    final generation = ++_loadGeneration;
    dashboardFuture.whenComplete(() {
      if (!mounted || generation != _loadGeneration) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || generation != _loadGeneration) return;
        setState(() {
          _storiesFuture = _loadStoriesDiscovery(
            forceRefresh: forceRefresh,
          );
        });
      });
    });
  }

  void _refresh() {
    final next = _load();
    setState(() {
      _storiesFuture = null;
      _future = next;
    });
    _scheduleStoriesAfter(next, forceRefresh: true);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_DashboardData>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Could not load your dashboard.', onRetry: _refresh);
        }
        final data = snapshot.data!;
        final account = widget.session.account;
        return RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              _GreetingHero(
                name: account?.displayName ?? 'Scout',
                initials: account?.initials ?? '?',
                planName: account?.planName ?? 'Free',
                onRefresh: _refresh,
              ),
              if (data.failedLaneCount > 0) ...[
                const SizedBox(height: 10),
                _OfflineBanner(onRetry: _refresh),
              ],
              const SizedBox(height: 16),
              const _SectionLabel(label: 'Jump straight in'),
              const SizedBox(height: 10),
              _QuickActions(onNavigate: widget.onNavigate),
              const SizedBox(height: 16),
              _SavingsHero(
                summary: data.basket.summary,
                // The money kept is the shopper's own money, in their own
                // currency — never rand at someone who does not spend rand.
                currency: Currency.of(widget.api.effectiveCurrencyCode),
                onOpenBasket: () => widget.onNavigate(AppDestination.basket),
                onFindDeals: () => widget.onNavigate(AppDestination.deals),
                onRefresh: _refresh,
              ),
              const SizedBox(height: 20),
              _DeferredDashboardStories(
                future: _storiesFuture,
                retailers: data.retailers.retailers,
              ),
              const SizedBox(height: 22),
              _TopSavingsStrip(
                deals: data.topDeals,
                onBrowse: () => widget.onNavigate(AppDestination.deals),
              ),
              const SizedBox(height: 22),
              _SavedDealsStrip(
                deals: data.savedDeals,
                onSeeAll: () => widget.onNavigate(AppDestination.savedDeals),
                onFindDeals: () => widget.onNavigate(AppDestination.deals),
              ),
              const SizedBox(height: 22),
              _StatChipGrid(
                chips: [
                  _StatChip(
                    icon: PhosphorIconsFill.tag,
                    value: '${data.discovery.foundDealCount}',
                    label: 'live deals',
                    onTap: () => widget.onNavigate(AppDestination.deals),
                  ),
                  _StatChip(
                    icon: PhosphorIconsFill.storefront,
                    value:
                        '${data.retailers.retailerCount + data.discovered.storeCount}',
                    label: 'stores covered',
                    onTap: () => widget.onNavigate(AppDestination.stores),
                  ),
                  _StatChip(
                    icon: PhosphorIconsFill.bookmarkSimple,
                    value: '${data.savedDeals.length}',
                    label: 'saved deals',
                    onTap: () => widget.onNavigate(AppDestination.savedDeals),
                  ),
                  _StatChip(
                    icon: PhosphorIconsFill.basket,
                    value: '${data.basket.summary.itemCount}',
                    label: 'basket items',
                    onTap: () => widget.onNavigate(AppDestination.basket),
                  ),
                  if (data.voucherCount > 0)
                    _StatChip(
                      icon: PhosphorIconsFill.ticket,
                      value: '${data.voucherCount}',
                      label: 'vouchers ready',
                      onTap: () => widget.onNavigate(AppDestination.vouchers),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DeferredDashboardStories extends StatelessWidget {
  const _DeferredDashboardStories({
    required this.future,
    required this.retailers,
  });

  final Future<DiscoveryResult>? future;
  final List<Retailer> retailers;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DiscoveryResult>(
      future: future,
      builder: (context, snapshot) {
        if (future == null ||
            snapshot.connectionState == ConnectionState.waiting) {
          return Column(
            key: const Key('dashboard-stories-loading'),
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionLabel(label: 'Store stories'),
              const SizedBox(height: 6),
              Text(
                'Loading stores after the dashboard is ready.',
                style: TextStyle(
                  color: TS.mutedOf(context),
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 12),
              const DashboardStoriesSkeleton(),
            ],
          );
        }

        final discovery = snapshot.data;
        if (discovery == null) return const SizedBox.shrink();
        return DashboardStories(
          stories: buildDashboardStories(
            catalogues: discovery.catalogues,
            deals: discovery.deals,
            retailers: retailers,
            businessStories: discovery.businessStories,
          ),
        );
      },
    );
  }
}

/// Greeting first, big and by name. The old header led with "Member dashboard"
/// and tucked the welcome into grey body text — the shopper's own name is the
/// most human thing on the screen and now it is also the largest.
class _GreetingHero extends StatelessWidget {
  const _GreetingHero({
    required this.name,
    required this.initials,
    required this.planName,
    required this.onRefresh,
  });

  final String name;
  final String initials;
  final String planName;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    // Open on the page, not boxed. The mark is centred in the bar above, so
    // the greeting under it reads as a masthead; a card around it turned the
    // top of the screen into a stack of containers.
    return SizedBox(
      width: double.infinity,
      child: Column(
        children: [
          const SizedBox(height: 2),
          // One line, like an address: "Good evening, Eugene". Splitting
          // the greeting from the name across two rows read as a label
          // above a value rather than someone being spoken to.
          Text(
            '${_greetingFor(now)}, $name',
            maxLines: 1,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 24,
              height: 1.1,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 8),
          _PlanPill(planName: planName),
          const SizedBox(height: 6),
          Text(
            _dateLine(now),
            style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
          ),
        ],
      ),
    );
  }

  static String _greetingFor(DateTime now) {
    if (now.hour < 12) return 'Good morning';
    if (now.hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  static const _days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];
  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];

  static String _dateLine(DateTime now) =>
      '${_days[now.weekday - 1]} ${now.day} ${_months[now.month - 1]}';
}

class _PlanPill extends StatelessWidget {
  const _PlanPill({required this.planName});

  final String planName;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: TS.yellow,
          border: Border.all(color: TS.lineOf(context), width: 1.5),
          borderRadius: BorderRadius.circular(TS.pillRadius),
        ),
        child: Text(
          '$planName plan'.toUpperCase(),
          style: const TextStyle(
            color: TS.ink,
            fontWeight: FontWeight.w900,
            fontSize: 10.5,
            letterSpacing: 0.6,
          ),
        ),
      );
}

/// The one number that answers "is this app doing anything for me?".
///
/// The ring shows the share of full price the shopper kept, not progress
/// towards an invented monthly target. A made-up goal can only ever be missed,
/// and a shopper on a tight budget does not need one more thing telling them
/// they fell short. A percentage of what they actually banked is honest, always
/// meaningful, and still gives the ring something to fill.
class _SavingsHero extends StatelessWidget {
  const _SavingsHero({
    required this.summary,
    required this.currency,
    required this.onOpenBasket,
    required this.onFindDeals,
    required this.onRefresh,
  });

  final BasketSummary summary;
  final Currency currency;
  final VoidCallback onOpenBasket;
  final VoidCallback onFindDeals;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final fullPrice = summary.totalCents + summary.savingsCents;
    if (fullPrice <= 0) return _empty(context);

    final kept = summary.savingsCents / fullPrice;
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return PressableScale(
      // The screen's one burst, in the bandana red, mostly hidden behind the
      // card's top-right corner — a print accident that survived. One per
      // screen, always behind something: scarcity is what keeps it an accent
      // instead of clipart.
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          const Positioned(
            top: -9,
            right: -7,
            child: NeoBurst(size: 34, color: TS.red, points: 11),
          ),
          InkWell(
            onTap: onOpenBasket,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(15),
              // The mascot's own yellow, whole. This is the number the app
              // exists to grow; it gets the loudest slab on the screen.
              decoration: TS.slab(context, color: TS.yellow),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text('MONEY YOU KEPT',
                            style: TS.eyebrowOf(context).copyWith(
                                  color: TS.red,
                                )),
                      ),
                      // Refresh lives on the number it refreshes, not floating
                      // beside the greeting.
                      SizedBox(
                        height: 26,
                        width: 26,
                        child: IconButton(
                          tooltip: 'Refresh dashboard',
                          padding: EdgeInsets.zero,
                          onPressed: () {
                            uxTap();
                            onRefresh();
                          },
                          icon: const Icon(Icons.refresh,
                              size: 18, color: TS.ink),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _SavingsRing(
                        fraction: kept,
                        animate: !reduceMotion,
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _CountUpMoney(
                              cents: summary.savingsCents,
                              currency: currency,
                              animate: !reduceMotion,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'off a basket that would have cost '
                              '${currency.format(fullPrice)}.',
                              style: const TextStyle(
                                color: Color(0xE61C1710),
                                fontSize: 13.5,
                                height: 1.3,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Divider(height: 1, color: Color(0x4D1C1710)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const PhosphorIcon(PhosphorIconsFill.basket,
                          size: 17, color: TS.ink),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          '${summary.itemCount} item${summary.itemCount == 1 ? '' : 's'} '
                          'in your basket · you pay ${currency.format(summary.totalCents)}',
                          style: const TextStyle(
                              color: Color(0xE61C1710), fontSize: 12.5),
                        ),
                      ),
                      const Icon(Icons.arrow_forward, size: 16, color: TS.red),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Nothing in the basket yet: show what the card will become rather than a
  /// discouraging R0.00, and point at the one action that fills it.
  Widget _empty(BuildContext context) => PressableScale(
        child: InkWell(
          onTap: () {
            uxTap();
            onFindDeals();
          },
          child: PaperCard(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: TS.yellow,
                    border: Border.all(color: TS.lineOf(context), width: 2),
                    borderRadius: BorderRadius.circular(TS.controlRadius),
                  ),
                  child: const PhosphorIcon(
                    PhosphorIconsFill.piggyBank,
                    size: 25,
                    color: TS.ink,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('MONEY YOU KEEP', style: TS.eyebrowOf(context)),
                      const SizedBox(height: 3),
                      Text(
                        'Add a deal to start tracking your real basket saving.',
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontSize: 13,
                          height: 1.25,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.arrow_forward, size: 18, color: TS.redOf(context)),
              ],
            ),
          ),
        ),
      );
}

/// A filling ring — the strongest quiet motivator in interface design: an
/// unclosed loop asks to be closed. Animates up from empty on each load.
class _SavingsRing extends StatelessWidget {
  const _SavingsRing({required this.fraction, required this.animate});

  final double fraction;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final target = fraction.clamp(0.0, 1.0);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: target),
      duration: animate ? const Duration(milliseconds: 900) : Duration.zero,
      curve: Curves.easeOutCubic,
      builder: (context, value, _) => SizedBox(
        width: 92,
        height: 92,
        child: CustomPaint(
          painter: _RingPainter(
            fraction: value,
            // On the yellow slab: an ink-wash track, the mascot's green for
            // the arc, ink cardinals. Theme lookups would hand back cream on
            // dark, which vanishes against yellow.
            track: const Color(0x338A7C5C),
            fill: TS.green,
            label: TS.ink,
          ),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '${(value * 100).round()}%',
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                    height: 1,
                    color: TS.ink,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'off',
                  style: TextStyle(
                      fontSize: 10.5, color: Color(0xB31C1710), height: 1),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The savings ring, drawn as a compass rose.
///
/// Trolley Scout's mark is a compass and the app is called Scout, so the one
/// dial on the dashboard may as well be one too. The arc still reads as a
/// proportion — the share of full price the shopper kept — but a compass face
/// gives it a reason to be round instead of looking like a loading spinner.
/// The savings dial, drawn as a compass face.
///
/// A compass people would recognise: N, E, S and W engraved round the bezel,
/// minor ticks between them, and the green arc sweeping from north round to
/// the share of full price the shopper kept. No needle — the arc's leading
/// edge is the pointer, and anything drawn across the middle fights the
/// percentage that lives there.
class _RingPainter extends CustomPainter {
  const _RingPainter({
    required this.fraction,
    required this.track,
    required this.fill,
    required this.label,
  });

  final double fraction;
  final Color track;
  final Color fill;
  final Color label;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 8.0;
    final rect = Offset.zero & size;
    final centre = rect.center;
    // The ring sits inside the cardinal letters, so the letters get the
    // outermost band and the arc runs just inside them.
    final letterBand = size.width / 2 - 7;
    final ringRadius = size.width / 2 - 18;
    final circle = Rect.fromCircle(center: centre, radius: ringRadius);

    canvas.drawArc(
      circle,
      0,
      math.pi * 2,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..color = track,
    );

    // Minor ticks between the cardinals, on the letter band so the bezel
    // reads as engraved rather than empty.
    final tick = Paint()
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round
      ..color = track;
    for (var step = 0; step < 8; step += 1) {
      if (step % 2 == 0) continue; // Cardinals get letters, not ticks.
      final angle = step * math.pi / 4 - math.pi / 2;
      final direction = Offset(math.cos(angle), math.sin(angle));
      canvas.drawLine(
        centre + direction * (letterBand - 4),
        centre + direction * (letterBand + 1),
        tick,
      );
    }

    // The cardinals. Small caps in the muted bezel colour, upright rather
    // than rotated: a dashboard dial is read, not navigated by.
    const cardinals = ['N', 'E', 'S', 'W'];
    for (var i = 0; i < 4; i += 1) {
      final angle = i * math.pi / 2 - math.pi / 2;
      final painter = TextPainter(
        text: TextSpan(
          text: cardinals[i],
          style: TextStyle(
            color: label,
            fontSize: 9,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final position = centre +
          Offset(math.cos(angle), math.sin(angle)) * letterBand -
          Offset(painter.width / 2, painter.height / 2);
      painter.paint(canvas, position);
    }

    if (fraction > 0) {
      canvas.drawArc(
        circle,
        -math.pi / 2,
        math.pi * 2 * fraction,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round
          ..color = fill,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.fraction != fraction ||
      old.fill != fill ||
      old.track != track ||
      old.label != label;
}

/// Counts up to the amount on load. A number that lands rather than appears is
/// the cheapest possible way to make a figure feel earned.
class _CountUpMoney extends StatelessWidget {
  const _CountUpMoney({
    required this.cents,
    required this.currency,
    required this.animate,
  });

  final int cents;
  final Currency currency;
  final bool animate;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: cents.toDouble()),
        duration: animate ? const Duration(milliseconds: 900) : Duration.zero,
        curve: Curves.easeOutCubic,
        builder: (context, value, _) => FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            currency.format(value.round()),
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 46,
              height: 1,
              letterSpacing: -1.2,
              color: TS.ink,
            ),
          ),
        ),
      );
}

/// Section headings as stickers: a yellow chip, ink border, tiny hard shadow.
/// Now the shared [NeoSticker] rather than a private copy, so the dashboard's
/// section headings and every other screen's eyebrow are literally the same
/// widget instead of two implementations that drift.
///
/// These used to be rotated a degree off level. Level is better: one tilted
/// label is a flourish, a column of them is a scrapbook, and this is an app
/// people use to make rent stretch.
class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, this.trailing});

  final String label;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) =>
      NeoSticker(label: label, trailing: trailing);
}

/// The four things shoppers actually open the app to do, one tap from the top
/// of the screen instead of three taps into the drawer.
class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onNavigate});

  final ValueChanged<AppDestination> onNavigate;

  @override
  Widget build(BuildContext context) {
    // Each tile takes one of the mascot's own colours, whole. Four cream
    // tiles in a row read as a form; four colour slabs read as a toybox,
    // which is what neo-brutalism is for.
    const actions = <(PhosphorIconData, String, AppDestination, Color, Color)>[
      (
        PhosphorIconsFill.tag,
        'Marketplace',
        AppDestination.deals,
        TS.yellow,
        TS.ink,
      ),
      (
        PhosphorIconsFill.mapPin,
        'Near me',
        AppDestination.near,
        TS.red,
        Color(0xFFFDFAF1),
      ),
      (
        PhosphorIconsFill.basket,
        'Basket',
        AppDestination.basket,
        TS.green,
        Color(0xFFFDFAF1),
      ),
      (
        PhosphorIconsFill.storefront,
        'Stores',
        AppDestination.stores,
        Color(0xFFFDFAF1),
        TS.ink,
      ),
    ];
    return Row(
      children: [
        for (final (icon, label, destination, fill, fg) in actions) ...[
          Expanded(
            child: _QuickActionTile(
              icon: icon,
              label: label,
              fill: fill,
              foreground: fg,
              onTap: () {
                uxTap();
                onNavigate(destination);
              },
            ),
          ),
          if (destination != actions.last.$3) const SizedBox(width: 10),
        ],
      ],
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({
    required this.icon,
    required this.label,
    required this.fill,
    required this.foreground,
    required this.onTap,
  });

  final PhosphorIconData icon;
  final String label;
  final Color fill;
  final Color foreground;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 4),
            decoration: TS.slab(context, color: fill),
            child: Column(
              children: [
                PhosphorIcon(icon, size: 23, color: foreground),
                const SizedBox(height: 6),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: foreground,
                      fontWeight: FontWeight.w800,
                      fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      );
}

/// Saved deals as pictures. A shopper scanning their own dashboard recognises
/// the tub of margarine they saved long before they parse "7 saved deals".
/// The biggest live markdowns from the on-device deals cache — real product
/// pictures with real rand savings, the strongest possible pull into the
/// Marketplace screen.
class _TopSavingsStrip extends StatelessWidget {
  const _TopSavingsStrip({required this.deals, required this.onBrowse});

  final List<Deal> deals;
  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) {
    if (deals.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel(label: 'Today’s savings'),
          const SizedBox(height: 10),
          PaperCard(
            child: Row(
              children: [
                PhosphorIcon(
                  PhosphorIconsFill.tag,
                  size: 26,
                  color: TS.redOf(context),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Fresh savings will appear here after the next deal check.',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 13.5,
                      height: 1.3,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    uxTap();
                    onBrowse();
                  },
                  child: const Text('Browse'),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(
          label: 'Today’s savings',
          trailing: TextButton(
            onPressed: () {
              uxTap();
              onBrowse();
            },
            child: const Text('See all deals'),
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: 132,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: deals.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final deal = deals[index];
              return _DashboardDealCard(
                cardKey: Key('top-saving-card-${deal.id}'),
                deal: deal,
                // Opens this deal at the shop. Every card used to run the same
                // action as "See all deals", so tapping a particular jacket
                // landed a shopper on the deals list with the jacket nowhere in
                // sight. A deal with no link of its own still falls back there,
                // because that is better than a tap that does nothing.
                onTap: () {
                  uxTap();
                  if (deal.productUrl == null || deal.productUrl!.isEmpty) {
                    onBrowse();
                    return;
                  }
                  showInAppBrowser(
                    context,
                    deal.productUrl,
                    title: deal.retailerName,
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _SavedDealsStrip extends StatelessWidget {
  const _SavedDealsStrip({
    required this.deals,
    required this.onSeeAll,
    required this.onFindDeals,
  });

  final List<SavedDeal> deals;
  final VoidCallback onSeeAll;
  final VoidCallback onFindDeals;

  @override
  Widget build(BuildContext context) {
    if (deals.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel(label: 'Your saved deals'),
          const SizedBox(height: 10),
          PaperCard(
            child: Row(
              children: [
                PhosphorIcon(PhosphorIconsFill.bookmarkSimple,
                    size: 26, color: TS.mutedOf(context)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Nothing saved yet. Tap the bookmark on any deal and it '
                    'waits for you here.',
                    style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 13.5,
                        height: 1.3),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    uxTap();
                    onFindDeals();
                  },
                  child: const Text('Browse'),
                ),
              ],
            ),
          ),
        ],
      );
    }

    final preview = deals.take(8).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(
          label: 'Your saved deals',
          trailing: TextButton(
            onPressed: () {
              uxTap();
              onSeeAll();
            },
            child: Text('See all ${deals.length}'),
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: 132,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: preview.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) => _DashboardDealCard(
              cardKey: Key('saved-deal-card-${preview[index].id}'),
              deal: preview[index],
              onTap: () {
                uxTap();
                onSeeAll();
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _DashboardDealCard extends StatelessWidget {
  const _DashboardDealCard({
    required this.cardKey,
    required this.deal,
    required this.onTap,
  });

  final Key cardKey;
  final Deal deal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final wasText = meaningfulWasPrice(deal.previousPriceText, deal.priceText);
    return PressableScale(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          key: cardKey,
          width: 156,
          decoration: TS.cardFill(context),
          foregroundDecoration: TS.cardStroke(context),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // The shop and a small square of the product share the top row.
              // A full-width banner image made every card look like an advert
              // and pushed the price, which is the reason anyone is reading
              // the card, down out of the first glance.
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        deal.retailerName.toUpperCase(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TS.eyebrowOf(context).copyWith(fontSize: 9.5),
                      ),
                    ),
                    const SizedBox(width: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(TS.tileRadius),
                      child: SizedBox(
                        width: 46,
                        height: 46,
                        child: _DealThumb(imageUrl: deal.imageUrl),
                      ),
                    ),
                  ],
                ),
              ),
              // Expanded, not a bare Padding: the strip has a fixed height,
              // so the text block must take exactly what is left rather than
              // its natural size, or a long product name overflows the card.
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          deal.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 12.5,
                              height: 1.2),
                        ),
                      ),
                      const SizedBox(height: 5),
                      SizedBox(
                        height: 18,
                        child: Row(
                          children: [
                            Expanded(
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  deal.priceText ?? 'Price on the shelf',
                                  maxLines: 1,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 14,
                                    color: deal.priceText == null
                                        ? TS.mutedOf(context)
                                        : TS.inkOf(context),
                                  ),
                                ),
                              ),
                            ),
                            if (wasText != null) ...[
                              const SizedBox(width: 6),
                              Flexible(
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    wasText,
                                    maxLines: 1,
                                    style: TextStyle(
                                      color: TS.faintOf(context),
                                      decoration: TextDecoration.lineThrough,
                                      fontSize: 10.5,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DealThumb extends StatelessWidget {
  const _DealThumb({required this.imageUrl});

  final String? imageUrl;

  /// Fills whatever box it is given. It used to fix its own height, which is
  /// why it could only ever be a full-width banner.
  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      color: TS.surfaceSoftOf(context),
      alignment: Alignment.center,
      child: PhosphorIcon(PhosphorIconsFill.shoppingCart,
          size: 18, color: TS.mutedOf(context)),
    );
    if (imageUrl == null || imageUrl!.trim().isEmpty) return placeholder;
    return Container(
      color: TS.surfaceSoftOf(context),
      child: Image.network(
        imageUrl!,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => placeholder,
        // Fade the photo in rather than letting it pop, and hold the card's
        // shape while it downloads so the strip never jumps.
        frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
          if (wasSynchronouslyLoaded) return child;
          return AnimatedOpacity(
            opacity: frame == null ? 0 : 1,
            duration: const Duration(milliseconds: 250),
            child: child,
          );
        },
      ),
    );
  }
}

/// Supporting counts, deliberately quieter than everything above them. These
/// are reassurance ("the app is out there working"), not the headline.
/// The watch-list banner: everything Trolley Scout is minding, one green
/// slab in the mascot's own colours. The chips used to be a two-column grid
/// of quiet tiles, which read as settings; one dark row reads as a status
/// bar for the whole operation.
class _StatChipGrid extends StatelessWidget {
  const _StatChipGrid({required this.chips});

  final List<_StatChip> chips;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: TS.green,
          border: Border.all(color: TS.lineOf(context), width: 2),
          borderRadius: BorderRadius.circular(TS.cardRadius),
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0x2EFFD42E)
                  : const Color(0xFF1C1710),
              offset: const Offset(4, 4),
            ),
          ],
        ),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'What Trolley Scout is watching for you',
              style: TextStyle(
                color: TS.yellow,
                fontWeight: FontWeight.w900,
                fontSize: 13.5,
                letterSpacing: 0.2,
              ),
            ),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (var i = 0; i < chips.length; i += 1) ...[
                    if (i > 0)
                      Container(
                        width: 1,
                        height: 30,
                        margin: const EdgeInsets.symmetric(horizontal: 12),
                        color: const Color(0x4DFFFFFF),
                      ),
                    chips[i],
                  ],
                ],
              ),
            ),
          ],
        ),
      );
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.icon,
    required this.value,
    required this.label,
    required this.onTap,
  });

  final PhosphorIconData icon;
  final String value;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () {
          uxTap();
          onTap();
        },
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            PhosphorIcon(icon, size: 16, color: TS.yellow),
            const SizedBox(width: 7),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(value,
                    maxLines: 1,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                        height: 1.1)),
                Text(label,
                    maxLines: 1,
                    style: const TextStyle(
                        color: Color(0xCCFFFFFF), fontSize: 10, height: 1.2)),
              ],
            ),
          ],
        ),
      );
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineOf(context), width: 2),
        borderRadius: BorderRadius.circular(TS.controlRadius),
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_off_outlined, size: 18, color: TS.mutedOf(context)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Some of your data couldn’t refresh. Totals may be behind.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _DashboardData {
  const _DashboardData({
    required this.discovery,
    required this.retailers,
    required this.discovered,
    required this.savedDeals,
    required this.basket,
    required this.topDeals,
    required this.voucherCount,
    this.failedLaneCount = 0,
  });

  final DiscoveryResult discovery;
  final RetailerCatalog retailers;
  final DiscoveredStoresResult discovered;
  final List<SavedDeal> savedDeals;
  final Basket basket;
  final List<Deal> topDeals;
  final int voucherCount;

  /// How many network lanes fell back to empty data during [._load]. Non-zero
  /// means the zeros on screen may be connectivity, not reality.
  final int failedLaneCount;
}
