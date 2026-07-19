import 'api_models.dart';
import 'deal_categories.dart';
import 'price_compare.dart';
import 'taste_profile.dart';

/// How the Find-a-deal list is ordered. `forYou` ranks by the shopper's Window
/// Shopping taste profile; `store` is the original grouping (retailer name, then
/// catalogue page order); the rest are the plain shopper-facing sorts.
enum DealSort {
  forYou,
  store,
  latest,
  mostSaved,
  biggestDiscount,
  priceLowToHigh
}

class DealSortOption {
  const DealSortOption(this.id, this.label);
  final DealSort id;
  final String label;
}

const dealSortOptions = <DealSortOption>[
  DealSortOption(DealSort.forYou, 'For you'),
  DealSortOption(DealSort.store, 'Store order'),
  DealSortOption(DealSort.latest, 'Latest'),
  DealSortOption(DealSort.mostSaved, 'Most saved'),
  DealSortOption(DealSort.biggestDiscount, 'Biggest discount'),
  DealSortOption(DealSort.priceLowToHigh, 'Price: low to high'),
];

/// The rand a deal saves, computed from the marked-down and previous prices,
/// falling back to any amount named in the saving text ("Save R10"). Null when
/// nothing usable is present (e.g. a percentage-only "25% off").
int? dealSavingCents(Deal deal) {
  final price = extractPriceCents(deal.priceText);
  final previous = extractPriceCents(deal.previousPriceText);
  if (price != null && previous != null && previous > price) {
    return previous - price;
  }
  return extractPriceCents(deal.savingText);
}

/// The discount fraction 0..1, from prices when both are present, otherwise a
/// "NN% off" in the saving text. Null when neither is available.
double? dealDiscountFraction(Deal deal) {
  final price = extractPriceCents(deal.priceText);
  final previous = extractPriceCents(deal.previousPriceText);
  if (price != null && previous != null && previous > price && previous > 0) {
    return (previous - price) / previous;
  }
  final percent = RegExp(r'(\d{1,3})\s*%').firstMatch(deal.savingText ?? '');
  if (percent != null) {
    final value = int.tryParse(percent.group(1)!);
    if (value != null && value > 0 && value <= 100) return value / 100;
  }
  return null;
}

/// Returns a new list ordered by [sort]. Deals that lack the value a sort needs
/// (no date, no parseable price/saving) always fall to the end, so the useful
/// results stay on top. `store` order is applied by the caller.
List<Deal> sortDeals(List<Deal> deals, DealSort sort, {TasteProfile? taste}) {
  if (sort == DealSort.store) return deals;

  // "For you": rank by taste score, keeping the original order for ties (a
  // stable decorate-sort so equal/zero scores never shuffle). An empty profile
  // scores everything 0, so the list simply keeps its incoming order.
  if (sort == DealSort.forYou) {
    if (taste == null || taste.isEmpty) return deals;
    final indexed = [
      for (var i = 0; i < deals.length; i++)
        (deal: deals[i], index: i, score: taste.score(deals[i].title))
    ];
    indexed.sort((a, b) {
      final byScore = b.score.compareTo(a.score);
      return byScore != 0 ? byScore : a.index.compareTo(b.index);
    });
    return indexed.map((entry) => entry.deal).toList();
  }

  final sorted = [...deals];

  int byNullableInt(int? a, int? b, {bool descending = true}) {
    if (a == null && b == null) return 0;
    if (a == null) return 1; // nulls last
    if (b == null) return -1;
    return descending ? b.compareTo(a) : a.compareTo(b);
  }

  switch (sort) {
    case DealSort.latest:
      sorted.sort((a, b) {
        final aAt = DateTime.tryParse(a.capturedAt);
        final bAt = DateTime.tryParse(b.capturedAt);
        if (aAt == null && bAt == null) return 0;
        if (aAt == null) return 1;
        if (bAt == null) return -1;
        return bAt.compareTo(aAt);
      });
    case DealSort.mostSaved:
      sorted.sort(
          (a, b) => byNullableInt(dealSavingCents(a), dealSavingCents(b)));
    case DealSort.biggestDiscount:
      sorted.sort((a, b) {
        final da = dealDiscountFraction(a);
        final db = dealDiscountFraction(b);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return db.compareTo(da);
      });
    case DealSort.priceLowToHigh:
      sorted.sort((a, b) => byNullableInt(
          extractPriceCents(a.priceText), extractPriceCents(b.priceText),
          descending: false));
    case DealSort.store:
    case DealSort.forYou:
      break;
  }
  return sorted;
}

List<Deal> filterDeals(
  List<Deal> deals, {
  String query = '',
  String retailerId = 'all',
  String sourceLabel = 'all',
  bool imagesOnly = false,
  bool savingsOnly = false,
  DealCategory? category,
  FoodSubcategory? foodSubcategory,
}) {
  final normalizedQuery = query.trim().toLowerCase();
  return deals.where((deal) {
    final matchesQuery = normalizedQuery.isEmpty ||
        deal.title.toLowerCase().contains(normalizedQuery) ||
        deal.retailerName.toLowerCase().contains(normalizedQuery) ||
        deal.sourceLabel.toLowerCase().contains(normalizedQuery);
    final matchesRetailer =
        retailerId == 'all' || deal.retailerId == retailerId;
    final matchesSource =
        sourceLabel == 'all' || deal.sourceLabel == sourceLabel;
    final matchesImage = !imagesOnly || deal.imageUrl != null;
    final matchesSaving = !savingsOnly ||
        deal.savingText != null ||
        deal.previousPriceText != null;

    var matchesCategory = true;
    if (category != null || foodSubcategory != null) {
      final classification = classifyDeal(
        deal.title,
        deal.retailerId,
        DealClassificationContext(
          evidenceText: deal.evidenceText,
          retailerName: deal.retailerName,
          sourceLabel: deal.sourceLabel,
          sourceUrl: deal.sourceUrl,
        ),
      );
      matchesCategory =
          (category == null || classification.category == category) &&
              (foodSubcategory == null ||
                  classification.foodSubcategory == foodSubcategory);
    }

    return matchesQuery &&
        matchesRetailer &&
        matchesSource &&
        matchesImage &&
        matchesSaving &&
        matchesCategory;
  }).toList();
}
