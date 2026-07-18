import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Thin wrapper around the local-notifications plugin. Only immediate
/// notifications (`show`) are used — the app raises one when it opens and finds
/// deals that landed since the shopper last looked. No background scheduling, so
/// no exact-alarm permissions are needed.
class DealNotifications {
  DealNotifications._();

  static final DealNotifications instance = DealNotifications._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> _ensureInit() async {
    if (_initialized) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwin = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    try {
      await _plugin.initialize(
        const InitializationSettings(android: android, iOS: darwin),
      );
      _initialized = true;
    } catch (error) {
      debugPrint('Notification init failed: $error');
    }
  }

  /// Asks the OS for permission (Android 13+, iOS). Returns true if granted or
  /// if the platform grants implicitly.
  Future<bool> requestPermission() async {
    await _ensureInit();
    try {
      final android = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      if (android != null) {
        return await android.requestNotificationsPermission() ?? true;
      }
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      if (ios != null) {
        return await ios.requestPermissions(
              alert: true,
              badge: true,
              sound: true,
            ) ??
            true;
      }
    } catch (error) {
      debugPrint('Notification permission request failed: $error');
    }
    return true;
  }

  /// Raises the "fresh deals landed" notification.
  Future<void> showNewDeals(int count) async {
    if (count <= 0) return;
    await _ensureInit();
    if (!_initialized) return;

    // A new channel id ('_v2') is used because Android locks a channel's sound
    // at creation time — this guarantees the custom deal_alert chime is used
    // even on devices that already created the original channel.
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'new_deals_v2',
        'New deals',
        channelDescription: 'Alerts when fresh grocery deals land near you.',
        importance: Importance.high,
        priority: Priority.high,
        playSound: true,
        sound: RawResourceAndroidNotificationSound('deal_alert'),
      ),
      iOS: DarwinNotificationDetails(
        sound: 'deal_alert.wav',
        presentSound: true,
      ),
    );

    try {
      await _plugin.show(
        1001,
        'New deals on Trolley Scout',
        count == 1
            ? '1 new deal just landed. Open the app to grab it.'
            : '$count new deals just landed. Open the app to grab them.',
        details,
      );
    } catch (error) {
      debugPrint('Show notification failed: $error');
    }
  }
}
