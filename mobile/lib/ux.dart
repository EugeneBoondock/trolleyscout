import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// App-feel preferences and one-line feedback helpers. Both haptics and sounds
/// default ON so the app feels alive out of the box; both live in Profile
/// settings. Sounds are soft, warm bell chimes with a touch of room — elegant
/// rather than clicky (see assets/sounds) — played through audioplayers; the
/// old SystemSound.click was inaudible on most phones, which is why sounds
/// were never heard.
class UxSettings extends ChangeNotifier {
  UxSettings._();

  static final UxSettings instance = UxSettings._();

  static const _hapticsKey = 'ux_haptics_enabled';
  static const _soundsKey = 'ux_sounds_enabled';

  bool haptics = true;
  bool sounds = true;

  Future<void> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      haptics = preferences.getBool(_hapticsKey) ?? true;
      sounds = preferences.getBool(_soundsKey) ?? true;
      notifyListeners();
    } catch (_) {
      // Defaults stand.
    }
    if (sounds) _SoundBank.instance.warmUp();
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
    if (enabled) _SoundBank.instance.warmUp();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_soundsKey, enabled);
    } catch (_) {
      // Preference persists next time.
    }
  }
}

/// Owns one AudioPlayer per short sound so replays are independent. Uses the
/// default media-player mode with play(AssetSource) each trigger — the most
/// reliable path across devices (low-latency SoundPool mode silently drops
/// seek() on some Androids, which is how sounds went unheard before).
class _SoundBank {
  _SoundBank._();

  static final _SoundBank instance = _SoundBank._();

  final Map<String, AudioPlayer> _players = {};

  AudioPlayer _playerFor(String name) => _players.putIfAbsent(name, () {
        final player = AudioPlayer(playerId: 'ux_$name');
        player.setReleaseMode(ReleaseMode.stop);
        // A UI sound should duck nothing and never grab audio focus. Only the
        // Android context is customised; iOS keeps the valid default.
        player.setAudioContext(
          AudioContext(
            android: const AudioContextAndroid(
              isSpeakerphoneOn: false,
              contentType: AndroidContentType.sonification,
              usageType: AndroidUsageType.assistanceSonification,
              audioFocus: AndroidAudioFocus.none,
            ),
          ),
        );
        return player;
      });

  /// Pre-creates the players so the first tap isn't the one that lags.
  void warmUp() {
    for (final name in const ['tap', 'success', 'deal_alert']) {
      _playerFor(name);
    }
  }

  void play(String name, {double volume = 1.0}) {
    if (!UxSettings.instance.sounds) return;
    final player = _playerFor(name);
    Future<void> run() async {
      try {
        await player.stop();
        await player.setVolume(volume);
        await player.play(AssetSource('sounds/$name.wav'));
      } catch (error) {
        debugPrint('Sound play failed for $name: $error');
      }
    }

    // Fire and forget; feedback must never block the UI.
    run();
  }
}

/// Light tick for taps on meaningful controls (save, watch, quantity).
void uxTap() {
  if (UxSettings.instance.haptics) HapticFeedback.selectionClick();
  _SoundBank.instance.play('tap', volume: 0.7);
}

/// Firmer pulse for a completed action (saved, added, alert dismissed).
void uxSuccess() {
  if (UxSettings.instance.haptics) HapticFeedback.mediumImpact();
  _SoundBank.instance.play('success');
}

/// The full reward chime — used for the standout moments (a deal found, alerts
/// switched on). This is the same delightful sound new-deal notifications play.
void uxReward() {
  if (UxSettings.instance.haptics) HapticFeedback.heavyImpact();
  _SoundBank.instance.play('deal_alert');
}
