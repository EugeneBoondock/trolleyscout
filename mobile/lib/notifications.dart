import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'app_link_coordinator.dart';

/// Thin wrapper around the local-notifications plugin. The periodic deal check
/// uses immediate notifications, so no exact-alarm permission is needed.
class DealNotifications {
  DealNotifications._();

  static final DealNotifications instance = DealNotifications._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<bool> _ensureInit() async {
    if (_initialized) return true;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwin = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    try {
      await _plugin.initialize(
        const InitializationSettings(android: android, iOS: darwin),
        onDidReceiveNotificationResponse: _openNotification,
      );
      final launch = await _plugin.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true &&
          launch?.notificationResponse != null) {
        _openNotification(launch!.notificationResponse!);
      }
      _initialized = true;
      return true;
    } catch (error) {
      debugPrint('Notification init failed: $error');
      return false;
    }
  }

  void _openNotification(NotificationResponse response) {
    final uri = Uri.tryParse(response.payload ?? '');
    AppLinkCoordinator.instance
        .publish(uri ?? Uri.parse('trolleyscout://deals'));
  }

  /// Asks the OS for permission (Android 13+, iOS). Returns true if granted or
  /// if the platform grants implicitly.
  Future<bool> requestPermission() async {
    if (!await _ensureInit()) return false;
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
    return false;
  }

  /// Raises the "fresh deals landed" notification. When [personalized], the copy
  /// reflects that the deals match what the shopper likes.
  Future<bool> showNewDeals(int count, {bool personalized = false}) async {
    if (count <= 0) return true;
    if (!await _ensureInit()) return false;

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
      final title = personalized
          ? 'Deals you’ll love just landed'
          : 'New deals on Trolley Scout';
      final body = personalized
          ? (count == 1
              ? '1 new deal matches what you like. Open the app to grab it.'
              : '$count new deals match what you like. Open the app to grab them.')
          : (count == 1
              ? '1 new deal just landed. Open the app to grab it.'
              : '$count new deals just landed. Open the app to grab them.');
      await _plugin.show(
        1001,
        title,
        body,
        details,
        payload: 'trolleyscout://deals',
      );
      return true;
    } catch (error) {
      debugPrint('Show notification failed: $error');
      return false;
    }
  }

  /// Warns that saved offers are about to close. A saved deal is a promise the
  /// shopper made to themselves, so this is worth interrupting for — but it
  /// rides its own channel so it can be silenced separately from new deals.
  Future<bool> showExpiringSavedDeals(int count, {String? firstTitle}) async {
    if (count <= 0) return true;
    if (!await _ensureInit()) return false;

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'expiring_saved_deals',
        'Saved deals ending',
        channelDescription: 'Reminds you before a deal you saved runs out.',
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
      final named = firstTitle != null && firstTitle.trim().isNotEmpty
          ? firstTitle.trim()
          : null;
      final body = count == 1
          ? (named != null
              ? '$named is ending soon. Open the app before the price goes.'
              : '1 deal you saved is ending soon. Open the app before the price goes.')
          : '$count deals you saved are ending soon. Open the app before the prices go.';
      await _plugin.show(
        1002,
        count == 1 ? 'A saved deal is ending' : 'Saved deals are ending',
        body,
        details,
        payload: 'trolleyscout://saved',
      );
      return true;
    } catch (error) {
      debugPrint('Show notification failed: $error');
      return false;
    }
  }

  /// A price the shopper already wanted just got better — the one alert that
  /// is pure good news.
  Future<bool> showSavedDealPriceDrops(int count, {String? firstTitle}) async {
    if (count <= 0) return true;
    if (!await _ensureInit()) return false;

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'saved_deal_price_drops',
        'Saved deal price drops',
        channelDescription:
            'Tells you when a deal you saved gets even cheaper.',
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
      final named = firstTitle != null && firstTitle.trim().isNotEmpty
          ? firstTitle.trim()
          : null;
      final body = count == 1
          ? (named != null
              ? '$named just dropped below the price you saved it at.'
              : 'A deal you saved just dropped in price.')
          : '$count deals you saved just dropped in price.';
      await _plugin.show(
        1003,
        count == 1 ? 'Price drop on a saved deal' : 'Price drops on saved deals',
        body,
        details,
        payload: 'trolleyscout://saved',
      );
      return true;
    } catch (error) {
      debugPrint('Show notification failed: $error');
      return false;
    }
  }
}
