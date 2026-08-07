import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';

class CoverageScreen extends StatefulWidget {
  const CoverageScreen({super.key, required this.api});

  final Api api;

  @override
  State<CoverageScreen> createState() => _CoverageScreenState();
}

class _CoverageScreenState extends State<CoverageScreen> {
  late Future<CoverageLedger> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.coverage();
  }

  void _reload() => setState(() => _future = widget.api.coverage());

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<CoverageLedger>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
            message: 'Could not load the coverage ledger.',
            detail: snapshot.error?.toString(),
            onRetry: _reload,
          );
        }
        return _CoverageBody(coverage: snapshot.data!, onRefresh: _reload);
      },
    );
  }
}

class _CoverageBody extends StatelessWidget {
  const _CoverageBody({required this.coverage, required this.onRefresh});

  final CoverageLedger coverage;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final summary = coverage.summary;
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            sliver: SliverList.list(children: [
              ScreenHeader(
                eyebrow: 'Proof, not promises',
                title: 'Coverage you can inspect',
                description:
                    'See where Trolley Scout has retailer sources, current catalogues, store locations and active deals. Every figure comes from the current source, catalogue and deal indexes.',
                action: IconButton(
                  tooltip: 'Refresh coverage',
                  onPressed: onRefresh,
                  icon: const Icon(Icons.refresh),
                ),
              ),
              LayoutBuilder(builder: (context, constraints) {
                final columns = constraints.maxWidth >= 720 ? 3 : 2;
                final width =
                    (constraints.maxWidth - (columns - 1) * 10) / columns;
                return Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _SummaryTile(
                        width: width,
                        icon: Icons.public,
                        label: 'Active markets',
                        value: summary.activeMarketCount),
                    _SummaryTile(
                        width: width,
                        icon: Icons.storefront_outlined,
                        label: 'Retailers listed',
                        value: summary.retailerCount),
                    _SummaryTile(
                        width: width,
                        icon: Icons.verified_outlined,
                        label: 'Official sources',
                        value: summary.officialSourceCount),
                    _SummaryTile(
                        width: width,
                        icon: Icons.location_on_outlined,
                        label: 'Stores mapped',
                        value: summary.discoveredStoreCount),
                    _SummaryTile(
                        width: width,
                        icon: Icons.local_offer_outlined,
                        label: 'Active deals',
                        value: summary.activeDealCount),
                    _SummaryTile(
                        width: width,
                        icon: Icons.menu_book_outlined,
                        label: 'Current catalogues',
                        value: summary.activeCatalogueCount),
                    _SummaryTile(
                        width: width,
                        icon: Icons.bolt_outlined,
                        label: 'Live markets',
                        value: summary.liveMarketCount),
                  ],
                );
              }),
              const SizedBox(height: 22),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MARKET LEDGER', style: TS.eyebrowOf(context)),
                        const SizedBox(height: 3),
                        Text('What is available right now',
                            style: Theme.of(context)
                                .textTheme
                                .headlineSmall
                                ?.merge(TS.display)),
                      ],
                    ),
                  ),
                  Text(_compactDate(coverage.generatedAt),
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 12)),
                ],
              ),
              const Divider(height: 24, thickness: 2),
              if (coverage.markets.isEmpty)
                const EmptyCard(
                  icon: Icons.public_off_outlined,
                  message: 'The first verified market is being prepared.',
                )
              else
                for (final market in coverage.markets) ...[
                  _MarketCard(market: market),
                  const SizedBox(height: 12),
                ],
              PaperCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.fact_check_outlined, color: TS.greenOf(context)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Counts can move as retailers publish or remove offers.',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'We show zero when a measure has no current evidence. We do not fill gaps with estimates.',
                            style: TextStyle(color: TS.mutedOf(context)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({
    required this.width,
    required this.icon,
    required this.label,
    required this.value,
  });

  final double width;
  final IconData icon;
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: PaperCard(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Icon(icon, color: TS.redOf(context), size: 23),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$value',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.merge(TS.display)),
                Text(label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 11)),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

class _MarketCard extends StatelessWidget {
  const _MarketCard({required this.market});

  final CoverageMarket market;

  @override
  Widget build(BuildContext context) {
    final status = _statusFor(market.freshness);
    final latest = _latestDate(market.lastDealCapturedAt,
        market.directoryCheckedAt, market.catalogueCheckedAt);
    return PaperCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(market.flag, style: const TextStyle(fontSize: 30)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(market.name,
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display)),
                    const SizedBox(height: 4),
                    Row(children: [
                      Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                            color: status.color(context),
                            shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 6),
                      Text(status.label,
                          style: const TextStyle(
                              fontSize: 11, fontWeight: FontWeight.w800)),
                    ]),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(status.detail,
              style: TextStyle(color: TS.mutedOf(context), fontSize: 12)),
          const SizedBox(height: 12),
          LayoutBuilder(builder: (context, constraints) {
            final width = (constraints.maxWidth - 8) / 2;
            return Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _MarketStat(
                    width: width,
                    label: 'Retailers',
                    value: market.retailerCount),
                _MarketStat(
                    width: width,
                    label: 'Official sources',
                    value: market.officialSourceCount),
                _MarketStat(
                    width: width,
                    label: 'Stores mapped',
                    value: market.discoveredStoreCount),
                _MarketStat(
                    width: width,
                    label: 'Stores with offers',
                    value: market.storesWithPromotionsCount),
                _MarketStat(
                    width: width,
                    label: 'Current catalogues',
                    value: market.activeCatalogueCount),
                _MarketStat(
                    width: width,
                    label: 'Catalogue retailers',
                    value: market.activeCatalogueRetailerCount),
                _MarketStat(
                    width: width,
                    label: 'Active deals',
                    value: market.activeDealCount),
                _MarketStat(
                    width: width,
                    label: 'Deal retailers',
                    value: market.activeDealRetailerCount),
              ],
            );
          }),
          const SizedBox(height: 10),
          Text(
            latest == null
                ? 'Official directory listed. Live catalogue and deal checks are still being added.'
                : 'Latest directory, catalogue or deal activity: ${_compactDate(latest)}',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _MarketStat extends StatelessWidget {
  const _MarketStat(
      {required this.width, required this.label, required this.value});

  final double width;
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: TS.surfaceSoftOf(context),
          borderRadius: BorderRadius.circular(TS.tileRadius),
          border: Border.all(color: TS.lineSoftOf(context)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: TextStyle(
                    color: TS.mutedOf(context),
                    fontSize: 9,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text('$value',
                style:
                    Theme.of(context).textTheme.titleMedium?.merge(TS.display)),
          ],
        ),
      );
}

typedef _StatusColor = Color Function(BuildContext context);

class _CoverageStatus {
  const _CoverageStatus(this.label, this.detail, this.color);

  final String label;
  final String detail;
  final _StatusColor color;
}

_CoverageStatus _statusFor(String freshness) => switch (freshness) {
      'live' => _CoverageStatus('LIVE', 'Activity checked within 24 hours',
          (context) => TS.greenOf(context)),
      'recent' => _CoverageStatus(
          'RECENT', 'Activity checked within 7 days', (_) => TS.yellow),
      _ => _CoverageStatus(
          'BUILDING',
          'Directory available, with live activity still growing',
          (context) => TS.faintOf(context)),
    };

String? _latestDate(String? left, String? right, String? third) {
  final values = [left, right, third].whereType<String>().toList()
    ..sort((a, b) => (DateTime.tryParse(b) ?? DateTime(0))
        .compareTo(DateTime.tryParse(a) ?? DateTime(0)));
  return values.isEmpty ? null : values.first;
}

String _compactDate(String value) {
  final parsed = DateTime.tryParse(value)?.toLocal();
  if (parsed == null) return 'Time pending';
  String two(int number) => number.toString().padLeft(2, '0');
  return '${parsed.year}-${two(parsed.month)}-${two(parsed.day)} ${two(parsed.hour)}:${two(parsed.minute)}';
}
