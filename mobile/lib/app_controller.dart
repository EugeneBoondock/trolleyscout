import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'deal_alert_lifecycle.dart';
import 'member_state_sync.dart';
import 'scout_avatar.dart';

class AppController extends ChangeNotifier {
  AppController(this.api, {DealAlertLifecycle? dealAlerts})
      : _dealAlerts = dealAlerts ?? DealAlertLifecycle();

  final Api api;
  final DealAlertLifecycle _dealAlerts;
  MemberSession session = const MemberSession.signedOut();
  bool restoring = true;
  bool busy = false;
  String? notice;
  ThemeMode themeMode = ThemeMode.system;
  List<DealWatch> watches = const [];

  /// Matched watches the member has not dismissed yet: the bell badge.
  int get alertCount => watches.where((watch) => watch.isUnreadAlert).length;

  Future<void> restore() async {
    try {
      await _restoreTheme();
      try {
        session = await api.session();
      } catch (_) {
        session = const MemberSession.signedOut();
      }

      if (session.isAuthenticated) {
        _startAuthenticatedSetup();
      } else {
        MemberStateSync.instance.configure(null);
        unawaited(_dealAlerts.signedOut());
      }
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  Future<void> _restoreTheme() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      themeMode = switch (preferences.getString('trolley_scout_theme')) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
    } catch (_) {
      themeMode = ThemeMode.system;
    }
  }

  void _startAuthenticatedSetup() {
    final accountId = session.account?.id;
    if (accountId == null) return;
    if (session.isOffline) {
      MemberStateSync.instance.configure(null);
      unawaited(ScoutAvatarStore.instance.load());
      return;
    }
    MemberStateSync.instance.configure(api);
    unawaited(_finishAuthenticatedSetup(accountId));
  }

  Future<void> _finishAuthenticatedSetup(String accountId) async {
    try {
      await MemberStateSync.instance.hydrate(MemberStateSync.syncedKeys);
      if (!_isCurrentAccount(accountId)) return;
      await ScoutAvatarStore.instance.load();
      if (!_isCurrentAccount(accountId)) return;
      await Future.wait([
        refreshWatches(forAccountId: accountId),
        _dealAlerts.syncAuthenticated(api),
      ]);
    } catch (_) {
      // Account setup retries naturally on the next app launch or refresh.
    }
  }

  bool _isCurrentAccount(String accountId) =>
      session.isAuthenticated && session.account?.id == accountId;

  /// Settings → Appearance: an explicit choice of system/light/dark, unlike
  /// [toggleTheme] which flips relative to the current brightness.
  Future<void> setThemeMode(ThemeMode mode) async {
    themeMode = mode;
    notifyListeners();
    final preferences = await SharedPreferences.getInstance();
    if (mode == ThemeMode.system) {
      await preferences.remove('trolley_scout_theme');
    } else {
      await preferences.setString(
        'trolley_scout_theme',
        mode == ThemeMode.dark ? 'dark' : 'light',
      );
    }
  }

  Future<void> toggleTheme(Brightness brightness) async {
    themeMode =
        brightness == Brightness.dark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      'trolley_scout_theme',
      themeMode == ThemeMode.dark ? 'dark' : 'light',
    );
  }

  /// Loads the member's deal watches; silently keeps the previous list when
  /// signed out or offline so the UI never flashes.
  Future<void> refreshWatches({String? forAccountId}) async {
    if (!session.isAuthenticated || session.isOffline) {
      watches = const [];
      notifyListeners();
      return;
    }

    try {
      final accountId = session.account?.id;
      final next = await api.dealWatches();
      if (!_isCurrentAccount(accountId ?? '') ||
          (forAccountId != null && accountId != forAccountId)) {
        return;
      }
      watches = next;
      notifyListeners();
    } catch (_) {
      // Keep whatever we had; the next refresh retries.
    }
  }

  void replaceWatches(List<DealWatch> next) {
    watches = next;
    notifyListeners();
  }

  Future<bool> authenticate(AuthDraft draft) async {
    busy = true;
    notice = null;
    notifyListeners();
    try {
      session = await api.authenticate(draft);
      if (session.isAuthenticated) {
        _startAuthenticatedSetup();
      }
      return session.isAuthenticated;
    } on ApiException catch (error) {
      notice = error.message;
      return false;
    } catch (_) {
      notice = 'Could not connect. Check your connection and try again.';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    busy = true;
    notice = null;
    final remoteSignOut = api.signOut().then(
          (_) => true,
          onError: (_, __) => false,
        );
    session = const MemberSession.signedOut();
    watches = const [];
    notifyListeners();
    try {
      unawaited(_dealAlerts.signedOut().catchError((_) {}));
      await MemberStateSync.instance.clearLocal();
      ScoutAvatarStore.instance.clear();
      if (!await remoteSignOut) {
        notice = 'You’re signed out on this device.';
      }
    } catch (_) {
      notice = 'You’re signed out on this device.';
    } finally {
      try {
        await api.clearLocalSession();
      } catch (_) {
        notice =
            'You’re signed out. Secure storage could not be cleared, so please try again after restarting the app.';
      } finally {
        busy = false;
        notifyListeners();
      }
    }
  }

  /// Deletes the account server-side (password re-verified there), then runs
  /// the normal sign-out path so every local trace is cleared the same way.
  Future<void> deleteAccount(String currentPassword) async {
    await api.deleteAccount(currentPassword: currentPassword);
    await signOut();
    notice = 'Your account and personal data have been deleted.';
    notifyListeners();
  }

  void replaceAccount(MemberAccount account) {
    session = MemberSession(isAuthenticated: true, account: account);
    notifyListeners();
  }
}
