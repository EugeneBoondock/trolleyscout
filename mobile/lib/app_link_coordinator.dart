import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

class AppLinkRequest {
  const AppLinkRequest({
    required this.destination,
    this.query,
    this.retailerId,
  });

  final String destination;
  final String? query;
  final String? retailerId;
}

AppLinkRequest? parseAppLink(Uri uri) {
  final isCustomScheme = uri.scheme.toLowerCase() == 'trolleyscout';
  final host = uri.host.toLowerCase();
  final isWebsite = (uri.scheme == 'https' || uri.scheme == 'http') &&
      (host == 'trolleyscout.co.za' || host == 'www.trolleyscout.co.za');
  if (!isCustomScheme && !isWebsite) return null;

  final rawRoute = isCustomScheme && uri.host.isNotEmpty
      ? uri.host
      : uri.pathSegments.firstOrNull ?? 'dashboard';
  final destination = switch (rawRoute.toLowerCase()) {
    '' || 'home' || 'dashboard' => 'dashboard',
    'deals' || 'find-deals' => 'deals',
    'near' || 'near-me' => 'near',
    'stores' => 'stores',
    'tools' || 'compare' => 'tools',
    'scroll' || 'window-shopping' => 'scroll',
    'vouchers' => 'vouchers',
    'saved' || 'saved-deals' => 'savedDeals',
    'basket' => 'basket',
    'subscription' => 'subscription',
    'profile' || 'settings' => 'profile',
    'advertise' => 'advertise',
    'about' || 'help' => 'about',
    _ => null,
  };
  if (destination == null) return null;

  String? clean(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }

  return AppLinkRequest(
    destination: destination,
    query: clean(uri.queryParameters['q']),
    retailerId: clean(uri.queryParameters['retailer']),
  );
}

class AppLinkCoordinator extends ChangeNotifier {
  AppLinkCoordinator._();

  static final instance = AppLinkCoordinator._();

  StreamSubscription<Uri>? _subscription;
  AppLinkRequest? _pending;
  String? _lastUri;

  Future<void> initialize() async {
    if (_subscription != null) return;
    final links = AppLinks();
    _subscription = links.uriLinkStream.listen(
      publish,
      onError: (_) {},
    );
    try {
      final initial = await links.getInitialLink();
      if (initial != null) publish(initial);
    } catch (_) {
      // Link handling must never hold app startup.
    }
  }

  void publish(Uri uri) {
    if (_lastUri == uri.toString()) return;
    final request = parseAppLink(uri);
    if (request == null) return;
    _lastUri = uri.toString();
    _pending = request;
    notifyListeners();
  }

  AppLinkRequest? takePending() {
    final value = _pending;
    _pending = null;
    return value;
  }
}
