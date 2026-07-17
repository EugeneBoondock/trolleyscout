import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// App-feel preferences and one-line feedback helpers. Haptics default on,
/// sounds default off (subtle is the point); both live in Profile settings.
class UxSettings extends ChangeNotifier {
  UxSettings._();

  static final UxSettings instance = UxSettings._();

  static const _hapticsKey = 'ux_haptics_enabled';
  static const _soundsKey = 'ux_sounds_enabled';

  bool haptics = true;
  bool sounds = false;

  Future<void> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      haptics = preferences.getBool(_hapticsKey) ?? true;
      sounds = preferences.getBool(_soundsKey) ?? false;
      notifyListeners();
    } catch (_) {
      // Defaults stand.
    }
  }

  Future<void> setHaptics(bool enabled) async {
    haptics = enabled;
    notifyListeners();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_hapticsKey, enabled);
    } catch (_) {
      // Preference persists next time.
    }
  }

  Future<void> setSounds(bool enabled) async {
    sounds = enabled;
    notifyListeners();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_soundsKey, enabled);
    } catch (_) {
      // Preference persists next time.
    }
  }
}

/// Light tick for taps on meaningful controls (save, watch, quantity).
void uxTap() {
  if (UxSettings.instance.haptics) HapticFeedback.selectionClick();
  if (UxSettings.instance.sounds) SystemSound.play(SystemSoundType.click);
}

/// Firmer pulse for a completed action (saved, added, alert dismissed).
void uxSuccess() {
  if (UxSettings.instance.haptics) HapticFeedback.mediumImpact();
  if (UxSettings.instance.sounds) SystemSound.play(SystemSoundType.click);
}
