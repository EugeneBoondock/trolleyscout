import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, required this.api});

  final Api api;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  late Future<AdminOverview> _future = widget.api.adminOverview();

  void _reload() => setState(() {
        _future = widget.api.adminOverview();
      });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AdminOverview>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Admin data is unavailable.', onRetry: _reload);
        }
        final overview = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Admin',
              title: 'Admin console',
              description: 'Accounts, plans, and scout status.',
            ),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Accounts',
                        value: '${overview.accountCount}',
                        icon: Icons.people_outline)),
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Stored deals',
                        value: '${overview.dealCount}',
                        icon: Icons.local_offer_outlined)),
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Leaflets',
                        value: '${overview.leafletCount}',
                        icon: Icons.menu_book_outlined)),
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Sources',
                        value: '${overview.sourceCount}',
                        icon: Icons.storefront_outlined)),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                for (final entry in overview.planCounts.entries)
                  Chip(label: Text('${entry.key}: ${entry.value}')),
              ],
            ),
            const SizedBox(height: 20),
            AdReviewSection(api: widget.api),
            const SizedBox(height: 20),
            Text('Recent accounts',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.merge(TS.display)),
            const SizedBox(height: 8),
            for (final account in overview.accounts)
              PaperCard(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(child: Text(account.initials)),
                  title: Text(account.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(
                      '${account.email}\nJoined ${account.createdAt.split('T').first}'),
                  isThreeLine: true,
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(account.planName),
                      Text(account.role, style: TS.eyebrowOf(context))
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// The ad approval queue. Pending ads surface first with Approve / Reject
/// actions; approving lets the advertiser pay, rejecting closes the ad.
class AdReviewSection extends StatefulWidget {
  const AdReviewSection({super.key, required this.api});

  final Api api;

  @override
  State<AdReviewSection> createState() => _AdReviewSectionState();
}

class _AdReviewSectionState extends State<AdReviewSection> {
  List<AdSubmission> _ads = const [];
  bool _loading = true;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result = await widget.api.adminAds();
      if (mounted) {
        setState(() {
          _ads = result.ads;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _review(AdSubmission ad, String decision) async {
    if (_busyId != null) return;
    setState(() => _busyId = ad.id);
    try {
      uxTap();
      final result = await widget.api.reviewAd(ad.id, decision);
      if (mounted) setState(() => _ads = result.ads);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = _ads.where((ad) => ad.status == 'pending').toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Ad review (${pending.length} pending)',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.merge(TS.display)),
            ),
            IconButton(
              tooltip: 'Refresh',
              onPressed: _load,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_loading)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text('Loading ads…',
                style: TextStyle(color: TS.mutedOf(context))),
          )
        else if (_ads.isEmpty)
          Text('No ads submitted yet.',
              style: TextStyle(color: TS.mutedOf(context)))
        else
          for (final ad in _ads)
            PaperCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(ad.title,
                            style: const TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 15)),
                      ),
                      Text(ad.status.toUpperCase(),
                          style: TS.eyebrowOf(context)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(ad.bodyText,
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 13)),
                  const SizedBox(height: 4),
                  Text(
                    '${_rand(ad.amountCents)} · ${ad.placement == 'near_me' ? 'Near me' : 'Deals feed'} · '
                    '${ad.reach} people${ad.province != null ? ' · ${ad.province}' : ''}',
                    style: TextStyle(color: TS.faintOf(context), fontSize: 12),
                  ),
                  Text(ad.targetUrl,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: TS.redOf(context), fontSize: 12)),
                  if (ad.status == 'pending') ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: TS.green,
                              foregroundColor: Colors.white,
                              shape: const RoundedRectangleBorder(),
                            ),
                            onPressed: _busyId == ad.id
                                ? null
                                : () => _review(ad, 'approved'),
                            child: const Text('Approve'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: TS.redOf(context),
                              side: BorderSide(
                                  color: TS.redOf(context), width: 2),
                              shape: const RoundedRectangleBorder(),
                            ),
                            onPressed: _busyId == ad.id
                                ? null
                                : () => _review(ad, 'rejected'),
                            child: const Text('Reject'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
      ],
    );
  }

  String _rand(int cents) {
    final amount = cents / 100;
    return 'R${amount == amount.roundToDouble() ? amount.toStringAsFixed(0) : amount.toStringAsFixed(2)}';
  }
}
