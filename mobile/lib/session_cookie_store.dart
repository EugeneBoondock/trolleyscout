import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract interface class SessionCookieStore {
  Future<void> clear();
  Future<String?> read();
  Future<void> write(String cookie);
}

abstract interface class SessionSecretBackend {
  Future<void> delete(String key);
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class FlutterSessionSecretBackend implements SessionSecretBackend {
  FlutterSessionSecretBackend({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<void> delete(String key) => _storage.delete(key: key);

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
}

class SecureSessionCookieStore implements SessionCookieStore {
  static const _key = 'trolley_scout_member_cookie';
  SecureSessionCookieStore({SessionSecretBackend? secrets})
      : _secrets = secrets ?? FlutterSessionSecretBackend();

  final SessionSecretBackend _secrets;

  @override
  Future<void> clear() async {
    try {
      await _secrets.delete(_key);
    } finally {
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove(_key);
    }
  }

  @override
  Future<String?> read() async {
    final secureValue = await _secrets.read(_key);
    if (secureValue != null && secureValue.isNotEmpty) return secureValue;

    // Move sessions written by older app releases out of plain preferences.
    final preferences = await SharedPreferences.getInstance();
    final legacyValue = preferences.getString(_key);
    if (legacyValue == null || legacyValue.isEmpty) return null;
    await _secrets.write(_key, legacyValue);
    await preferences.remove(_key);
    return legacyValue;
  }

  @override
  Future<void> write(String cookie) async {
    await _secrets.write(_key, cookie);
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_key);
  }
}

abstract interface class SessionSnapshotStore {
  Future<void> clear();
  Future<String?> read();
  Future<void> write(String value);
}

class SecureSessionSnapshotStore implements SessionSnapshotStore {
  static const _key = 'trolley_scout_member_snapshot';

  SecureSessionSnapshotStore({SessionSecretBackend? secrets})
      : _secrets = secrets ?? FlutterSessionSecretBackend();

  final SessionSecretBackend _secrets;

  @override
  Future<void> clear() => _secrets.delete(_key);

  @override
  Future<String?> read() => _secrets.read(_key);

  @override
  Future<void> write(String value) => _secrets.write(_key, value);
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

class MemorySessionSnapshotStore implements SessionSnapshotStore {
  MemorySessionSnapshotStore([this._value]);

  String? _value;

  @override
  Future<void> clear() async => _value = null;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String value) async => _value = value;
}

class MemorySessionSecretBackend implements SessionSecretBackend {
  final Map<String, String> values = {};

  @override
  Future<void> delete(String key) async => values.remove(key);

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}
