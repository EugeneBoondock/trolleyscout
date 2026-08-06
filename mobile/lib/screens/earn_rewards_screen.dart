import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../api.dart';
import '../rewarded_ads.dart';
import '../theme.dart';

/// Trade time for what money would otherwise buy.
///
/// Trolley Scout carries no ad banners. This screen is the only place an ad
/// appears, it has to be opened on purpose, and every ad is started by a
/// deliberate press. Someone who cannot spare a subscription this month can
/// still earn fittings and a bigger Marketplace — and someone who never opens
/// this screen never sees a single ad.
class EarnRewardsScreen extends StatefulWidget {
  const EarnRewardsScreen({super.key, required this.api, this.ads});

  final Api api;

  /// Injectable so the flow can be exercised without the Play Services SDK.
  final RewardedAds? ads;

  @override
  State<EarnRewardsScreen> createState() => _EarnRewardsScreenState();
}

class _EarnRewardsScreenState extends State<EarnRewardsScreen> {
  late final RewardedAds _ads = widget.ads ?? RewardedAds();
  AdRewardState? _state;
  String? _error;
  String? _watching;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final state = await widget.api.adRewards();
      if (!mounted) return;
      setState(() {
        _state = state;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = 'Rewards could not be loaded. Pull to try again.');
    }
  }

  Future<void> _watch(AdRewardRate rate) async {
    setState(() => _watching = rate.kind);
    try {
      final viewId = await _ads.showOne();
      if (!mounted) return;
      if (viewId == null) {
        _say('No reward this time the ad has to finish to count.');
        return;
      }
      final outcome = await widget.api.claimAdReward(rate.kind, viewId);
      if (!mounted) return;
      setState(() => _state = _state == null
          ? null
          : AdRewardState(
              maxAdsPerDay: _state!.maxAdsPerDay,
              rates: _state!.rates,
              progress: outcome.progress,
            ));
      if (outcome.granted > 0) {
        _say('Earned: ${rate.label}.');
      } else {
        _say(outcome.reason ?? _remainingText(rate, outcome.progress));
      }
    } catch (error) {
      if (mounted) _say('That could not be claimed. Try again in a moment.');
    } finally {
      if (mounted) setState(() => _watching = null);
    }
  }

  String _remainingText(AdRewardRate rate, AdRewardProgress progress) {
    final banked = progress.progress[rate.kind] ?? 0;
    final left = rate.adsPerReward - banked;
    return left == 1
        ? 'One more ad for a ${rate.label.toLowerCase()}.'
        : '$left more ads for a ${rate.label.toLowerCase()}.';
  }

  void _say(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return Scaffold(
      appBar: AppBar(title: const Text('Earn rewards')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            const _RewardsIntro(),
            const SizedBox(height: 14),
            if (_error != null)
              Text(_error!, style: Theme.of(context).textTheme.bodyMedium),
            if (state == null && _error == null)
              const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: CircularProgressIndicator(),
                ),
              ),
            if (state != null) ...[
              _DailyAllowance(state: state),
              const SizedBox(height: 14),
              for (final rate in state.rates) ...[
                _RewardCard(
                  rate: rate,
                  banked: state.progress.progress[rate.kind] ?? 0,
                  earned: state.progress.earned[rate.kind] ?? 0,
                  busy: _watching != null,
                  spinning: _watching == rate.kind,
                  outOfAds: state.progress.adsRemainingToday <= 0,
                  onWatch: () => _watch(rate),
                ),
                const SizedBox(height: 12),
              ],
              if (RewardedAds.isUsingTestAds)
                Text(
                  'This build is running Google’s test ads, so rewards here '
                  'are for checking the flow rather than for real.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RewardsIntro extends StatelessWidget {
  const _RewardsIntro();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: TS.cardFill(context),
      foregroundDecoration: TS.cardStroke(context),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Time instead of money',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'Trolley Scout has no ad banners and never will. This is the only '
            'place an ad appears, you have to come here to see one, and every '
            'ad is one you chose to start.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _DailyAllowance extends StatelessWidget {
  const _DailyAllowance({required this.state});

  final AdRewardState state;

  @override
  Widget build(BuildContext context) {
    final left = state.progress.adsRemainingToday;
    return Row(
      children: [
        Icon(PhosphorIcons.playCircle(PhosphorIconsStyle.fill),
            size: 18, color: TS.mutedOf(context)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            left <= 0
                ? 'That is today’s ${state.maxAdsPerDay} watched. More tomorrow.'
                : '$left of ${state.maxAdsPerDay} ads left today',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _RewardCard extends StatelessWidget {
  const _RewardCard({
    required this.rate,
    required this.banked,
    required this.earned,
    required this.busy,
    required this.spinning,
    required this.outOfAds,
    required this.onWatch,
  });

  final AdRewardRate rate;
  final int banked;
  final int earned;
  final bool busy;
  final bool spinning;
  final bool outOfAds;
  final VoidCallback onWatch;

  @override
  Widget build(BuildContext context) {
    final capped = rate.lifetimeCap != null && earned >= rate.lifetimeCap!;
    final left = (rate.adsPerReward - banked).clamp(1, rate.adsPerReward);
    return Container(
      decoration: TS.cardFill(context),
      foregroundDecoration: TS.cardStroke(context),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            rate.label,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(rate.description,
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(TS.pillRadius),
            child: LinearProgressIndicator(
              value: rate.adsPerReward == 0 ? 0 : banked / rate.adsPerReward,
              minHeight: 8,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            capped
                ? 'All ${rate.lifetimeCap} earned. Nothing more to unlock here.'
                : '$banked of ${rate.adsPerReward} watched $left to go',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: busy || capped || outOfAds ? null : onWatch,
              icon: spinning
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(PhosphorIcons.play(PhosphorIconsStyle.fill), size: 16),
              label: Text(
                capped
                    ? 'Earned'
                    : outOfAds
                        ? 'Back tomorrow'
                        : 'Watch an ad',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
