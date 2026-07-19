import 'package:flutter/material.dart';

import '../api.dart';
import '../widgets/app_drawer.dart';
import '../widgets/common.dart';

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
    final results = await Future.wait<dynamic>([
      widget.api.discovery(summary: true),
      widget.api.retailers(),
      widget.api.discoveredStores(),
      widget.api.savedDeals(),
      widget.api.savedSources(),
      widget.api.basket(),
      widget.api.offers(),
    ]);
    return _DashboardData(
      discovery: results[0] as DiscoveryResult,
      retailers: results[1] as RetailerCatalog,
      discovered: results[2] as DiscoveredStoresResult,
      savedDeals: results[3] as List<SavedDeal>,
      savedSources: results[4] as List<SavedSource>,
      basket: results[5] as Basket,
      offers: results[6] as List<VerifiedOffer>,
    );
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
            padding: const EdgeInsets.all(16),
            children: [
              ScreenHeader(
                eyebrow: 'Member workspace',
                title: 'Member dashboard',
                description:
                    'Welcome back, ${account?.displayName ?? 'Scout'}. Your ${account?.planName ?? 'Free'} plan is active.',
                action: IconButton(
                    tooltip: 'Refresh dashboard',
                    onPressed: _refresh,
                    icon: const Icon(Icons.refresh)),
              ),
              LayoutBuilder(
                builder: (context, constraints) {
                  final width = constraints.maxWidth > 620
                      ? (constraints.maxWidth - 12) / 2
                      : constraints.maxWidth;
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      SizedBox(
                        width: width,
                        child: MetricCard(
                          label: 'member list',
                          value:
                              '${data.savedDeals.length} saved deal${data.savedDeals.length == 1 ? '' : 's'}',
                          icon: Icons.wallet_outlined,
                          onTap: () =>
                              widget.onNavigate(AppDestination.savedDeals),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: MetricCard(
                          label: 'basket total',
                          value: formatRand(data.basket.summary.totalCents),
                          icon: Icons.shopping_basket_outlined,
                          onTap: () => widget.onNavigate(AppDestination.basket),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: MetricCard(
                          label: 'total savings',
                          value: formatRand(data.basket.summary.savingsCents),
                          icon: Icons.savings_outlined,
                          onTap: () => widget.onNavigate(AppDestination.basket),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: MetricCard(
                          label: 'saved sources',
                          value: '${data.savedSources.length}',
                          icon: Icons.bookmark_outline,
                          onTap: () =>
                              widget.onNavigate(AppDestination.savedSources),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: MetricCard(
                          label: 'live deals',
                          value: '${data.discovery.foundDealCount}',
                          icon: Icons.local_offer_outlined,
                          onTap: () => widget.onNavigate(AppDestination.deals),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: MetricCard(
                          label: 'verified offers',
                          value: '${data.offers.length}',
                          icon: Icons.verified_outlined,
                          onTap: () => widget.onNavigate(AppDestination.offers),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: MetricCard(
                          label: 'covered stores',
                          value:
                              '${data.retailers.retailers.length + data.discovered.storeCount}',
                          icon: Icons.storefront_outlined,
                          onTap: () => widget.onNavigate(AppDestination.stores),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DashboardData {
  const _DashboardData({
    required this.discovery,
    required this.retailers,
    required this.discovered,
    required this.savedDeals,
    required this.savedSources,
    required this.basket,
    required this.offers,
  });

  final DiscoveryResult discovery;
  final RetailerCatalog retailers;
  final DiscoveredStoresResult discovered;
  final List<SavedDeal> savedDeals;
  final List<SavedSource> savedSources;
  final Basket basket;
  final List<VerifiedOffer> offers;
}
