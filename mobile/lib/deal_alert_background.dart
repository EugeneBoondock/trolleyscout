import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import 'api.dart';
import 'deal_categories.dart';
import 'deal_alert_scheduler.dart';
import 'discovery_cache.dart';
import 'notification_prefs_store.dart';
import 'notifications.dart';
import 'taste_profile.dart';

typedef DealAlertNotify = FutureOr<bool> Function(
  int count,
  bool personalized,
);
typedef ExpiringDealNotify = FutureOr<bool> Function(int count, String? title);
typedef PriceDropNotify = FutureOr<bool> Function(int count, String? title);

class DealAlertPoller {
  DealAlertPoller({
    Api? api,
    NotificationPrefsStore? preferences,
    DealAlertScheduler? scheduler,
    DiscoveryCache? discoveryCache,
    TasteStore? tasteStore,
    DealAlertNotify? notify,
    ExpiringDealNotify? notifyExpiring,
    PriceDropNotify? notifyPriceDrop,
  })  : _api = api ?? Api(),
        _preferences = preferences ?? NotificationPrefsStore(),
        _scheduler = scheduler ?? DealAlertScheduler(),
        _discoveryCache = discoveryCache ?? DiscoveryCache(),
        _tasteStore = tasteStore ?? TasteStore(),
        _notify = notify ??
            ((count, personalized) => DealNotifications.instance.showNewDeals(
                  count,
                  personalized: personalized,
                )),
        _notifyExpiring = notifyExpiring ??
            ((count, title) => DealNotifications.instance
                .showExpiringSavedDeals(count, firstTitle: title)),
        _notifyPriceDrop = notifyPriceDrop ??
            ((count, title) => DealNotifications.instance
                .showSavedDealPriceDrops(count, firstTitle: title));

  final Api _api;
  final NotificationPrefsStore _preferences;
  final DealAlertScheduler _scheduler;
  final DiscoveryCache _discoveryCache;
  final TasteStore _tasteStore;
  final DealAlertNotify _notify;
  final ExpiringDealNotify _notifyExpiring;
  final PriceDropNotify _notifyPriceDrop;

  Future<bool> run() async {
    await _preferences.reload();
    if (!await _preferences.loadOptIn()) return true;

    try {
      await _api.restoreCachedMemberContext();
      final previousCursor = await _preferences.loadDealAlertCursor();
      final summary = await _api.dealAlerts(after: previousCursor);

      if (!summary.enabled) {
        await _disablePermanentWork();
        return true;
      }

      if (previousCursor == null) {
        await _saveCachedDiscoveryBaseline();
        await _preferences.saveDealAlertCursor(summary.latestCursor);
        return true;
      }

      if (summary.totalNewDealCount > 0) {
        final selection = await _selectNewDeals(
          summary.totalNewDealCount,
          countCapped: summary.countCapped,
        );
        if (selection == null) return false;
        if (selection.matchingDeals.isNotEmpty) {
          final delivered = await _notify(
            selection.matchingDeals.length,
            selection.personalized,
          );
          if (!delivered) return false;
          await _preferences.saveLastAlertAt(DateTime.now());
        }
        await _preferences.saveSeenDealIds(selection.currentDealIds);
      }
      // Saved offers close on their own schedule, so this is checked whether or
      // not new deals landed. It is warned about once a day at most, because a
      // deal stays "ending soon" for several polls in a row.
      if (summary.expiringSavedDealCount > 0 && await _expiryWarningIsDue()) {
        final warned = await _notifyExpiring(
          summary.expiringSavedDealCount,
          summary.expiringSavedDealTitle,
        );
        if (warned) {
          await _preferences.saveLastExpiryWarningAt(DateTime.now());
        }
      }
      // Good news travels on the same daily cap as bad: a saved deal that got
      // cheaper stays cheaper across polls, and one nudge a day is plenty.
      if (summary.priceDropCount > 0 && await _priceDropAlertIsDue()) {
        final told = await _notifyPriceDrop(
          summary.priceDropCount,
          summary.priceDropTitle,
        );
        if (told) {
          await _preferences.saveLastPriceDropAlertAt(DateTime.now());
        }
      }
      await _preferences.saveDealAlertCursor(summary.latestCursor);
      return true;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _disablePermanentWork();
        return true;
      }
      debugPrint('Deal alert background check failed: $error');
      return false;
    } catch (error) {
      debugPrint('Deal alert background check failed: $error');
      return false;
    }
  }

  Future<void> _saveCachedDiscoveryBaseline() async {
    final cached = await _discoveryCache.load(
      _api.effectiveCountryCode,
      _api.discoveryCacheScope,
    );
    await _preferences.saveSeenDealIds(
      cached?.result.deals.map(_dealIdentity) ?? const <String>[],
    );
  }

  /// A global alert batch is only a cheap signal that something changed. The
  /// device then reads the stored discovery feed once, compares it with its
  /// previous baseline, and applies the private TasteStore profile locally.
  Future<_DealAlertSelection?> _selectNewDeals(
    int globalNewDealCount, {
    required bool countCapped,
  }) async {
    final countryCode = _api.effectiveCountryCode;
    final cached = await _discoveryCache.load(
      countryCode,
      _api.discoveryCacheScope,
    );
    final storedSeen = await _preferences.loadSeenDealIds();
    final seen = storedSeen ??
        cached?.result.deals.map(_dealIdentity).toSet() ??
        const <String>{};

    DiscoveryResult discovery;
    var fetched = false;
    try {
      discovery = await _api.discovery();
      fetched = true;
      await _discoveryCache.save(
        discovery,
        DateTime.now(),
        countryCode,
        _api.discoveryCacheScope,
      );
    } catch (_) {
      if (cached == null) return null;
      discovery = cached.result;
    }

    final currentDealIds = discovery.deals.map(_dealIdentity).toSet();
    final unseen = discovery.deals
        .where((deal) => !deal.soldOut && !seen.contains(_dealIdentity(deal)))
        .toList()
      ..sort(_newestDealFirst);

    // A stale cache that contains no change cannot prove which batch arrived.
    // Ask WorkManager to retry instead of advancing the cursor and losing it.
    if (!fetched && unseen.isEmpty) return null;

    final candidateLimit = countCapped
        ? NotificationPrefsStore.maximumSeenDealIds
        : globalNewDealCount
            .clamp(1, NotificationPrefsStore.maximumSeenDealIds)
            .toInt();
    final candidates = unseen.take(candidateLimit).toList(growable: false);
    final taste = await _tasteStore.load();
    if (taste.isEmpty) {
      return _DealAlertSelection(
        currentDealIds: currentDealIds,
        matchingDeals: candidates,
        personalized: false,
      );
    }

    final matching = candidates
        .where(
          (deal) =>
              taste.score(
                deal.title,
                category: _dealTasteCategory(deal),
              ) >
              0,
        )
        .toList(growable: false);
    return _DealAlertSelection(
      currentDealIds: currentDealIds,
      matchingDeals: matching,
      personalized: true,
    );
  }

  Future<bool> _expiryWarningIsDue() async {
    final last = await _preferences.loadLastExpiryWarningAt();
    if (last == null) return true;
    return DateTime.now().difference(last) >= const Duration(hours: 20);
  }

  Future<bool> _priceDropAlertIsDue() async {
    final last = await _preferences.loadLastPriceDropAlertAt();
    if (last == null) return true;
    return DateTime.now().difference(last) >= const Duration(hours: 20);
  }

  Future<void> _disablePermanentWork() async {
    await _preferences.clear();
    await _scheduler.setEnabled(false);
  }
}

class _DealAlertSelection {
  const _DealAlertSelection({
    required this.currentDealIds,
    required this.matchingDeals,
    required this.personalized,
  });

  final Set<String> currentDealIds;
  final List<Deal> matchingDeals;
  final bool personalized;
}

String _dealIdentity(Deal deal) {
  final id = deal.id.trim();
  if (id.isNotEmpty) {
    return 'id:${id.length <= 237 ? id : id.substring(0, 237)}';
  }
  final value = [
    deal.retailerId,
    deal.title,
    deal.productUrl ?? deal.sourceUrl,
  ].join('|').trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  return 'deal:${value.length <= 235 ? value : value.substring(0, 235)}';
}

String _dealTasteCategory(Deal deal) {
  final classification = classifyDeal(
    deal.title,
    deal.retailerId,
    DealClassificationContext(
      evidenceText: deal.evidenceText,
      retailerName: deal.retailerName,
      sourceLabel: deal.sourceLabel,
      sourceUrl: deal.sourceUrl,
    ),
  );
  return [
    classification.category.name,
    if (classification.foodSubcategory != null)
      classification.foodSubcategory!.name,
  ].join(' ');
}

int _newestDealFirst(Deal left, Deal right) {
  final leftAt = DateTime.tryParse(left.capturedAt);
  final rightAt = DateTime.tryParse(right.capturedAt);
  if (leftAt == null && rightAt == null) {
    return left.title.compareTo(right.title);
  }
  if (leftAt == null) return 1;
  if (rightAt == null) return -1;
  return rightAt.compareTo(leftAt);
}

@pragma('vm:entry-point')
void dealAlertCallbackDispatcher() {
  Workmanager().executeTask((task, _) async {
    WidgetsFlutterBinding.ensureInitialized();
    if (task != DealAlertScheduler.taskName) return true;
    return DealAlertPoller().run();
  });
}

Future<void>? _backgroundInitialization;

Future<void> initializeDealAlertBackground() =>
    _backgroundInitialization ??= _initializeDealAlertBackground();

Future<void> _initializeDealAlertBackground() async {
  try {
    await Workmanager().initialize(dealAlertCallbackDispatcher);
  } catch (error) {
    debugPrint('Deal alert background initialization failed: $error');
  }
}
