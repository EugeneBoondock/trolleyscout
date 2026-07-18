import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// The recommendation engine. Everything a shopper likes or saves in Window
/// Shopping teaches a lightweight on-device "taste profile": a weighted bag of
/// words drawn from the products they show interest in. That profile then ranks
/// the Find-a-deal list ("For you") and decides which new deals are worth a
/// notification — cause and effect, entirely on-device (private, offline).
class TasteProfile {
  const TasteProfile(this.weights);

  const TasteProfile.empty() : weights = const {};

  final Map<String, double> weights;

  bool get isEmpty => weights.isEmpty;

  /// How well a deal matches the shopper's taste: the summed weight of the
  /// profile words that appear in the deal's text. 0 means no signal.
  double score(String title, {String? category}) {
    if (weights.isEmpty) return 0;
    var total = 0.0;
    for (final token in _tokenize('$title ${category ?? ''}')) {
      total += weights[token] ?? 0;
    }
    return total;
  }

  /// The strongest interests, for a human-readable "Because you like…" line.
  List<String> topInterests([int count = 6]) {
    final entries = weights.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return entries.take(count).map((entry) => entry.key).toList();
  }
}

/// Words that carry no taste signal — filtered out of the profile.
const _stopwords = <String>{
  'the', 'and', 'for', 'with', 'set', 'pack', 'each', 'per', 'off', 'save',
  'now', 'was', 'from', 'your', 'you', 'new', 'sale', 'deal', 'deals', 'only',
  'buy', 'get', 'free', 'plus', 'value', 'piece', 'pieces',
  'size', 'sizes', 'colour', 'color', 'black', 'white', 'assorted',
  'litre', 'litres', 'box', 'bottle', 'can', 'cans',
};

List<String> _tokenize(String text) {
  return text
      .toLowerCase()
      .split(RegExp(r'[^a-z0-9]+'))
      .where((token) =>
          token.length >= 3 &&
          !_stopwords.contains(token) &&
          !RegExp(r'^\d+$').hasMatch(token))
      .toList();
}

class TasteStore {
  static const _key = 'taste_profile_v1';
  static const _maxTokens = 120;
  // Older interests fade a touch each time so recent taste leads.
  static const _decay = 0.985;

  Future<TasteProfile> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(_key);
      if (raw == null || raw.isEmpty) return const TasteProfile.empty();
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return const TasteProfile.empty();
      final weights = <String, double>{};
      decoded.forEach((key, value) {
        if (value is num) weights[key.toString()] = value.toDouble();
      });
      return TasteProfile(weights);
    } catch (_) {
      return const TasteProfile.empty();
    }
  }

  /// Reinforce the profile from something the shopper likes/saves/opens.
  /// [weight] lets a save (strong) count more than a passing view (weak).
  Future<TasteProfile> reinforce({
    required String title,
    String? category,
    double weight = 1.0,
  }) async {
    final current = await load();
    final weights = Map<String, double>.from(current.weights);
    for (final key in weights.keys.toList()) {
      weights[key] = weights[key]! * _decay;
    }
    for (final token in _tokenize('$title ${category ?? ''}')) {
      weights[token] = (weights[token] ?? 0) + weight;
    }
    weights.removeWhere((_, value) => value < 0.08);
    _cap(weights);
    await _save(weights);
    return TasteProfile(weights);
  }

  /// Weaken the profile when a shopper un-saves something.
  Future<TasteProfile> weaken({required String title, String? category}) async {
    final current = await load();
    final weights = Map<String, double>.from(current.weights);
    for (final token in _tokenize('$title ${category ?? ''}')) {
      if (weights.containsKey(token)) {
        weights[token] = weights[token]! - 1.0;
        if (weights[token]! <= 0.08) weights.remove(token);
      }
    }
    await _save(weights);
    return TasteProfile(weights);
  }

  void _cap(Map<String, double> weights) {
    if (weights.length <= _maxTokens) return;
    final sorted = weights.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final kept = Map<String, double>.fromEntries(sorted.take(_maxTokens));
    weights
      ..clear()
      ..addAll(kept);
  }

  Future<void> _save(Map<String, double> weights) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_key, jsonEncode(weights));
    } catch (_) {
      // Best-effort; the profile rebuilds from future interactions.
    }
  }
}
