import 'package:shared_preferences/shared_preferences.dart';

abstract interface class SessionCookieStore {
  Future<void> clear();
  Future<String?> read();
  Future<void> write(String cookie);
}

class SharedPreferencesSessionCookieStore implements SessionCookieStore {
  static const _key = 'trolley_scout_member_cookie';

  @override
  Future<void> clear() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_key);
  }

  @override
  Future<String?> read() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getString(_key);
  }

  @override
  Future<void> write(String cookie) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_key, cookie);
  }
}

class MemorySessionCookieStore implements SessionCookieStore {
  MemorySessionCookieStore([this._cookie]);

  String? _cookie;

  @override
  Future<void> clear() async => _cookie = null;

  @override
  Future<String?> read() async => _cookie;

  @override
  Future<void> write(String cookie) async => _cookie = cookie;
}
