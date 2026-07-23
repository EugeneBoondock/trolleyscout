import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

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
    SessionSnapshotStore? sessionStore,
    bool? useBrowserCookies,
    this.baseUrl = 'https://trolleyscout.co.za',
    this.requestTimeout = const Duration(seconds: 15),
    this.slowRequestTimeout = const Duration(seconds: 75),
  })  : _client = client ?? createPlatformHttpClient(),
        _cookieStore = cookieStore ?? SecureSessionCookieStore(),
        _sessionStore = sessionStore ?? SecureSessionSnapshotStore(),
        _useBrowserCookies = useBrowserCookies ?? platformUsesBrowserCookies;

  final http.Client _client;
  final SessionCookieStore _cookieStore;
  final SessionSnapshotStore _sessionStore;
  final bool _useBrowserCookies;
  final String baseUrl;
  final Duration requestTimeout;

  /// Timeout for endpoints that legitimately take a while server-side (live
  /// scouting sweeps, multi-portal property searches). The default 15s window
  /// misreports these as failures while the server is still working.
  final Duration slowRequestTimeout;
  static const _adminCountryPreferenceKey = 'ts_admin_country_override_v1';
  String? _adminCountryCode;
  String? _memberCountryCode;
  bool _adminCountryLoaded = false;

  String get effectiveCountryCode =>
      _adminCountryCode ?? _memberCountryCode ?? 'ZA';
  bool get isAdminCountryOverrideActive =>
      _adminCountryCode != null && _adminCountryCode!.isNotEmpty;

  Future<MemberSession> session() async {
    try {
      final data = await _request('GET', '/api/member-session');
      final session = MemberSession.fromJson(_map(data['session']));
      _memberCountryCode = session.account?.countryCode;
      await _cacheSession(session);
      return session;
    } on ApiException catch (error) {
      final canUseSnapshot = error.statusCode == null ||
          (error.statusCode != null && error.statusCode! >= 500);
      final cached = canUseSnapshot ? await _readCachedSession() : null;
      if (cached != null) {
        _memberCountryCode = cached.account?.countryCode;
        return MemberSession(
          isAuthenticated: true,
          account: cached.account,
          isOffline: true,
        );
      }
      rethrow;
    }
  }

  Future<MemberSession> authenticate(AuthDraft draft) async {
    final data =
        await _request('POST', '/api/member-session', body: draft.toJson());
    final session = MemberSession.fromJson(_map(data['session']));
    _memberCountryCode = session.account?.countryCode;
    await _cacheSession(session);
    return session;
  }

  Future<MemberSession> signOut() async {
    try {
      final data = await _request('DELETE', '/api/member-session');
      return MemberSession.fromJson(_map(data['session']));
    } finally {
      await clearLocalSession();
    }
  }

  /// Removes the native session even when the server cannot be reached.
  Future<void> clearLocalSession() async {
    try {
      await _sessionStore.clear();
    } catch (_) {
      // Cookie removal below is the security boundary for the live session.
    }
    await _cookieStore.clear();
    _adminCountryCode = null;
    _memberCountryCode = null;
    _adminCountryLoaded = true;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove(_adminCountryPreferenceKey);
    } catch (_) {
      // Session clearing still succeeds when preferences are unavailable.
    }
  }

  Future<DiscoveryResult> discovery(
      {bool forceLive = false, bool summary = false}) async {
    final query = <String>[];
    if (forceLive) query.add('refresh=1');
    if (summary) query.add('summary=1');
    final suffix = query.isEmpty ? '' : '?${query.join('&')}';
    return DiscoveryResult.fromJson(await _request(
      'GET',
      '/api/discovery$suffix',
      // A forced live refresh re-scouts sources server-side and routinely
      // outlives the standard timeout.
      timeout: forceLive ? slowRequestTimeout : null,
    ));
  }

  Future<List<Deal>> deals() async => (await discovery()).deals;

  Future<DiscoveredStoresResult> discoveredStores({
    bool summary = false,
    int? limit,
    int offset = 0,
    String query = '',
    bool includeDetails = true,
    String? placeId,
  }) async {
    final parameters = <String, String>{};
    if (summary) parameters['summary'] = '1';
    if (limit != null) parameters['limit'] = '$limit';
    if (offset > 0) parameters['offset'] = '$offset';
    if (query.trim().isNotEmpty) parameters['q'] = query.trim();
    if (!includeDetails) parameters['details'] = '0';
    if (placeId?.trim().isNotEmpty == true) {
      parameters['placeId'] = placeId!.trim();
    }
    final suffix =
        parameters.isEmpty ? '' : '?${Uri(queryParameters: parameters).query}';
    return DiscoveredStoresResult.fromJson(
      await _request('GET', '/api/discovered-stores$suffix'),
    );
  }

  Future<List<Voucher>> vouchers() async {
    final data = await _request('GET', '/api/vouchers');
    return _maps(data['vouchers']).map(Voucher.fromJson).toList();
  }

  Future<int> voucherCount() async {
    final data = await _request('GET', '/api/vouchers?summary=1');
    return (data['summary']?['activeVoucherCount'] as num?)?.toInt() ?? 0;
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
      {String query = '', String kind = 'all', bool summary = false}) async {
    final parameters = <String, String>{};
    if (query.trim().isNotEmpty) parameters['q'] = query.trim();
    if (kind != 'all') parameters['kind'] = kind;
    if (summary) parameters['summary'] = '1';
    final suffix =
        parameters.isEmpty ? '' : '?${Uri(queryParameters: parameters).query}';
    return RetailerCatalog.fromJson(
        await _request('GET', '/api/retailers$suffix'));
  }

  Future<ProductComparisonResult> searchProductPrices({
    required String query,
    required List<String> retailerIds,
  }) async =>
      ProductComparisonResult.fromJson(await _request(
        'POST',
        '/api/price-compare',
        body: {
          'query': query.trim(),
          'retailerIds': retailerIds,
        },
      ));

  Future<NearbyResult> nearbyStores(double lat, double lon) async {
    final data = await _request(
      'GET',
      '/api/nearby-stores?lat=${Uri.encodeComponent('$lat')}&lon=${Uri.encodeComponent('$lon')}',
    );
    return NearbyResult.fromJson(data);
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

  Future<int> verifiedOfferCount() async {
    final data = await _request('GET', '/api/offers?summary=1');
    return (data['summary']?['verifiedOfferCount'] as num?)?.toInt() ?? 0;
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

  /// The shopper's country with a ZAR conversion rate, so prices can be
  /// shown in their own currency (PayFast still settles in rand).
  Future<CountryPricing> country() async {
    final data = await _request('GET', '/api/country');
    final country = data['country'];
    return CountryPricing.fromJson(
        country is Map<String, dynamic> ? country : const {});
  }

  Future<SubscriptionCheckout> checkout(
      String planId, String billingCycle) async {
    final data = await _request(
      'POST',
      '/api/subscription',
      body: {
        'planId': planId,
        'billingCycle': billingCycle,
        // PayFast's classic checkout is a top-level page inside the native
        // WebView. Its onsite engine relies on an injected iframe that can
        // close immediately in Android WebViews.
        'checkoutMode': 'redirect',
      },
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
    final account = MemberAccount.fromJson(_map(data['account']));
    _memberCountryCode = account.countryCode;
    await _cacheSession(
      MemberSession(isAuthenticated: true, account: account),
    );
    return account;
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

  Future<AdminOverview> setAdminTestCountry(String countryCode) async {
    final code = countryCode.trim().toUpperCase();
    final data = await _request('POST', '/api/admin', body: {
      'action': 'set_test_country',
      'countryCode': code,
    });
    _adminCountryCode = code;
    _adminCountryLoaded = true;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_adminCountryPreferenceKey, code);
    } catch (_) {
      // The in-memory override remains active for this app session.
    }
    return AdminOverview.fromJson(data);
  }

  /// Permanently deletes the signed-in account and its personal data. The
  /// current password is re-verified server-side before anything is removed.
  Future<void> deleteAccount({required String currentPassword}) async {
    await _request('POST', '/api/account', body: {
      'action': 'delete',
      'currentPassword': currentPassword,
    });
    await clearLocalSession();
  }

  /// Sends a support message (bug report, feature request, question). Public
  /// endpoint; the server links it to the signed-in account when present.
  /// Returns the server's confirmation copy.
  Future<String> submitSupportMessage({
    required String name,
    required String email,
    required String topic,
    required String message,
  }) async {
    final data = await _request('POST', '/api/support', body: {
      'name': name,
      'email': email,
      'topic': topic,
      'message': message,
    });
    final note = data['message'];
    return note is String && note.isNotEmpty
        ? note
        : 'Thanks — your message has reached the team.';
  }

  /// Admin: mark a support message open/resolved. Returns the refreshed
  /// console overview.
  Future<AdminOverview> setSupportMessageStatus(
      String messageId, String status) async {
    return AdminOverview.fromJson(await _request('POST', '/api/admin', body: {
      'action': 'set_support_status',
      'messageId': messageId,
      'status': status,
    }));
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
    // Property search fans out to many portals server-side; give it the
    // extended window instead of misreporting slow-but-successful searches.
    final data = await _request(
      'GET',
      '/api/properties?$qs',
      timeout: slowRequestTimeout,
    );
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
  Future<List<ScrollDeal>> dealSites({bool forceLive = false}) async {
    final suffix = forceLive ? '?refresh=1' : '';
    final data = await _request(
      'GET',
      '/api/deal-sites$suffix',
      timeout: forceLive ? slowRequestTimeout : null,
    );
    return _maps(data['deals']).map(ScrollDeal.fromJson).toList();
  }

  Future<Basket> saveDealToBasket(Deal deal) async {
    final savedDeals = await saveDeal(deal);
    SavedDeal? saved;
    for (final candidate in savedDeals) {
      if ((deal.productUrl != null &&
              candidate.productUrl == deal.productUrl) ||
          (deal.id.isNotEmpty && candidate.id == deal.id)) {
        saved = candidate;
        break;
      }
    }
    if (saved == null) {
      throw const ApiException(
          'The deal was saved, but could not be matched for the basket.');
    }
    return addBasketItem(saved.id);
  }

  /// Runs the two protected upstream deal scouts. The server accepts these
  /// requests only for an authenticated admin account.
  Future<void> refreshDealSources() async {
    await _loadAdminCountryOverride();
    if (effectiveCountryCode != 'ZA') {
      await discovery(forceLive: true);
      return;
    }
    await Future.wait<dynamic>([
      discovery(forceLive: true),
      dealSites(forceLive: true),
    ]);
  }

  // --- Window Shopping social + cross-device account state ---

  /// The account's saved Window Shopping deals (server-backed; stale deals are
  /// pruned server-side so the list only holds deals still on offer).
  Future<List<ScrollDeal>> windowSaves() async {
    final data = await _request('GET', '/api/window-saves');
    return _maps(data['deals']).map(ScrollDeal.fromJson).toList();
  }

  Future<SaveStat> saveWindowDeal(ScrollDeal deal) async {
    final data = await _request('POST', '/api/window-saves',
        body: {'deal': deal.toJson()});
    return SaveStat.fromJson(data);
  }

  Future<SaveStat> unsaveWindowDeal(String dealId) async {
    final data = await _request(
        'DELETE', '/api/window-saves?dealId=${Uri.encodeComponent(dealId)}');
    return SaveStat.fromJson(data);
  }

  /// Save counts (and whether the current shopper saved each) for many deals.
  Future<Map<String, SaveStat>> windowSaveCounts(List<String> ids) async {
    if (ids.isEmpty) return const {};
    final query = ids.map(Uri.encodeComponent).join(',');
    final data = await _request('GET', '/api/window-saves?counts=$query');
    final counts = _map(data['counts']);
    return counts
        .map((key, value) => MapEntry(key, SaveStat.fromJson(_map(value))));
  }

  Future<List<DealComment>> dealComments(String dealId) async {
    final data = await _request(
        'GET', '/api/deal-comments?dealId=${Uri.encodeComponent(dealId)}');
    return _maps(data['comments']).map(DealComment.fromJson).toList();
  }

  Future<DealComment> addDealComment(String dealId, String body) async {
    final data = await _request('POST', '/api/deal-comments',
        body: {'dealId': dealId, 'body': body});
    return DealComment.fromJson(_map(data['comment']));
  }

  /// Reads a per-account state blob (near-me history, saved addresses, …).
  Future<Object?> getMemberState(String key) async {
    final data = await _request(
        'GET', '/api/member-state?key=${Uri.encodeComponent(key)}');
    return data['value'];
  }

  Future<void> setMemberState(String key, Object? value) async {
    await _request('PUT', '/api/member-state',
        body: {'key': key, 'value': value});
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

  Future<DealAlertSummary> dealAlerts({int? after}) async {
    final suffix = after == null ? '' : '?after=$after';
    final data = await _request('GET', '/api/deal-alerts$suffix');
    return DealAlertSummary.fromJson(data);
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool acceptErrorData = false,
    Duration? timeout,
  }) async {
    await _loadAdminCountryOverride();
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    request.headers['accept'] = 'application/json';
    if (_adminCountryCode != null && _adminCountryCode!.isNotEmpty) {
      request.headers['x-trolley-scout-test-country'] = _adminCountryCode!;
    }
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

    late final http.Response response;
    try {
      response = await (() async {
        final streamed = await _client.send(request);
        return http.Response.fromStream(streamed);
      })()
          .timeout(timeout ?? requestTimeout);
    } on TimeoutException {
      throw const ApiException('The request took too long. Try again.');
    } catch (_) {
      throw const ApiException(
          'Could not connect. Check your connection and try again.');
    }
    await _captureCookie(response);

    Map<String, dynamic> envelope = const {};
    if (response.body.isNotEmpty) {
      late final Object? decoded;
      try {
        decoded = jsonDecode(response.body);
      } on FormatException {
        throw const ApiException(
            'The server returned an invalid response. Try again.');
      }
      if (decoded is Map) envelope = Map<String, dynamic>.from(decoded);
    }
    final data = _map(envelope['data']);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 401) await clearLocalSession();
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

  Future<void> _loadAdminCountryOverride() async {
    if (_adminCountryLoaded) return;
    _adminCountryLoaded = true;
    try {
      final preferences = await SharedPreferences.getInstance();
      final code = preferences
          .getString(_adminCountryPreferenceKey)
          ?.trim()
          .toUpperCase();
      if (code != null && RegExp(r'^[A-Z]{2}$').hasMatch(code)) {
        _adminCountryCode = code;
      }
    } catch (_) {
      _adminCountryCode = null;
    }
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

  Future<void> _cacheSession(MemberSession session) async {
    try {
      if (!session.isAuthenticated || session.account == null) {
        await _sessionStore.clear();
        return;
      }
      await _sessionStore.write(jsonEncode(session.toJson()));
    } catch (_) {
      // A cache failure must not replace a valid server session.
    }
  }

  Future<MemberSession?> _readCachedSession() async {
    try {
      final value = await _sessionStore.read();
      if (value == null || value.isEmpty) return null;
      final decoded = jsonDecode(value);
      if (decoded is! Map) return null;
      final session =
          MemberSession.fromJson(Map<String, dynamic>.from(decoded));
      return session.isAuthenticated && session.account?.id.isNotEmpty == true
          ? session
          : null;
    } catch (_) {
      return null;
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
