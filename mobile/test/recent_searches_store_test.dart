import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/member_state_sync.dart';
import 'package:trolley_scout/recent_searches_store.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await MemberStateSync.instance.clearLocal();
  });

  test('syncs recent property interests with the signed-in account', () async {
    final api = _CapturingStateApi();
    MemberStateSync.instance.configure(api);
    final store = RecentPropertySearchesStore();

    expect(await store.add('Sandton'), ['Sandton']);
    await Future<void>.delayed(Duration.zero);
    expect(api.values[MemberStateSync.recentPropertySearchesKey], ['Sandton']);

    expect(await store.clear(), isEmpty);
    await Future<void>.delayed(Duration.zero);
    expect(api.values[MemberStateSync.recentPropertySearchesKey], isEmpty);
  });
}

class _CapturingStateApi extends Api {
  _CapturingStateApi() : super(baseUrl: 'https://example.test');

  final values = <String, Object?>{};

  @override
  Future<void> setMemberState(String key, Object? value) async {
    values[key] = value;
  }
}
