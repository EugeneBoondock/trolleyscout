import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/session_cookie_store.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('moves an existing session cookie into secure storage', () async {
    SharedPreferences.setMockInitialValues({
      'trolley_scout_member_cookie': 'ts_member_session=legacy-token',
    });
    final secrets = MemorySessionSecretBackend();
    final store = SecureSessionCookieStore(secrets: secrets);

    expect(await store.read(), 'ts_member_session=legacy-token');

    final preferences = await SharedPreferences.getInstance();
    expect(preferences.containsKey('trolley_scout_member_cookie'), isFalse);
    expect(
      secrets.values['trolley_scout_member_cookie'],
      'ts_member_session=legacy-token',
    );
  });

  test('clear removes both secure and legacy session copies', () async {
    SharedPreferences.setMockInitialValues({
      'trolley_scout_member_cookie': 'ts_member_session=legacy-token',
    });
    final secrets = MemorySessionSecretBackend()
      ..values['trolley_scout_member_cookie'] =
          'ts_member_session=secure-token';
    final store = SecureSessionCookieStore(secrets: secrets);

    await store.clear();

    final preferences = await SharedPreferences.getInstance();
    expect(preferences.containsKey('trolley_scout_member_cookie'), isFalse);
    expect(secrets.values, isEmpty);
  });
}
