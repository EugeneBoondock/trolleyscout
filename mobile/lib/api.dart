import 'dart:convert';

import 'package:http/http.dart' as http;

import 'ad_pricing.dart';
import 'api_models.dart';
import 'platform_http_client.dart';
import 'session_cookie_store.dart';
import 'voucher_models.dart';

export 'ad_pricing.dart';
export 'api_models.dart';
export 'voucher_models.dart';

/// An advertiser's ads plus the current rate card, as /api/ads returns them.
class AdsResult {
  const AdsResult({required this.ads, required this.rateCard});

  final List<AdSubmission> ads;
  final AdRateCard rateCard;
}

/// A new ad an advertiser is submitting for review.
class AdDraft {
  const AdDraft({
    required this.title,
    required this.bodyText,
    required this.targetUrl,
    required this.placement,
    required this.reach,
    this.imageUrl,
    this.province,
  });

  final String title;
  final String bodyText;
  final String targetUrl;
  final String placement;
  final int reach;
  final String? imageUrl;
  final String? province;

  Map<String, dynamic> toJson() => {
        'title': title,
        'bodyText': bodyText,
        'targetUrl': targetUrl,
        'placement': placement,
        'reach': reach,
        if (imageUrl != null && imageUrl!.isNotEmpty) 'imageUrl': imageUrl,
        if (province != null && province!.isNotEmpty) 'province': province,
      };
}

class Api {
  Api({
    http.Client? client,
    SessionCookieStore? cookieStore,
    bool? useBrowserCookies,
    this.baseUrl = 'https://trolleyscout.co.za',
  })  : _client = client ?? createPlatformHttpClient(),
        _cookieStore = cookieStore ?? SharedPreferencesSessionCookieStore(),
        _useBrowserCookies = useBrowserCookies ?? platformUsesBrowserCookies;

  final http.Client _client;
  final SessionCookieStore _cookieStore;
  final bool _useBrowserCookies;
  final String baseUrl;

  Future<MemberSession> session() async {
    final data = await _request('GET', '/api/member-session');
    return MemberSession.fromJson(_map(data['session']));
  }

  Future<MemberSession> authenticate(AuthDraft draft) async {
    final data =
        await _request('POST', '/api/member-session', body: draft.toJson());
    return MemberSession.fromJson(_map(data['session']));
  }

  Future<MemberSession> signOut() async {
    final data = await _request('DELETE', '/api/member-session');
    await _cookieStore.clear();
    return MemberSession.fromJson(_map(data['session']));
  }

  Future<DiscoveryResult> discovery({bool forceLive = false}) async {
    final suffix = forceLive ? '?refresh=1' : '';
    return DiscoveryResult.fromJson(
        await _request('GET', '/api/discovery$suffix'));
  }

  Future<List<Deal>> deals() async => (await discovery()).deals;

  Future<DiscoveredStoresResult> discoveredStores() async =>
      DiscoveredStoresResult.fromJson(
          await _request('GET', '/api/discovered-stores'));

  Future<List<Voucher>> vouchers() async {
    final data = await _request('GET', '/api/vouchers');
    return _maps(data['vouchers']).map(Voucher.fromJson).toList();
  }

  Future<bool> claimVoucher(String voucherId) async {
    final data = await _request(
      'POST',
      '/api/vouchers',
      body: {'voucherId': voucherId},
    );
    return data['claimed'] == true;
  }

  Future<bool> removeVoucherClaim(String voucherId) async {
    final data = await _request(
      'DELETE',
      '/api/vouchers?voucherId=${Uri.encodeComponent(voucherId)}',
    );
    return data['removed'] == true;
  }

  Future<RetailerCatalog> retailers(
      {String query = '', String kind = 'all'}) async {
    final parameters = <String, String>{};
    if (query.trim().isNotEmpty) parameters['q'] = query.trim();
    if (kind != 'all') parameters['kind'] = kind;
    final suffix =
        parameters.isEmpty ? '' : '?${Uri(queryParameters: parameters).query}';
    return RetailerCatalog.fromJson(
        await _request('GET', '/api/retailers$suffix'));
  }

  Future<NearbyResult> nearbyStores(double lat, double lon) async {
    final data = await _request(
      'GET',
      '/api/nearby-stores?lat=${Uri.encodeComponent('$lat')}&lon=${Uri.encodeComponent('$lon')}',
    );
    return NearbyResult(
      stores: _maps(data['stores']).map(NearbyStore.fromJson).toList(),
    );
  }

  Future<List<SavedSource>> savedSources() async {
    final data = await _request('GET', '/api/saved-sources');
    return _maps(data['savedSources']).map(SavedSource.fromJson).toList();
  }

  Future<List<SavedSource>> saveSource(
      String retailerId, String sourceUrl) async {
    final data = await _request(
      'POST',
      '/api/saved-sources',
      body: {'retailerId': retailerId, 'sourceUrl': sourceUrl},
    );
    return _maps(data['savedSources']).map(SavedSource.fromJson).toList();
  }

  Future<List<SavedSource>> deleteSavedSource(String id) async {
    final data = await _request(
      'DELETE',
      '/api/saved-sources?id=${Uri.encodeComponent(id)}',
    );
    return _maps(data['savedSources']).map(SavedSource.fromJson).toList();
  }

  Future<List<SavedDeal>> savedDeals() async {
    final data = await _request('GET', '/api/saved-deals');
    return _maps(data['savedDeals']).map(SavedDeal.fromJson).toList();
  }

  Future<List<SavedDeal>> saveDeal(Deal deal) async {
    final data =
        await _request('POST', '/api/saved-deals', body: deal.toJson());
    return _maps(data['savedDeals']).map(SavedDeal.fromJson).toList();
  }

  Future<List<SavedDeal>> deleteSavedDeal(String id) async {
    final data = await _request(
      'DELETE',
      '/api/saved-deals?id=${Uri.encodeComponent(id)}',
    );
    return _maps(data['savedDeals']).map(SavedDeal.fromJson).toList();
  }

  Future<Basket> basket() async {
    final data = await _request('GET', '/api/basket-items');
    return Basket.fromJson(_map(data['basket']));
  }

  Future<Basket> addBasketItem(String savedDealId, {int quantity = 1}) async {
    final data = await _request(
      'POST',
      '/api/basket-items',
      body: {'savedDealId': savedDealId, 'quantity': quantity},
    );
    return Basket.fromJson(_map(data['basket']));
  }

  Future<Basket> updateBasketItem(String id, int quantity) async {
    final data = await _request(
      'PATCH',
      '/api/basket-items',
      body: {'id': id, 'quantity': quantity},
    );
    return Basket.fromJson(_map(data['basket']));
  }

  Future<Basket> deleteBasketItem(String id) async {
    final data = await _request(
      'DELETE',
      '/api/basket-items?id=${Uri.encodeComponent(id)}',
    );
    return Basket.fromJson(_map(data['basket']));
  }

  Future<List<VerifiedOffer>> offers() async {
    final data = await _request('GET', '/api/offers');
    return _maps(data['offers']).map(VerifiedOffer.fromJson).toList();
  }

  Future<OfferValidationResult> validateOffer(OfferDraft draft) async {
    final data =
        await _request('POST', '/api/offer-validator', body: draft.toJson());
    return OfferValidationResult.fromJson(data);
  }

  Future<VerifiedOffer> createOffer(OfferDraft draft) async {
    final data = await _request('POST', '/api/offers', body: draft.toJson());
    return VerifiedOffer.fromJson(_map(data['offer']));
  }

  Future<bool> deleteOffer(String id) async {
    final data =
        await _request('DELETE', '/api/offers?id=${Uri.encodeComponent(id)}');
    return data['deleted'] == true;
  }

  Future<SubscriptionData> subscription() async {
    return SubscriptionData.fromJson(
        await _request('GET', '/api/subscription'));
  }

  Future<SubscriptionCheckout> checkout(
      String planId, String billingCycle) async {
    final data = await _request(
      'POST',
      '/api/subscription',
      body: {'planId': planId, 'billingCycle': billingCycle},
      acceptErrorData: true,
    );
    return SubscriptionCheckout.fromJson(_map(data['checkout']));
  }

  Future<MapRoute?> mapRoute(
      double fromLat, double fromLon, double toLat, double toLon) async {
    try {
      final data = await _request(
        'GET',
        '/api/map-route?fromLat=$fromLat&fromLon=$fromLon&toLat=$toLat&toLon=$toLon&profile=driving',
      );
      final path = (data['path'] as List?)
              ?.whereType<List>()
              .map((p) => [(p[0] as num).toDouble(), (p[1] as num).toDouble()])
              .toList() ??
          const [];
      if (path.isEmpty) return null;
      return MapRoute(
        path: path,
        distanceMeters: (data['distanceMeters'] as num?)?.toDouble() ?? 0,
        durationSeconds: (data['durationSeconds'] as num?)?.toDouble() ?? 0,
      );
    } catch (_) {
      return null;
    }
  }

  Future<List<DealWatch>> dealWatches() async {
    final data = await _request('GET', '/api/deal-watches');
    return _maps(data['watches']).map(DealWatch.fromJson).toList();
  }

  Future<DealWatchResult> createDealWatch(String query) async {
    final data =
        await _request('POST', '/api/deal-watches', body: {'query': query});
    return DealWatchResult.fromJson(data);
  }

  Future<List<DealWatch>> markDealWatchSeen(String id) async {
    final data = await _request('PATCH', '/api/deal-watches', body: {'id': id});
    return _maps(data['watches']).map(DealWatch.fromJson).toList();
  }

  Future<List<DealWatch>> deleteDealWatch(String id) async {
    final data = await _request(
      'DELETE',
      '/api/deal-watches?id=${Uri.encodeComponent(id)}',
    );
    return _maps(data['watches']).map(DealWatch.fromJson).toList();
  }

  Future<MemberAccount> updateProfile(String displayName) async {
    final data = await _request(
      'POST',
      '/api/account',
      body: {'action': 'profile', 'displayName': displayName},
    );
    return MemberAccount.fromJson(_map(data['account']));
  }

  Future<void> changePassword(
      String currentPassword, String newPassword) async {
    await _request(
      'POST',
      '/api/account',
      body: {
        'action': 'password',
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
  }

  Future<AdminOverview> adminOverview() async {
    return AdminOverview.fromJson(await _request('GET', '/api/admin'));
  }

  /// Grants or revokes a single member's Properties Scout access. Admin only;
  /// returns the updated account.
  Future<MemberAccount> setMemberPropertiesAccess(
      String accountId, bool granted) async {
    final data = await _request(
      'POST',
      '/api/admin',
      body: {
        'action': 'set_properties_access',
        'accountId': accountId,
        'granted': granted,
      },
    );
    return MemberAccount.fromJson(_map(data['account']));
  }

  /// Properties Scout — searches Property24 and Private Property for homes to
  /// buy or rent. Access is enforced server-side; a locked/unauthed response
  /// surfaces as an [ApiException] (the UI gates on the account flag first).
  Future<PropertySearchResult> searchProperties({
    required String query,
    required String listingType,
    double? lat,
    double? lon,
    int page = 1,
    int? minBeds,
    int? minPrice,
    int? maxPrice,
    String? sort,
  }) async {
    final params = <String, String>{
      'q': query.trim(),
      'type': listingType,
      if (lat != null && lon != null) 'lat': '$lat',
      if (lat != null && lon != null) 'lon': '$lon',
      if (page > 1) 'page': '$page',
      if (minBeds != null) 'minBeds': '$minBeds',
      if (minPrice != null) 'minPrice': '$minPrice',
      if (maxPrice != null) 'maxPrice': '$maxPrice',
      if (sort != null && sort != 'relevance') 'sort': sort,
    };
    final qs = params.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    final data = await _request('GET', '/api/properties?$qs');
    return PropertySearchResult.fromJson(data);
  }

  /// Turns a typed address/suburb into coordinates via the server-side geocoder.
  Future<GeoPoint> geocodeAddress(String query) async {
    final data = await _request(
      'GET',
      '/api/geocode?q=${Uri.encodeComponent(query.trim())}',
    );
    final match = data['match'];
    if (match is Map) {
      return GeoPoint.fromJson(Map<String, dynamic>.from(match));
    }
    final message = data['message'];
    throw ApiException(
      message is String && message.isNotEmpty
          ? message
          : 'We could not find that address.',
    );
  }

  AdsResult _adsResult(Map<String, dynamic> data) => AdsResult(
        ads: _maps(data['ads']).map(AdSubmission.fromJson).toList(),
        rateCard: data['rateCard'] is Map
            ? AdRateCard.fromJson(Map<String, dynamic>.from(data['rateCard']))
            : AdRateCard.fallback,
      );

  /// The signed-in member's own ads plus the current rate card.
  Future<AdsResult> myAds() async {
    return _adsResult(await _request('GET', '/api/ads'));
  }

  /// The admin review queue (pending first, then approved/rest).
  Future<AdsResult> adminAds() async {
    return _adsResult(await _request('GET', '/api/ads?queue=review'));
  }

  Future<AdSubmission> submitAd(AdDraft draft) async {
    final data = await _request('POST', '/api/ads', body: draft.toJson());
    return AdSubmission.fromJson(_map(data['ad']));
  }

  Future<AdsResult> reviewAd(String id, String decision, {String? note}) async {
    final data = await _request(
      'PATCH',
      '/api/ads',
      body: {
        'id': id,
        'decision': decision,
        if (note != null && note.isNotEmpty) 'note': note,
      },
    );
    return _adsResult(data);
  }

  /// Starts a once-off PayFast checkout for an approved ad. Reuses the
  /// SubscriptionCheckout shape so the same checkout sheet renders it.
  Future<SubscriptionCheckout> adCheckout(String adId) async {
    final data = await _request(
      'POST',
      '/api/ad-checkout',
      body: {'adId': adId},
      acceptErrorData: true,
    );
    return SubscriptionCheckout.fromJson(_map(data['checkout']));
  }

  /// Live sponsored ads for a placement ('feed' or 'near_me'). Public, no auth.
  Future<List<PublicAd>> publicAds(String placement) async {
    final data = await _request(
      'GET',
      '/api/public-ads?placement=${Uri.encodeComponent(placement)}',
    );
    return _maps(data['ads']).map(PublicAd.fromJson).toList();
  }

  /// Deals from the external deal sites (OneDayOnly, Hyperli, Daddy's Deals,
  /// MyRunway) for the endless Scroll reel. Public, no auth.
  Future<List<ScrollDeal>> dealSites() async {
    final data = await _request('GET', '/api/deal-sites');
    return _maps(data['deals']).map(ScrollDeal.fromJson).toList();
  }

  Future<NotificationPreferences> notificationPreferences() async {
    final data = await _request('GET', '/api/notification-prefs');
    return NotificationPreferences.fromJson(_map(data['preferences']));
  }

  Future<NotificationPreferences> setNotificationPreferences(
      bool newDeals) async {
    final data = await _request(
      'PUT',
      '/api/notification-prefs',
      body: {'newDeals': newDeals},
    );
    return NotificationPreferences.fromJson(_map(data['preferences']));
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool acceptErrorData = false,
  }) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    request.headers['accept'] = 'application/json';
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    if (!_useBrowserCookies) {
      final cookie = await _cookieStore.read();
      if (cookie != null && cookie.isNotEmpty) {
        request.headers['cookie'] = cookie;
      }
    }

    final streamed =
        await _client.send(request).timeout(const Duration(seconds: 30));
    final response = await http.Response.fromStream(streamed);
    await _captureCookie(response);

    Map<String, dynamic> envelope = const {};
    if (response.body.isNotEmpty) {
      final decoded = jsonDecode(response.body);
      if (decoded is Map) envelope = Map<String, dynamic>.from(decoded);
    }
    final data = _map(envelope['data']);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 401) await _cookieStore.clear();
      if (!acceptErrorData || data.isEmpty) {
        throw ApiException(
          _firstIssue(data) ??
              _optionalMessage(envelope['error']) ??
              'The server returned ${response.statusCode}.',
          statusCode: response.statusCode,
        );
      }
    }

    return data;
  }

  Future<void> _captureCookie(http.Response response) async {
    if (_useBrowserCookies) return;
    final header = response.headers['set-cookie'];
    if (header == null || !header.contains('ts_member_session=')) return;
    final cookie = header.split(';').first.trim();
    final value = cookie.substring(cookie.indexOf('=') + 1);
    if (value.isEmpty || header.toLowerCase().contains('max-age=0')) {
      await _cookieStore.clear();
    } else {
      await _cookieStore.write(cookie);
    }
  }
}

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList()
    : <Map<String, dynamic>>[];

String? _firstIssue(Map<String, dynamic> data) {
  final issues = data['issues'];
  return issues is List && issues.isNotEmpty ? issues.first.toString() : null;
}

String? _optionalMessage(Object? error) {
  final map = _map(error);
  final message = map['message'];
  return message is String && message.isNotEmpty ? message : null;
}
