import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A shop the shopper can hold a signed-in session for inside the app's own
/// browser. The login page is listed explicitly because most of these sites
/// bury it behind a menu that only appears on a wide screen.
@immutable
class SupportedStore {
  const SupportedStore({
    required this.id,
    required this.name,
    required this.host,
    required this.signInUrl,
    required this.homeUrl,
    this.accountPath = '',
  });

  final String id;
  final String name;
  final String host;
  final String signInUrl;
  final String homeUrl;

  /// A same-origin path that only answers for a signed-in shopper.
  ///
  /// Several storefronts have icon-only headers with no "sign in" or "sign
  /// out" text anywhere in the DOM — Mr Price is one — so there is nothing to
  /// read. Asking the shop for this page and seeing whether it answers or
  /// bounces to a login is the only signal that works there.
  final String accountPath;
}

const List<SupportedStore> supportedStores = [
  SupportedStore(
    id: 'checkers',
    accountPath: '/account/orders',
    name: 'Checkers',
    host: 'checkers.co.za',
    signInUrl: 'https://www.checkers.co.za/login',
    homeUrl: 'https://www.checkers.co.za/',
  ),
  SupportedStore(
    id: 'shoprite',
    accountPath: '/account/orders',
    name: 'Shoprite',
    host: 'shoprite.co.za',
    signInUrl: 'https://www.shoprite.co.za/login',
    homeUrl: 'https://www.shoprite.co.za/',
  ),
  SupportedStore(
    id: 'pick-n-pay',
    accountPath: '/my-account',
    name: 'Pick n Pay',
    host: 'pnp.co.za',
    signInUrl: 'https://www.pnp.co.za/login',
    homeUrl: 'https://www.pnp.co.za/',
  ),
  SupportedStore(
    id: 'woolworths',
    accountPath: '/account',
    name: 'Woolworths',
    host: 'woolworths.co.za',
    signInUrl: 'https://www.woolworths.co.za/login',
    homeUrl: 'https://www.woolworths.co.za/',
  ),
  SupportedStore(
    id: 'takealot',
    accountPath: '/account/orders',
    name: 'Takealot',
    host: 'takealot.com',
    signInUrl: 'https://www.takealot.com/account/login',
    homeUrl: 'https://www.takealot.com/',
  ),
  SupportedStore(
    id: 'makro',
    accountPath: '/my-account',
    name: 'Makro',
    host: 'makro.co.za',
    signInUrl: 'https://www.makro.co.za/login',
    homeUrl: 'https://www.makro.co.za/',
  ),
  SupportedStore(
    id: 'game',
    accountPath: '/my-account',
    name: 'Game',
    host: 'game.co.za',
    signInUrl: 'https://www.game.co.za/login',
    homeUrl: 'https://www.game.co.za/',
  ),
  SupportedStore(
    id: 'dischem',
    accountPath: '/customer/account/',
    name: 'Dis-Chem',
    host: 'dischem.co.za',
    signInUrl: 'https://www.dischem.co.za/customer/account/login',
    homeUrl: 'https://www.dischem.co.za/',
  ),
  SupportedStore(
    id: 'clicks',
    accountPath: '/account',
    name: 'Clicks',
    host: 'clicks.co.za',
    signInUrl: 'https://clicks.co.za/login',
    homeUrl: 'https://clicks.co.za/',
  ),
  SupportedStore(
    id: 'mrp',
    accountPath: '/customer/account/',
    name: 'Mr Price',
    host: 'mrp.com',
    signInUrl: 'https://www.mrp.com/customer/account/login',
    homeUrl: 'https://www.mrp.com/',
  ),
  SupportedStore(
    id: 'bash',
    accountPath: '/account',
    name: 'Bash (TFG)',
    host: 'bash.com',
    signInUrl: 'https://bash.com/login',
    homeUrl: 'https://bash.com/',
  ),
  SupportedStore(
    id: 'pep',
    accountPath: '/account',
    name: 'PEP',
    host: 'pepstores.com',
    signInUrl: 'https://www.pepstores.com/account/login',
    homeUrl: 'https://www.pepstores.com/',
  ),
  SupportedStore(
    id: 'ackermans',
    accountPath: '/account',
    name: 'Ackermans',
    host: 'ackermans.co.za',
    signInUrl: 'https://www.ackermans.co.za/account/login',
    homeUrl: 'https://www.ackermans.co.za/',
  ),
  SupportedStore(
    id: 'spar',
    accountPath: '/account',
    name: 'SPAR',
    host: 'spar.co.za',
    signInUrl: 'https://www.spar.co.za/login',
    homeUrl: 'https://www.spar.co.za/',
  ),
  SupportedStore(
    id: 'boxer',
    accountPath: '/account',
    name: 'Boxer',
    host: 'boxer.co.za',
    signInUrl: 'https://www.boxer.co.za/login',
    homeUrl: 'https://www.boxer.co.za/',
  ),
  SupportedStore(
    id: 'edgars',
    accountPath: '/account',
    name: 'Edgars',
    host: 'edgars.co.za',
    signInUrl: 'https://www.edgars.co.za/account/login',
    homeUrl: 'https://www.edgars.co.za/',
  ),
  SupportedStore(
    id: 'tekkie-town',
    accountPath: '/account',
    name: 'Tekkie Town',
    host: 'tekkietown.co.za',
    signInUrl: 'https://tekkietown.co.za/account/login',
    homeUrl: 'https://tekkietown.co.za/',
  ),
  SupportedStore(
    id: 'sportscene',
    accountPath: '/account',
    name: 'Sportscene',
    host: 'sportscene.co.za',
    signInUrl: 'https://www.sportscene.co.za/login',
    homeUrl: 'https://www.sportscene.co.za/',
  ),
  SupportedStore(
    id: 'faithful-to-nature',
    accountPath: '/customer/account/',
    name: 'Faithful to Nature',
    host: 'faithful-to-nature.co.za',
    signInUrl: 'https://www.faithful-to-nature.co.za/customer/account/login',
    homeUrl: 'https://www.faithful-to-nature.co.za/',
  ),
  SupportedStore(
    id: 'bathu',
    accountPath: '/account',
    name: 'Bathu',
    host: 'bathu.co.za',
    signInUrl: 'https://www.bathu.co.za/account/login',
    homeUrl: 'https://www.bathu.co.za/',
  ),
  SupportedStore(
    id: 'onedayonly',
    accountPath: '/account',
    name: 'OneDayOnly',
    host: 'onedayonly.co.za',
    signInUrl: 'https://www.onedayonly.co.za/login',
    homeUrl: 'https://www.onedayonly.co.za/',
  ),
  // Food delivery: the cart lives behind a sign-in and a delivery address,
  // which is exactly why the agent works in the shopper's own session.
  SupportedStore(
    id: 'ubereats',
    accountPath: '/orders',
    name: 'Uber Eats',
    host: 'ubereats.com',
    signInUrl: 'https://www.ubereats.com/login-redirect',
    homeUrl: 'https://www.ubereats.com/za',
  ),
  SupportedStore(
    id: 'mrd-food',
    accountPath: '/account',
    name: 'Mr D Food',
    host: 'mrdfood.com',
    signInUrl: 'https://www.mrdfood.com/login',
    homeUrl: 'https://www.mrdfood.com/',
  ),
  SupportedStore(
    id: 'checkers-sixty60',
    accountPath: '/account',
    name: 'Checkers Sixty60',
    host: 'sixty60.co.za',
    signInUrl: 'https://www.sixty60.co.za/login',
    homeUrl: 'https://www.sixty60.co.za/',
  ),
];

SupportedStore? storeForHost(String host) {
  final clean = host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  for (final store in supportedStores) {
    if (clean == store.host || clean.endsWith('.${store.host}')) return store;
  }
  return null;
}

/// What the app remembers about a store sign-in. Deliberately no credentials:
/// the password is typed into the store's own page and the session lives in
/// the WebView's own cookie jar, which the app never reads.
@immutable
class StoreSessionRecord {
  const StoreSessionRecord({
    required this.storeId,
    required this.signedInAt,
    this.accountLabel,
    this.lastVerifiedAt,
  });

  factory StoreSessionRecord.fromJson(Map<String, dynamic> json) =>
      StoreSessionRecord(
        storeId: json['storeId']?.toString() ?? '',
        signedInAt: DateTime.tryParse(json['signedInAt']?.toString() ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
        accountLabel: json['accountLabel']?.toString(),
        lastVerifiedAt:
            DateTime.tryParse(json['lastVerifiedAt']?.toString() ?? ''),
      );

  final String storeId;
  final DateTime signedInAt;
  final String? accountLabel;
  final DateTime? lastVerifiedAt;

  Map<String, dynamic> toJson() => {
        'storeId': storeId,
        'signedInAt': signedInAt.toUtc().toIso8601String(),
        if (accountLabel != null) 'accountLabel': accountLabel,
        if (lastVerifiedAt != null)
          'lastVerifiedAt': lastVerifiedAt!.toUtc().toIso8601String(),
      };
}

/// Remembers which shops the shopper is signed into so the agent can say
/// "you're signed in at Checkers" before it starts, and so the sessions screen
/// has something to show. The sessions themselves are the WebView's cookies,
/// which survive restarts on their own.
class StoreSessionStore extends ChangeNotifier {
  StoreSessionStore({SharedPreferences? preferences}) : _injected = preferences;

  static final StoreSessionStore instance = StoreSessionStore();
  static const _key = 'store_sessions_v1';

  final SharedPreferences? _injected;
  Map<String, StoreSessionRecord> _records = {};
  bool _loaded = false;

  bool get loaded => _loaded;
  List<StoreSessionRecord> get records =>
      List.unmodifiable(_records.values.toList()
        ..sort((left, right) => right.signedInAt.compareTo(left.signedInAt)));

  StoreSessionRecord? recordFor(String storeId) => _records[storeId];
  bool isSignedIn(String storeId) => _records.containsKey(storeId);

  Future<void> load() async {
    if (_loaded) return;
    try {
      final preferences = _injected ?? await SharedPreferences.getInstance();
      final raw = preferences.getString(_key);
      _records = _decode(raw);
    } catch (_) {
      _records = {};
    }
    _loaded = true;
    notifyListeners();
  }

  Future<void> remember(
    String storeId, {
    String? accountLabel,
    DateTime? at,
  }) async {
    await load();
    final now = at ?? DateTime.now();
    final existing = _records[storeId];
    _records = {
      ..._records,
      storeId: StoreSessionRecord(
        storeId: storeId,
        signedInAt: existing?.signedInAt ?? now,
        accountLabel: accountLabel ?? existing?.accountLabel,
        lastVerifiedAt: now,
      ),
    };
    notifyListeners();
    await _persist();
  }

  Future<void> forget(String storeId) async {
    await load();
    if (!_records.containsKey(storeId)) return;
    _records = {..._records}..remove(storeId);
    notifyListeners();
    await _persist();
  }

  Future<void> forgetAll() async {
    _records = {};
    _loaded = true;
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    try {
      final preferences = _injected ?? await SharedPreferences.getInstance();
      await preferences.setString(
        _key,
        jsonEncode(_records.map((id, record) => MapEntry(id, record.toJson()))),
      );
    } catch (_) {
      // The session itself lives in the cookie jar; losing the note is cosmetic.
    }
  }

  static Map<String, StoreSessionRecord> _decode(String? raw) {
    if (raw == null || raw.isEmpty) return {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return {};
      final out = <String, StoreSessionRecord>{};
      for (final entry in decoded.entries) {
        if (entry.value is! Map) continue;
        final record = StoreSessionRecord.fromJson(
          Map<String, dynamic>.from(entry.value as Map),
        );
        if (record.storeId.isNotEmpty) out[record.storeId] = record;
      }
      return out;
    } catch (_) {
      return {};
    }
  }
}
