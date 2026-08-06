import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

/// The one place a Google ad appears in Trolley Scout.
///
/// There are no banners anywhere in this app and there will not be. A shopper
/// who cannot spare a subscription can open the rewards screen and trade their
/// own time instead — and nothing here runs, not even the SDK's own
/// initialisation, until they do. That is the difference between offering an
/// ad and showing one.
class RewardedAds {
  RewardedAds({RewardedAdLoader? loader}) : _loader = loader ?? _loadReal;

  final RewardedAdLoader _loader;
  bool _initialized = false;

  /// Google's public test unit, for a build that should never call for real
  /// fill: --dart-define=ADMOB_REWARDED_UNIT=ca-app-pub-3940256099942544/5224354917
  static const testRewardedUnit = 'ca-app-pub-3940256099942544/5224354917';

  /// Trolley Scout's own rewarded unit.
  static const rewardedUnitId = String.fromEnvironment(
    'ADMOB_REWARDED_UNIT',
    defaultValue: 'ca-app-pub-8288446924917589/2643935623',
  );

  /// True when the build is pointed at Google's test unit. The screen says so,
  /// rather than letting a tester think the rewards are real.
  static bool get isUsingTestAds => rewardedUnitId == testRewardedUnit;

  /// Starts the ads SDK. Called from the rewards screen only, never at launch.
  Future<void> ensureReady() async {
    if (_initialized) return;
    await MobileAds.instance.initialize();
    _initialized = true;
  }

  /// Shows one rewarded ad and resolves when it has been earned.
  ///
  /// Returns the ad's own view id, which the server uses to make sure one ad
  /// is only ever paid for once. Null means the shopper closed it early, the
  /// ad failed to load, or there was no fill — none of which earns anything.
  Future<String?> showOne() async {
    await ensureReady();
    final completer = Completer<String?>();
    try {
      await _loader(
        adUnitId: rewardedUnitId,
        onLoaded: (ad) async {
          var earned = false;
          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdDismissedFullScreenContent: (ad) {
              ad.dispose();
              if (!completer.isCompleted) {
                completer.complete(earned ? ad.responseInfo?.responseId : null);
              }
            },
            onAdFailedToShowFullScreenContent: (ad, error) {
              ad.dispose();
              if (!completer.isCompleted) completer.complete(null);
            },
          );
          await ad.show(
            onUserEarnedReward: (_, __) {
              earned = true;
            },
          );
        },
        onFailed: () {
          if (!completer.isCompleted) completer.complete(null);
        },
      );
    } catch (error) {
      debugPrint('Rewarded ad failed: $error');
      if (!completer.isCompleted) completer.complete(null);
    }
    return completer.future;
  }
}

/// Injectable so the reward flow can be tested without the Play Services SDK.
typedef RewardedAdLoader = Future<void> Function({
  required String adUnitId,
  required Future<void> Function(RewardedAd ad) onLoaded,
  required void Function() onFailed,
});

Future<void> _loadReal({
  required String adUnitId,
  required Future<void> Function(RewardedAd ad) onLoaded,
  required void Function() onFailed,
}) {
  return RewardedAd.load(
    adUnitId: adUnitId,
    request: const AdRequest(),
    rewardedAdLoadCallback: RewardedAdLoadCallback(
      onAdLoaded: (ad) => onLoaded(ad),
      onAdFailedToLoad: (error) {
        debugPrint('Rewarded ad did not load: ${error.message}');
        onFailed();
      },
    ),
  );
}
