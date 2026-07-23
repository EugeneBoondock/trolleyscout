import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'theme.dart';
import 'widgets/common.dart' show confirmAction;
import 'widgets/scout_mark.dart';

/// Fingerprint / device unlock for returning shoppers. Enabled per-device from
/// Profile; when on, the app asks for a fingerprint on launch before revealing
/// the (already signed-in) content — so nobody has to retype a password.
class BiometricPrefs {
  static const _key = 'biometric_unlock_enabled';
  static final LocalAuthentication _auth = LocalAuthentication();

  static Future<bool> isEnabled() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_key) ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> setEnabled(bool value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_key, value);
    } catch (_) {}
  }

  /// Whether the device can do a biometric / device-credential check at all.
  static Future<bool> canUse() async {
    try {
      return await _auth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  static Future<bool> authenticate(String reason) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(stickyAuth: true, biometricOnly: false),
      );
    } catch (_) {
      return false;
    }
  }
}

/// The lock screen shown on launch when biometric unlock is enabled.
class BiometricGate extends StatefulWidget {
  const BiometricGate({
    super.key,
    required this.onUnlocked,
    required this.onSignOut,
  });

  final VoidCallback onUnlocked;
  final Future<void> Function() onSignOut;

  @override
  State<BiometricGate> createState() => _BiometricGateState();
}

class _BiometricGateState extends State<BiometricGate> {
  bool _authing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prompt());
  }

  Future<void> _prompt() async {
    if (_authing) return;
    setState(() {
      _authing = true;
      _error = null;
    });
    final ok = await BiometricPrefs.authenticate('Unlock Trolley Scout');
    if (!mounted) return;
    setState(() {
      _authing = false;
      _error = ok ? null : 'Fingerprint not recognised — try again.';
    });
    if (ok) widget.onUnlocked();
  }

  Future<void> _confirmSignOut() async {
    final confirmed = await confirmAction(
      context,
      title: 'Sign out?',
      message: 'You will need to log in again to unlock Trolley Scout.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (confirmed) await widget.onSignOut();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AnimatedScoutMark(motion: ScoutMarkMotion.scout, size: 64),
            const SizedBox(height: 22),
            const Text('Locked',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 44),
              child: Text('Unlock with your fingerprint to continue.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: TS.mutedOf(context))),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 44),
                child: Semantics(
                  liveRegion: true,
                  child: Text(_error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: TS.redOf(context),
                          fontWeight: FontWeight.w700)),
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: TS.yellow,
                foregroundColor: TS.ink,
                shape: const RoundedRectangleBorder(),
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
              ),
              onPressed: _authing ? null : _prompt,
              icon: const Icon(Icons.fingerprint),
              label: Text(_authing ? 'Waiting…' : 'Unlock'),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: _confirmSignOut,
              child: const Text('Sign out instead'),
            ),
          ],
        ),
      ),
    );
  }
}
