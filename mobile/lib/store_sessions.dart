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
  });

  final String id;
  final String name;
  final String host;
  final String signInUrl;
  final String homeUrl;
}

const List<SupportedStore> supportedStores = [
  SupportedStore(
    id: 'checkers',
    name: 'Checkers',
    host: 'checkers.co.za',
    signInUrl: 'https://www.checkers.co.za/login',
    homeUrl: 'https://www.checkers.co.za/',
  ),
  SupportedStore(
    id: 'shoprite',
    name: 'Shoprite',
    host: 'shoprite.co.za',
    signInUrl: 'https://www.shoprite.co.za/login',
    homeUrl: 'https://www.shoprite.co.za/',
  ),
  SupportedStore(
    id: 'pick-n-pay',
    name: 'Pick n Pay',
    host: 'pnp.co.za',
    signInUrl: 'https://www.pnp.co.za/login',
    homeUrl: 'https://www.pnp.co.za/',
  ),
  SupportedStore(
    id: 'woolworths',
    name: 'Woolworths',
    host: 'woolworths.co.za',
    signInUrl: 'https://www.woolworths.co.za/login',
    homeUrl: 'https://www.woolworths.co.za/',
  ),
  SupportedStore(
    id: 'takealot',
    name: 'Takealot',
    host: 'takealot.com',
    signInUrl: 'https://www.takealot.com/account/login',
    homeUrl: 'https://www.takealot.com/',
  ),
  SupportedStore(
    id: 'makro',
    name: 'Makro',
    host: 'makro.co.za',
    signInUrl: 'https://www.makro.co.za/login',
    homeUrl: 'https://www.makro.co.za/',
  ),
  SupportedStore(
    id: 'game',
    name: 'Game',
    host: 'game.co.za',
    signInUrl: 'https://www.game.co.za/login',
    homeUrl: 'https://www.game.co.za/',
  ),
  SupportedStore(
    id: 'dischem',
    name: 'Dis-Chem',
    host: 'dischem.co.za',
    signInUrl: 'https://www.dischem.co.za/customer/account/login',
    homeUrl: 'https://www.dischem.co.za/',
  ),
  SupportedStore(
    id: 'clicks',
    name: 'Clicks',
    host: 'clicks.co.za',
    signInUrl: 'https://clicks.co.za/login',
    homeUrl: 'https://clicks.co.za/',
  ),
  SupportedStore(
    id: 'mrp',
    name: 'Mr Price',
    host: 'mrp.com',
    signInUrl: 'https://www.mrp.com/customer/account/login',
    homeUrl: 'https://www.mrp.com/',
  ),
  SupportedStore(
    id: 'bash',
    name: 'Bash (TFG)',
    host: 'bash.com',
    signInUrl: 'https://bash.com/login',
    homeUrl: 'https://bash.com/',
  ),
  SupportedStore(
    id: 'onedayonly',
    name: 'OneDayOnly',
    host: 'onedayonly.co.za',
    signInUrl: 'https://www.onedayonly.co.za/login',
    homeUrl: 'https://www.onedayonly.co.za/',
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
