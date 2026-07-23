import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/member_state_sync.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await MemberStateSync.instance.clearLocal();
  });

  test('hydrates independent account values concurrently', () async {
    final api = _DelayedStateApi();
    MemberStateSync.instance.configure(api);

    final hydration =
        MemberStateSync.instance.hydrate(MemberStateSync.syncedKeys);
    await api.allRequestsStarted.future;

    expect(api.maxInFlight, 4);
    api.completeAll({'saved': true});
    await hydration;

    final preferences = await SharedPreferences.getInstance();
    expect(
      preferences.getString(MemberStateSync.nearbyHistoryKey),
      '{"saved":true}',
    );
    expect(
      preferences.containsKey(MemberStateSync.compareRetailersKey),
      isFalse,
    );
  });

  test('does not write stale account values after sign-out', () async {
    final api = _DelayedStateApi();
    MemberStateSync.instance.configure(api);

    final hydration =
        MemberStateSync.instance.hydrate(MemberStateSync.syncedKeys);
    await api.allRequestsStarted.future;
    await MemberStateSync.instance.clearLocal();
    api.completeAll({'belongsTo': 'previous-account'});
    await hydration;

    final preferences = await SharedPreferences.getInstance();
    for (final key in MemberStateSync.syncedKeys) {
      expect(preferences.containsKey(key), isFalse, reason: key);
    }
  });
}

class _DelayedStateApi extends Api {
  _DelayedStateApi() : super(baseUrl: 'https://example.test');

  final requests = <String, Completer<Object?>>{};
  final allRequestsStarted = Completer<void>();
  int _inFlight = 0;
  int maxInFlight = 0;

  @override
  Future<Object?> getMemberState(String key) async {
    final completer = Completer<Object?>();
    requests[key] = completer;
    _inFlight += 1;
    if (_inFlight > maxInFlight) maxInFlight = _inFlight;
    if (requests.length == 4 && !allRequestsStarted.isCompleted) {
      allRequestsStarted.complete();
    }
    final value = await completer.future;
    _inFlight -= 1;
    return value;
  }

  void completeAll(Object? value) {
    for (final completer in requests.values) {
      if (!completer.isCompleted) completer.complete(value);
    }
  }
}
