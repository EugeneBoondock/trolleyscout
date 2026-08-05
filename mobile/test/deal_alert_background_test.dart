import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/deal_alert_background.dart';
import 'package:trolley_scout/deal_alert_scheduler.dart';
import 'package:trolley_scout/discovery_cache.dart';
import 'package:trolley_scout/notification_prefs_store.dart';
import 'package:trolley_scout/taste_profile.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('an opted-out background check does not request the alert inbox',
      () async {
    final api = _AlertApi(latestCursor: 4, newDealCount: 2);
    final alerts = <int>[];

    final completed = await DealAlertPoller(
      api: api,
      notify: (count, _) {
        alerts.add(count);
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(api.afterCursors, isEmpty);
    expect(alerts, isEmpty);
  });

  test('the first background check records the inbox cursor without alerting',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    final alerts = <int>[];
    final api = _AlertApi(latestCursor: 7, newDealCount: 3);

    final completed = await DealAlertPoller(
      api: api,
      preferences: preferences,
      notify: (count, _) {
        alerts.add(count);
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(await preferences.loadDealAlertCursor(), 7);
    expect(await preferences.loadSeenDealIds(), isEmpty);
    expect(api.discoveryCalls, 0);
    expect(alerts, isEmpty);
  });

  test('the seen baseline retains the 25,000-deal discovery safety cap',
      () async {
    final preferences = NotificationPrefsStore();
    final ids = List.generate(25001, (index) => 'id:deal-$index');

    await preferences.saveSeenDealIds(ids);

    final stored = await preferences.loadSeenDealIds();
    expect(stored, hasLength(25000));
    expect(stored, contains('id:deal-24999'));
    expect(stored, isNot(contains('id:deal-25000')));
  });

  test('a background check restores the member country before cache access',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(7);
    final api = _AlertApi(
      latestCursor: 8,
      newDealCount: 1,
      memberCountryCode: 'GB',
      discoveryDeals: const [_coffeeDeal],
    );
    final cache = _RecordingDiscoveryCache();

    final completed = await DealAlertPoller(
      api: api,
      preferences: preferences,
      discoveryCache: cache,
      notify: (_, __) => true,
    ).run();

    expect(completed, isTrue);
    expect(api.memberContextRestored, isTrue);
    expect(cache.loadedCountryCodes, ['GB']);
    expect(cache.savedCountryCodes, ['GB']);
  });

  test('a new server batch produces one notification and advances the cursor',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(7);
    final alerts = <String>[];
    final api = _AlertApi(latestCursor: 8, newDealCount: 2);
    final poller = DealAlertPoller(
      api: api,
      preferences: preferences,
      notify: (count, personalized) {
        alerts.add('$count:$personalized');
        return true;
      },
    );

    expect(await poller.run(), isTrue);
    expect(api.afterCursors, [7]);
    expect(api.discoveryCalls, 1);
    expect(alerts, ['2:false']);
    expect(await preferences.loadDealAlertCursor(), 8);

    expect(await poller.run(), isTrue);
    expect(api.afterCursors, [7, 8]);
    expect(api.discoveryCalls, 1);
    expect(
      alerts,
      ['2:false'],
      reason: 'the same server batch must not alert twice',
    );
  });

  test('a capped alert batch can inspect the full discovery safety window',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(7);
    final discoveryDeals = List.generate(
      10000,
      (index) => Deal(
        id: 'large-feed-$index',
        retailerId: 'shop-$index',
        retailerName: 'Shop $index',
        sourceLabel: 'Daily deals',
        sourceUrl: 'https://example.test/shop-$index',
        title: 'Product $index',
        capturedAt: '2026-07-27T09:00:00.000Z',
      ),
    );
    var notifiedCount = 0;

    final completed = await DealAlertPoller(
      api: _AlertApi(
        latestCursor: 8,
        newDealCount: 9999,
        countCapped: true,
        discoveryDeals: discoveryDeals,
      ),
      preferences: preferences,
      discoveryCache: _RecordingDiscoveryCache(),
      notify: (count, _) {
        notifiedCount = count;
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(notifiedCount, 10000);
  });

  test('taste matches produce a personalized closed-app alert', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(7);
    await preferences.saveSeenDealIds(['id:old-deal']);
    await TasteStore().recordSignal(
      title: 'Nike running shoes',
      weight: 2,
    );
    final alerts = <String>[];
    final api = _AlertApi(
      latestCursor: 8,
      newDealCount: 2,
      discoveryDeals: const [_shoeDeal, _coffeeDeal],
    );

    final completed = await DealAlertPoller(
      api: api,
      preferences: preferences,
      notify: (count, personalized) {
        alerts.add('$count:$personalized');
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(api.discoveryCalls, 1);
    expect(alerts, ['1:true']);
    expect(await preferences.loadDealAlertCursor(), 8);
  });

  test('a non-matching global batch does not interrupt the shopper', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(7);
    await preferences.saveSeenDealIds(['id:old-deal']);
    await TasteStore().recordSignal(
      title: 'Nike running shoes',
      weight: 2,
    );
    final alerts = <String>[];
    final api = _AlertApi(
      latestCursor: 8,
      newDealCount: 1,
      discoveryDeals: const [_coffeeDeal],
    );

    final completed = await DealAlertPoller(
      api: api,
      preferences: preferences,
      notify: (count, personalized) {
        alerts.add('$count:$personalized');
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(api.discoveryCalls, 1);
    expect(alerts, isEmpty);
    expect(await preferences.loadDealAlertCursor(), 8);
    expect(await preferences.loadSeenDealIds(), isNotEmpty);
  });

  test('a failed inbox read asks the background scheduler to retry', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);

    final completed = await DealAlertPoller(
      api: _AlertApi(latestCursor: 1, newDealCount: 1, fail: true),
      preferences: preferences,
      notify: (_, __) => true,
    ).run();

    expect(completed, isFalse);
    expect(await preferences.loadDealAlertCursor(), isNull);
  });

  test('a failed notification keeps the cursor so the batch can retry',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(4);

    final completed = await DealAlertPoller(
      api: _AlertApi(latestCursor: 5, newDealCount: 2),
      preferences: preferences,
      notify: (_, __) => false,
    ).run();

    expect(completed, isFalse);
    expect(await preferences.loadDealAlertCursor(), 4);
  });

  test('a failed discovery read keeps the new batch for a later retry',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(4);

    final completed = await DealAlertPoller(
      api: _AlertApi(
        latestCursor: 5,
        newDealCount: 1,
        discoveryFailure: true,
      ),
      preferences: preferences,
      notify: (_, __) => true,
    ).run();

    expect(completed, isFalse);
    expect(await preferences.loadDealAlertCursor(), 4);
  });

  test('an unauthorized inbox disables local work without retrying', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(4);
    final tasks = _TaskPlatform();

    final completed = await DealAlertPoller(
      api: _AlertApi(
        latestCursor: 5,
        newDealCount: 1,
        failure: const ApiException('Signed out', statusCode: 401),
      ),
      preferences: preferences,
      scheduler: DealAlertScheduler(platform: tasks),
      notify: (_, __) => true,
    ).run();

    expect(completed, isTrue);
    expect(await preferences.loadOptIn(), isFalse);
    expect(await preferences.loadDealAlertCursor(), isNull);
    expect(tasks.cancelledNames, [DealAlertScheduler.uniqueTaskName]);
  });

  test('a saved offer that is closing warns the shopper', () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(3);
    final warnings = <String>[];

    final completed = await DealAlertPoller(
      api: _AlertApi(
        latestCursor: 4,
        newDealCount: 0,
        expiringCount: 2,
        expiringTitle: 'Rice 2kg',
      ),
      preferences: preferences,
      notify: (_, __) => true,
      notifyExpiring: (count, title) {
        warnings.add('$count:$title');
        return true;
      },
    ).run();

    expect(completed, isTrue);
    expect(warnings, ['2:Rice 2kg']);
  });

  test('the closing warning is not repeated on the next check that day',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(3);
    final warnings = <int>[];

    DealAlertPoller poller() => DealAlertPoller(
          api: _AlertApi(latestCursor: 4, newDealCount: 0, expiringCount: 1),
          preferences: preferences,
          notify: (_, __) => true,
          notifyExpiring: (count, _) {
            warnings.add(count);
            return true;
          },
        );

    await poller().run();
    await poller().run();

    expect(warnings, hasLength(1));
  });

  test('no closing warning is sent when nothing a shopper saved is ending',
      () async {
    final preferences = NotificationPrefsStore();
    await preferences.saveOptIn(true);
    await preferences.saveDealAlertCursor(3);
    var warned = false;

    await DealAlertPoller(
      api: _AlertApi(latestCursor: 4, newDealCount: 1, expiringCount: 0),
      preferences: preferences,
      notify: (_, __) => true,
      notifyExpiring: (_, __) {
        warned = true;
        return true;
      },
    ).run();

    expect(warned, isFalse);
  });
}

class _AlertApi extends Api {
  _AlertApi({
    required this.latestCursor,
    required this.newDealCount,
    this.fail = false,
    this.failure,
    this.expiringCount = 0,
    this.expiringTitle,
    this.discoveryDeals = const [_shoeDeal, _coffeeDeal],
    this.discoveryFailure = false,
    this.memberCountryCode = 'ZA',
    this.countCapped = false,
  }) : super(baseUrl: 'https://example.test');

  final int latestCursor;
  final int newDealCount;
  final int expiringCount;
  final String? expiringTitle;
  final List<Deal> discoveryDeals;
  final bool discoveryFailure;
  final String memberCountryCode;
  final bool countCapped;
  final bool fail;
  final Object? failure;
  final List<int?> afterCursors = [];
  int discoveryCalls = 0;
  bool memberContextRestored = false;

  @override
  String get effectiveCountryCode =>
      memberContextRestored ? memberCountryCode : 'ZA';

  @override
  Future<void> restoreCachedMemberContext() async {
    memberContextRestored = true;
  }

  @override
  Future<DealAlertSummary> dealAlerts({int? after}) async {
    afterCursors.add(after);
    if (failure != null) throw failure!;
    if (fail) throw StateError('offline');
    return DealAlertSummary(
      expiringSavedDealCount: expiringCount,
      expiringSavedDealTitle: expiringTitle,
      enabled: true,
      latestCursor: latestCursor,
      countCapped: countCapped,
      totalNewDealCount:
          after == null || after >= latestCursor ? 0 : newDealCount,
    );
  }

  @override
  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    discoveryCalls += 1;
    if (discoveryFailure) throw StateError('discovery offline');
    return DiscoveryResult(
      deals: discoveryDeals,
      foundDealCount: discoveryDeals.length,
      checkedSourceCount: 1,
      unavailableSourceCount: 0,
      leafletCount: 0,
    );
  }
}

class _RecordingDiscoveryCache extends DiscoveryCache {
  final List<String> loadedCountryCodes = [];
  final List<String> savedCountryCodes = [];

  @override
  Future<CachedDiscovery?> load(
    [String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async {
    loadedCountryCodes.add(countryCode);
    return null;
  }

  @override
  Future<void> save(
    DiscoveryResult result,
    DateTime fetchedAt, [
    String countryCode = 'ZA',
    String accessScope = 'free',
  ]) async {
    savedCountryCodes.add(countryCode);
  }
}

class _TaskPlatform implements DealAlertTaskPlatform {
  final List<String> cancelledNames = [];

  @override
  Future<void> cancel(String uniqueName) async {
    cancelledNames.add(uniqueName);
  }

  @override
  Future<void> schedulePeriodic({
    required String uniqueName,
    required Duration frequency,
    required bool networkRequired,
  }) async {}
}

const _shoeDeal = Deal(
  id: 'shoe-deal',
  retailerId: 'nike',
  retailerName: 'Nike',
  sourceLabel: 'New arrivals',
  sourceUrl: 'https://example.test/nike',
  productUrl: 'https://example.test/nike/running-shoes',
  title: 'Nike running shoes',
  capturedAt: '2026-07-27T09:00:00.000Z',
);

const _coffeeDeal = Deal(
  id: 'coffee-deal',
  retailerId: 'example-market',
  retailerName: 'Example Market',
  sourceLabel: 'Weekly deals',
  sourceUrl: 'https://example.test/weekly',
  productUrl: 'https://example.test/coffee',
  title: 'Ground coffee 500g',
  capturedAt: '2026-07-27T08:00:00.000Z',
);
