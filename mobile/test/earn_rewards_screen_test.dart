import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/rewarded_ads.dart';
import 'package:trolley_scout/screens/earn_rewards_screen.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpScreen(
    WidgetTester tester,
    Api api, {
    RewardedAds? ads,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        home: EarnRewardsScreen(api: api, ads: ads),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('says plainly that this is the only place ads appear',
      (tester) async {
    await pumpScreen(tester, _RewardApi());

    expect(find.text('Time instead of money'), findsOneWidget);
    expect(
      find.textContaining('no ad banners and never will'),
      findsOneWidget,
    );
    // Both bargains are stated in ads, not in vague "points".
    expect(find.textContaining('0 of 5 watched'), findsOneWidget);
    expect(find.textContaining('0 of 3 watched'), findsOneWidget);
  });

  testWidgets('the watch button is dead once the day is spent', (tester) async {
    await pumpScreen(tester, _RewardApi(adsRemaining: 0));

    expect(find.text('Back tomorrow'), findsNWidgets(2));
    // byType matches the exact runtime type, and FilledButton.icon builds a
    // subclass, so the predicate is the finder that actually sees it.
    final button = tester.widget<FilledButton>(
      find.byWidgetPredicate((widget) => widget is FilledButton).first,
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('a finished ad is claimed and the progress moves', (tester) async {
    final api = _RewardApi();
    await pumpScreen(tester, api, ads: _AlwaysEarns());

    await tester.tap(find.text('Watch an ad').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(api.claimed, [('fitting', 'test-view-1')]);
    expect(find.textContaining('1 of 5 watched'), findsOneWidget);
  });
}

/// A stand-in for the rewards endpoint, so the screen can be exercised without
/// a server or the ads SDK.
class _RewardApi extends Api {
  _RewardApi({this.adsRemaining = 4}) : super(baseUrl: 'https://example.test');

  final int adsRemaining;
  final List<(String, String)> claimed = [];
  int _fittingProgress = 0;

  @override
  Future<AdRewardState> adRewards() async => _state();

  @override
  Future<AdRewardOutcome> claimAdReward(String kind, String viewId) async {
    claimed.add((kind, viewId));
    if (kind == 'fitting') _fittingProgress += 1;
    return AdRewardOutcome(
      granted: 0,
      kind: kind,
      progress: _state().progress,
    );
  }

  AdRewardState _state() => AdRewardState(
        maxAdsPerDay: 4,
        rates: const [
          AdRewardRate(
            kind: 'fitting',
            label: 'Fitting-room credit',
            description: 'Five ads pay for one fitting-room render.',
            adsPerReward: 5,
          ),
          AdRewardRate(
            kind: 'source',
            label: 'Extra Marketplace store',
            description:
                'Three ads add one more store to the shops your Marketplace watches.',
            adsPerReward: 3,
            lifetimeCap: 5,
          ),
        ],
        progress: AdRewardProgress(
          adsToday: 4 - adsRemaining,
          adsRemainingToday: adsRemaining,
          progress: {'fitting': _fittingProgress, 'source': 0},
          earned: const {'fitting': 0, 'source': 0},
        ),
      );
}

/// An ad that always plays through, so the claim path can be tested without
/// Play Services.
class _AlwaysEarns implements RewardedAds {
  @override
  Future<void> ensureReady() async {}

  @override
  Future<String?> showOne() async => 'test-view-1';
}
