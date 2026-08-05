import 'dart:collection';

import 'api_models.dart';
import 'deal_categories.dart';

const _stopWords = {
  'all',
  'and',
  'any',
  'deal',
  'each',
  'for',
  'from',
  'offer',
  'only',
  'pack',
  'save',
  'special',
  'the',
  'this',
  'value',
  'with',
};

List<Deal> findSimilarDeals(
  Deal target,
  List<Deal> candidates, {
  int limit = 4,
}) =>
    SimilarDealsIndex(candidates).find(target, limit: limit);

/// Prepares searchable product details once for a Marketplace result.
///
/// The live feed can contain 2,000 deals. Reclassifying every candidate for
/// every visible card blocks lower-memory Android devices during route entry.
class SimilarDealsIndex {
  SimilarDealsIndex(List<Deal> deals)
      : _entries = [
          for (var index = 0; index < deals.length; index += 1)
            _IndexedDeal.from(deals[index], index),
        ];

  final List<_IndexedDeal> _entries;
  late final Map<Deal, _IndexedDeal> _byIdentity = HashMap.identity()
    ..addEntries(_entries.map((entry) => MapEntry(entry.deal, entry)));

  int get indexedDealCount => _entries.length;

  List<Deal> find(Deal target, {int limit = 4}) {
    if (limit <= 0) return const [];
    final targetEntry = _byIdentity[target] ?? _IndexedDeal.from(target, -1);
    final ranked = <({Deal deal, int index, int score})>[];

    for (final entry in _entries) {
      final candidate = entry.deal;
      if (candidate.id == target.id || candidate.soldOut) continue;

      final sharedTokens = targetEntry.tokens.intersection(entry.tokens).length;
      final sameSubcategory =
          targetEntry.classification.foodSubcategory != null &&
              targetEntry.classification.foodSubcategory ==
                  entry.classification.foodSubcategory;
      if (sharedTokens == 0 && !sameSubcategory) continue;

      final candidateRank = (
        deal: candidate,
        index: entry.index,
        score: sharedTokens * 5 +
            (sameSubcategory ? 4 : 0) +
            (targetEntry.classification.category ==
                    entry.classification.category
                ? 1
                : 0) +
            (target.retailerId != candidate.retailerId ? 1 : 0),
      );
      final insertAt = ranked.indexWhere(
        (existing) => _compareRank(candidateRank, existing) < 0,
      );
      if (insertAt == -1) {
        if (ranked.length < limit) ranked.add(candidateRank);
      } else {
        ranked.insert(insertAt, candidateRank);
        if (ranked.length > limit) ranked.removeLast();
      }
    }

    return ranked.map((entry) => entry.deal).toList();
  }
}

int _compareRank(
  ({Deal deal, int index, int score}) left,
  ({Deal deal, int index, int score}) right,
) {
  final scoreOrder = right.score.compareTo(left.score);
  return scoreOrder != 0 ? scoreOrder : left.index.compareTo(right.index);
}

class _IndexedDeal {
  const _IndexedDeal({
    required this.deal,
    required this.index,
    required this.tokens,
    required this.classification,
  });

  factory _IndexedDeal.from(Deal deal, int index) => _IndexedDeal(
        deal: deal,
        index: index,
        tokens: _productTokens(deal.title),
        classification: _classification(deal),
      );

  final Deal deal;
  final int index;
  final Set<String> tokens;
  final DealClassification classification;
}

DealClassification _classification(Deal deal) => classifyDeal(
      deal.title,
      deal.retailerId,
      DealClassificationContext(
        evidenceText: deal.evidenceText,
        retailerName: deal.retailerName,
        sourceLabel: deal.sourceLabel,
        sourceUrl: deal.sourceUrl,
      ),
    );

Set<String> _productTokens(String value) => value
    .toLowerCase()
    .replaceAll(RegExp('[^a-z0-9]+'), ' ')
    .trim()
    .split(RegExp(r'\s+'))
    .where((token) => token.length >= 3 && !_stopWords.contains(token))
    .toSet();
