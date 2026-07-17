import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_models.dart';
import 'platform_http_client.dart';
import 'session_cookie_store.dart';
import 'voucher_models.dart';

export 'api_models.dart';
export 'voucher_models.dart';

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
