import 'api_models.dart';

class StoreGroup {
  const StoreGroup({
    required this.id,
    required this.displayName,
    required this.branches,
    this.retailerId,
  });

  final String id;
  final String displayName;
  final String? retailerId;
  final List<NearbyStore> branches;

  bool get isKnownChain => retailerId != null;

  String? get logoUrl {
    for (final branch in branches) {
      if (branch.logoUrl?.isNotEmpty == true) return branch.logoUrl;
    }
    return null;
  }

  int get dealCount =>
      branches.fold(0, (total, branch) => total + branch.deals.length);

  int get catalogueCount =>
      branches.fold(0, (total, branch) => total + branch.catalogues.length);
}

List<StoreGroup> groupNearbyStores(Iterable<NearbyStore> stores) {
  final buckets = <String, List<NearbyStore>>{};
  final retailerIds = <String, String?>{};

  for (final store in stores) {
    final retailerId = _normaliseRetailerId(store.retailerId);
    final host = retailerId == null ? _verifiedHost(store.website) : null;
    final brand = _normaliseBrand(store.name);
    final key = retailerId != null
        ? 'retailer:$retailerId'
        : host != null
            ? 'host:$host'
            : 'brand:${brand.isEmpty ? store.placeId : brand}';
    buckets.putIfAbsent(key, () => []).add(store);
    retailerIds[key] = retailerId;
  }

  final groups = buckets.entries.map((entry) {
    final retailerId = retailerIds[entry.key];
    return StoreGroup(
      id: entry.key,
      retailerId: retailerId,
      displayName: _groupName(retailerId, entry.value),
      branches: List.unmodifiable(entry.value),
    );
  }).toList()
    ..sort((a, b) => a.displayName.compareTo(b.displayName));
  return List.unmodifiable(groups);
}

String? _normaliseRetailerId(String? value) {
  final id = value?.trim().toLowerCase();
  return id == null || id.isEmpty ? null : id;
}

String? _verifiedHost(String? value) {
  final uri = value == null ? null : Uri.tryParse(value.trim());
  if (uri == null ||
      (uri.scheme != 'https' && uri.scheme != 'http') ||
      uri.host.isEmpty) {
    return null;
  }
  final host = uri.host.toLowerCase();
  return host.startsWith('www.') ? host.substring(4) : host;
}

String _normaliseBrand(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

String _groupName(String? retailerId, List<NearbyStore> branches) {
  final knownName = _knownRetailerNames[retailerId];
  if (knownName != null) return knownName;

  final names = branches
      .map((branch) => branch.name.trim())
      .where((name) => name.isNotEmpty)
      .toList()
    ..sort((a, b) {
      final length = a.length.compareTo(b.length);
      return length == 0 ? a.compareTo(b) : length;
    });
  return names.isEmpty ? 'Store' : names.first;
}

const _knownRetailerNames = <String?, String>{
  'builders': 'Builders',
  'boxer': 'Boxer',
  'checkers': 'Checkers',
  'clicks': 'Clicks',
  'dis-chem': 'Dis-Chem',
  'food-lovers-market': 'Food Lover’s Market',
  'game': 'Game',
  'makro': 'Makro',
  'ok-foods': 'OK Foods',
  'pick-n-pay': 'Pick n Pay',
  'picknpay': 'Pick n Pay',
  'pnp': 'Pick n Pay',
  'shoprite': 'Shoprite',
  'spar': 'SPAR',
  'usave': 'Usave',
  'woolworths': 'Woolworths',
};
