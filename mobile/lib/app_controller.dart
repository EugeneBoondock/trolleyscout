import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'deal_alert_lifecycle.dart';
import 'member_state_sync.dart';

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

  /// Matched watches the member has not dismissed yet — the bell badge.
  int get alertCount => watches.where((watch) => watch.isUnreadAlert).length;

  Future<void> restore() async {
    try {
      try {
        session = await api.session();
      } catch (_) {
        session = const MemberSession.signedOut();
      }

      // Pull the shopper's account-synced data (near-me history, saved
      // addresses) into local storage so it shows after logout/login and on
      // new devices. Keep startup behind the restoring state until the device
      // notification permission has also been resolved.
      if (session.isAuthenticated) {
        MemberStateSync.instance.configure(api);
        await MemberStateSync.instance.hydrate(MemberStateSync.syncedKeys);
        await _dealAlerts.syncAuthenticated(api);
      } else {
        await _dealAlerts.signedOut();
      }

      await refreshWatches();

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
    } finally {
      restoring = false;
      notifyListeners();
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
  Future<void> refreshWatches() async {
    if (!session.isAuthenticated) {
      watches = const [];
      notifyListeners();
      return;
    }

    try {
      watches = await api.dealWatches();
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
        MemberStateSync.instance.configure(api);
        await MemberStateSync.instance.hydrate(MemberStateSync.syncedKeys);
        await refreshWatches();
        await _dealAlerts.syncAuthenticated(api);
      }
      return session.isAuthenticated;
    } on ApiException catch (error) {
      notice = error.message;
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    busy = true;
    notifyListeners();
    try {
      session = await api.signOut();
      watches = const [];
      // Clear account-synced local data so the next shopper on a shared device
      // never sees the previous one's history/addresses.
      await MemberStateSync.instance.clearLocal();
      await _dealAlerts.signedOut();
    } on ApiException catch (error) {
      notice = error.message;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  void replaceAccount(MemberAccount account) {
    session = MemberSession(isAuthenticated: true, account: account);
    notifyListeners();
  }
}
