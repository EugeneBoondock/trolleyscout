import 'dart:convert';
import 'package:http/http.dart' as http;

/// Talks to the live Trolley Scout Cloudflare API. Every endpoint wraps its
/// payload in `{ "data": ... }`, matching the web app's contract.
class Api {
  Api({http.Client? client, this.baseUrl = 'https://trolleyscout.co.za'})
      : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Future<Map<String, dynamic>> _get(String path) async {
    final res = await _client
        .get(Uri.parse('$baseUrl$path'), headers: {'accept': 'application/json'})
        .timeout(const Duration(seconds: 30));
    if (res.statusCode != 200) {
      throw ApiException('HTTP ${res.statusCode}');
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>?) ?? const {};
  }

  Future<List<Deal>> deals() async {
    final data = await _get('/api/discovery');
    final list = (data['deals'] as List? ?? const []);
    return list.map((e) => Deal.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<NearbyResult> nearbyStores(double lat, double lon) async {
    final data = await _get(
        '/api/nearby-stores?lat=${Uri.encodeComponent('$lat')}&lon=${Uri.encodeComponent('$lon')}');
    final stores = (data['stores'] as List? ?? const [])
        .map((e) => NearbyStore.fromJson(e as Map<String, dynamic>))
        .toList();
    return NearbyResult(stores: stores);
  }
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class Deal {
  Deal({
    required this.title,
    required this.retailerName,
    this.priceText,
    this.previousPriceText,
    this.savingText,
    this.productUrl,
    this.pageNumber,
  });

  final String title;
  final String retailerName;
  final String? priceText;
  final String? previousPriceText;
  final String? savingText;
  final String? productUrl;
  final int? pageNumber;

  factory Deal.fromJson(Map<String, dynamic> j) => Deal(
        title: j['title'] as String? ?? '',
        retailerName: j['retailerName'] as String? ?? '',
        priceText: j['priceText'] as String?,
        previousPriceText: j['previousPriceText'] as String?,
        savingText: j['savingText'] as String?,
        productUrl: j['productUrl'] as String?,
        pageNumber: j['pageNumber'] as int?,
      );
}

class NearbyResult {
  NearbyResult({required this.stores});
  final List<NearbyStore> stores;
}

class NearbyStore {
  NearbyStore({
    required this.placeId,
    required this.name,
    this.address,
    this.website,
    this.distanceM,
    this.retailerId,
    this.deals = const [],
    this.catalogues = const [],
  });

  final String placeId;
  final String name;
  final String? address;
  final String? website;
  final num? distanceM;
  final String? retailerId;
  final List<Deal> deals;
  final List<Catalogue> catalogues;

  bool get isKnownChain => retailerId != null;
  bool get hasSomething => deals.isNotEmpty || catalogues.isNotEmpty;

  factory NearbyStore.fromJson(Map<String, dynamic> j) {
    final leaflets = (j['leaflets'] as List? ?? const [])
        .map((e) => Catalogue.fromLeaflet(e as Map<String, dynamic>));
    final promos = (j['promotions'] as List? ?? const [])
        .where((e) => (e as Map)['kind'] == 'catalogue')
        .map((e) => Catalogue.fromPromotion(e as Map<String, dynamic>));
    return NearbyStore(
      placeId: j['placeId'] as String? ?? '',
      name: j['name'] as String? ?? '',
      address: j['address'] as String?,
      website: j['website'] as String?,
      distanceM: j['distanceM'] as num?,
      retailerId: j['retailerId'] as String?,
      deals: (j['deals'] as List? ?? const [])
          .map((e) => Deal.fromJson(e as Map<String, dynamic>))
          .toList(),
      catalogues: [...leaflets, ...promos],
    );
  }
}

class Catalogue {
  Catalogue({required this.name, required this.url, this.validTo});
  final String name;
  final String url;
  final String? validTo;

  factory Catalogue.fromLeaflet(Map<String, dynamic> j) => Catalogue(
        name: j['name'] as String? ?? 'Catalogue',
        url: j['url'] as String? ?? '',
        validTo: j['validTo'] as String?,
      );

  factory Catalogue.fromPromotion(Map<String, dynamic> j) => Catalogue(
        name: j['title'] as String? ?? 'Specials',
        url: (j['productUrl'] ?? j['sourceUrl']) as String? ?? '',
        validTo: j['validTo'] as String?,
      );
}
