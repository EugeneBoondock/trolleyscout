import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../api.dart';
import '../discovery_cache.dart';
import '../price_display.dart';
import '../theme.dart';
import '../top_savings.dart';
import '../ux.dart';
import '../widgets/app_drawer.dart';
import '../widgets/common.dart';
import '../widgets/scout_avatar_view.dart';

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
  });

  final Api api;
  final MemberSession session;
  final ValueChanged<AppDestination> onNavigate;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<_DashboardData> _future = _load();

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
    final cached = await DiscoveryCache().load();
    return topSavingsDeals(cached?.result.deals ?? const []);
  }

  void _refresh() => setState(() {
        _future = _load();
      });

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
              const SizedBox(height: 14),
              _SavingsHero(
                summary: data.basket.summary,
                onOpenBasket: () => widget.onNavigate(AppDestination.basket),
                onFindDeals: () => widget.onNavigate(AppDestination.deals),
              ),
              const SizedBox(height: 22),
              _TopSavingsStrip(
                deals: data.topDeals,
                onBrowse: () => widget.onNavigate(AppDestination.deals),
              ),
              const SizedBox(height: 20),
              const _SectionLabel(label: 'Jump straight in'),
              const SizedBox(height: 10),
              _QuickActions(onNavigate: widget.onNavigate),
              const SizedBox(height: 22),
              _SavedDealsStrip(
                deals: data.savedDeals,
                onSeeAll: () => widget.onNavigate(AppDestination.savedDeals),
                onFindDeals: () => widget.onNavigate(AppDestination.deals),
              ),
              const SizedBox(height: 22),
              const _SectionLabel(
                label: 'What Trolley Scout is watching for you',
              ),
              const SizedBox(height: 10),
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
    return PaperCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 12, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ScoutAvatarView(initials: initials, size: 52),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_greetingFor(now).toUpperCase(),
                    style: TS.eyebrowOf(context)),
                const SizedBox(height: 3),
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 30,
                    height: 1.05,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 8),
                // Wrap, not Row: a long plan name next to a long weekday
                // ("Wednesday 24 September") is wider than a small phone, and
                // this drops to a second line instead of overflowing.
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _PlanPill(planName: planName),
                    Text(
                      _dateLine(now),
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Refresh dashboard',
            onPressed: () {
              uxTap();
              onRefresh();
            },
            icon: const Icon(Icons.refresh),
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
    required this.onOpenBasket,
    required this.onFindDeals,
  });

  final BasketSummary summary;
  final VoidCallback onOpenBasket;
  final VoidCallback onFindDeals;

  @override
  Widget build(BuildContext context) {
    final fullPrice = summary.totalCents + summary.savingsCents;
    if (fullPrice <= 0) return _empty(context);

    final kept = summary.savingsCents / fullPrice;
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return PressableScale(
      child: InkWell(
        onTap: onOpenBasket,
        child: PaperCard(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('MONEY YOU KEPT', style: TS.eyebrowOf(context)),
              const SizedBox(height: 14),
              Row(
                children: [
                  _SavingsRing(
                    fraction: kept,
                    animate: !reduceMotion,
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _CountUpRand(
                          cents: summary.savingsCents,
                          animate: !reduceMotion,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'off a basket that would have cost '
                          '${formatRand(fullPrice)}.',
                          style: TextStyle(
                            color: TS.mutedOf(context),
                            fontSize: 13.5,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Divider(height: 1, color: TS.lineSoftOf(context)),
              const SizedBox(height: 12),
              Row(
                children: [
                  PhosphorIcon(PhosphorIconsFill.basket,
                      size: 17, color: TS.mutedOf(context)),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      '${summary.itemCount} item${summary.itemCount == 1 ? '' : 's'} '
                      'in your basket · you pay ${formatRand(summary.totalCents)}',
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
                    ),
                  ),
                  Icon(Icons.arrow_forward, size: 16, color: TS.redOf(context)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Nothing in the basket yet: show what the card will become rather than a
  /// discouraging R0.00, and point at the one action that fills it.
  Widget _empty(BuildContext context) => PaperCard(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('MONEY YOU KEEP', style: TS.eyebrowOf(context)),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 52,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: TS.yellow,
                    border: Border.all(color: TS.lineOf(context), width: 2),
                  ),
                  child: const PhosphorIcon(PhosphorIconsFill.piggyBank,
                      size: 28, color: TS.ink),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    'Add a deal to your basket and this shows exactly how much '
                    'you saved on the shop.',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 14,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  uxTap();
                  onFindDeals();
                },
                icon: const Icon(Icons.search, size: 18),
                label: const Text('Find your first deal'),
              ),
            ),
          ],
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
        width: 84,
        height: 84,
        child: CustomPaint(
          painter: _RingPainter(
            fraction: value,
            track: TS.lineSoftOf(context),
            fill: TS.greenOf(context),
          ),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '${(value * 100).round()}%',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 21,
                    height: 1,
                    color: TS.greenOf(context),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'off',
                  style: TextStyle(
                      fontSize: 10.5, color: TS.mutedOf(context), height: 1),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({
    required this.fraction,
    required this.track,
    required this.fill,
  });

  final double fraction;
  final Color track;
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 9.0;
    final rect = Offset.zero & size;
    final circle = rect.deflate(stroke / 2);
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = track;
    final fillPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = fill;

    canvas.drawArc(circle, 0, math.pi * 2, false, trackPaint);
    if (fraction > 0) {
      canvas.drawArc(
        circle,
        -math.pi / 2,
        math.pi * 2 * fraction,
        false,
        fillPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.fraction != fraction || old.fill != fill || old.track != track;
}

/// Counts up to the amount on load. A number that lands rather than appears is
/// the cheapest possible way to make a figure feel earned.
class _CountUpRand extends StatelessWidget {
  const _CountUpRand({required this.cents, required this.animate});

  final int cents;
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
            formatRand(value.round()),
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 38,
              height: 1,
              letterSpacing: -1,
              color: TS.greenOf(context),
            ),
          ),
        ),
      );
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, this.trailing});

  final String label;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      );
}

/// The four things shoppers actually open the app to do, one tap from the top
/// of the screen instead of three taps into the drawer.
class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onNavigate});

  final ValueChanged<AppDestination> onNavigate;

  @override
  Widget build(BuildContext context) {
    const actions = <(PhosphorIconData, String, AppDestination)>[
      (PhosphorIconsFill.tag, 'Find deals', AppDestination.deals),
      (PhosphorIconsFill.mapPin, 'Near me', AppDestination.near),
      (PhosphorIconsFill.basket, 'Basket', AppDestination.basket),
      (PhosphorIconsFill.storefront, 'Stores', AppDestination.stores),
    ];
    return Row(
      children: [
        for (final (icon, label, destination) in actions) ...[
          Expanded(
            child: _QuickActionTile(
              icon: icon,
              label: label,
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
    required this.onTap,
  });

  final PhosphorIconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
            decoration: TS.card(context),
            child: Column(
              children: [
                PhosphorIcon(icon, size: 26, color: TS.redOf(context)),
                const SizedBox(height: 8),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 12),
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
/// Find deals screen.
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
          height: 212,
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
                onTap: () {
                  uxTap();
                  onBrowse();
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
          height: 212,
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
              _DealThumb(imageUrl: deal.imageUrl),
              // Expanded, not a bare Padding: the strip has a fixed height,
              // so the text block must take exactly what is left rather than
              // its natural size, or a long product name overflows the card.
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        deal.retailerName.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TS.eyebrowOf(context).copyWith(fontSize: 9.5),
                      ),
                      const SizedBox(height: 3),
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

  static const _height = 88.0;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      height: _height,
      width: double.infinity,
      color: TS.surfaceSoftOf(context),
      alignment: Alignment.center,
      child: PhosphorIcon(PhosphorIconsFill.shoppingCart,
          size: 26, color: TS.mutedOf(context)),
    );
    if (imageUrl == null || imageUrl!.trim().isEmpty) return placeholder;
    return Container(
      height: _height,
      width: double.infinity,
      color: TS.surfaceSoftOf(context),
      child: Image.network(
        imageUrl!,
        fit: BoxFit.contain,
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
class _StatChipGrid extends StatelessWidget {
  const _StatChipGrid({required this.chips});

  final List<_StatChip> chips;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final columns = constraints.maxWidth > 520 ? 4 : 2;
          final width = (constraints.maxWidth - (columns - 1) * 10) / columns;
          return Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (final chip in chips) SizedBox(width: width, child: chip),
            ],
          );
        },
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
  Widget build(BuildContext context) => PressableScale(
        child: GestureDetector(
          onTap: () {
            uxTap();
            onTap();
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: TS.surfaceOf(context),
              border: Border.all(color: TS.lineSoftOf(context), width: 1.5),
            ),
            child: Row(
              children: [
                PhosphorIcon(icon, size: 20, color: TS.mutedOf(context)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(value,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 17,
                              height: 1.1)),
                      Text(label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: TS.mutedOf(context), fontSize: 11.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

/// Shown when one or more dashboard lanes could not refresh, so empty stats
/// are never mistaken for a real "you have nothing yet" state.
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
