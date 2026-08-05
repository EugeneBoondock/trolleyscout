import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DataSaverStore extends ChangeNotifier {
  DataSaverStore._();

  static final DataSaverStore instance = DataSaverStore._();
  static const storageKey = 'data_saver_enabled_v1';

  bool _enabled = false;
  bool _loaded = false;
  Future<bool>? _loading;

  bool get enabled => _enabled;

  Future<bool> load() {
    if (_loaded) return Future.value(_enabled);
    final active = _loading;
    if (active != null) return active;
    final future = _read();
    _loading = future;
    return future;
  }

  Future<bool> _read() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      _enabled = preferences.getBool(storageKey) ?? false;
    } catch (_) {
      _enabled = false;
    } finally {
      _loaded = true;
      _loading = null;
      notifyListeners();
    }
    return _enabled;
  }

  Future<void> setEnabled(bool value) async {
    if (_enabled == value && _loaded) return;
    _enabled = value;
    _loaded = true;
    notifyListeners();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(storageKey, value);
    } catch (_) {
      // The setting remains active for this session.
    }
  }

  @visibleForTesting
  void resetForTest() {
    _enabled = false;
    _loaded = false;
    _loading = null;
  }
}
