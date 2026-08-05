import 'api_models.dart';
import 'deal_categories.dart';
import 'favourite_stores_store.dart';
import 'retailer_identity.dart';
import 'price_compare.dart';
import 'taste_profile.dart';

/// How the Find-a-deal list is ordered. `forYou` ranks by the shopper's Window
/// Shopping taste profile; `store` is the original grouping (retailer name, then
/// catalogue page order); the rest are the plain shopper-facing sorts.
enum DealSort {
  forYou,
  store,
  newest,
  oldest,
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
  DealSortOption(DealSort.newest, 'Newest first'),
  DealSortOption(DealSort.oldest, 'Oldest first'),
  DealSortOption(DealSort.mostSaved, 'Most saved'),
  DealSortOption(DealSort.biggestDiscount, 'Biggest discount'),
  DealSortOption(DealSort.priceLowToHigh, 'Price: low to high'),
];

class DealClassificationCache {
  final Map<String, _CachedDealClassification> _byId = {};

  DealClassification classify(Deal deal) {
    final signature = Object.hash(
      deal.title,
      deal.retailerId,
      deal.retailerName,
      deal.sourceLabel,
      deal.sourceUrl,
      deal.evidenceText,
    );
    final cached = _byId[deal.id];
    if (cached?.signature == signature) return cached!.classification;

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
    if (_byId.length >= 20000) _byId.clear();
    _byId[deal.id] = _CachedDealClassification(signature, classification);
    return classification;
  }
}

class _CachedDealClassification {
  const _CachedDealClassification(this.signature, this.classification);

  final int signature;
  final DealClassification classification;
}

/// When a deal first appeared to us, which is what a shopper means by newest.
///
/// `capturedAt` is restamped every time a source is rescanned, so ordering by
/// it put a fortnight-old shelf price above something listed this morning.
/// `addedAt` is the first sighting and only falls back when an older row
/// predates that column.
DateTime? dealFirstSeenAt(Deal deal) {
  final added =
      deal.addedAt.isNotEmpty ? DateTime.tryParse(deal.addedAt) : null;
  return added ?? DateTime.tryParse(deal.capturedAt);
}

/// An auction listing rather than a price. BobShop runs English auctions and
/// marks them "Current bid", so what looks like a bargain is an opening bid
/// that climbs until the auction closes.
bool isBidDeal(Deal deal) {
  final qualifier = deal.unitText;
  if (qualifier == null || qualifier.isEmpty) return false;
  return qualifier.toLowerCase().contains('bid');
}

bool isDealFromFavouriteStores(
  Deal deal,
  Iterable<FavouriteStore> favourites,
) {
  final canonical = canonicalRetailerId(deal.retailerId, deal.retailerName);
  final name = retailerNameKey(deal.retailerName);
  return favourites.any((favourite) =>
      favourite.id.toLowerCase() == 'retailer:$canonical' ||
      favourite.id.toLowerCase() == canonical ||
      retailerNameKey(favourite.displayName) == name);
}

/// The rand a deal saves, computed from the marked-down and previous prices,
/// falling back to an amount the saving text names as a saving ("Save R10").
/// Null when nothing usable is present (e.g. a percentage-only "25% off").
int? dealSavingCents(Deal deal) {
  final price = extractPriceCents(deal.priceText);
  final previous = extractPriceCents(deal.previousPriceText);
  if (price != null && previous != null && previous > price) {
    return previous - price;
  }
  return _savingNamedIn(deal.savingText);
}

/// The discount fraction 0..1, from prices when both are present, otherwise a
/// percentage the saving text says comes off. Null when neither is available.
double? dealDiscountFraction(Deal deal) {
  final price = extractPriceCents(deal.priceText);
  final previous = extractPriceCents(deal.previousPriceText);
  if (price != null && previous != null && previous > price && previous > 0) {
    return (previous - price) / previous;
  }
  return _percentOffIn(deal.savingText);
}

/// A rand amount only counts as a saving when the text says it is one.
///
/// Reading any rand figure out of the offer put a bottle of juice at the top of
/// "Most saved": Woolworths writes "Buy Any 2 For R120 100% Fruit Juice", and
/// R120 is what two of them cost together, not what anybody saves.
int? _savingNamedIn(String? text) {
  if (text == null || text.isEmpty) return null;

  final match =
      RegExp(r'\bsaves?\s*R\s*(\d+(?:[.,]\d{1,2})?)', caseSensitive: false)
          .firstMatch(text);
  if (match == null) return null;

  final rands = double.tryParse(match.group(1)!.replaceAll(',', '.'));
  if (rands == null || rands <= 0) return null;
  return (rands * 100).round();
}

/// A percentage only counts when the text says it comes off.
///
/// "100% Fruit Juice" describes the juice, and taking any number before a
/// percent sign sorted every one of them above a genuine half-price rail.
double? _percentOffIn(String? text) {
  if (text == null || text.isEmpty) return null;

  final claimed = RegExp(r'(\d{1,3})\s*%\s*(?:off|discount)\b',
              caseSensitive: false)
          .firstMatch(text) ??
      RegExp(r'\bsaves?\s*(?:up\s*to\s*)?(\d{1,3})\s*%', caseSensitive: false)
          .firstMatch(text);
  if (claimed == null) return null;

  final value = int.tryParse(claimed.group(1)!);
  if (value == null || value <= 0 || value > 100) return null;
  return value / 100;
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
        (
          deal: deals[i],
          index: i,
          score: taste.score(
            deals[i].title,
            category: deals[i].retailerName,
          ),
        )
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

  int byIdentity(Deal a, Deal b) {
    final byId = a.id.toLowerCase().compareTo(b.id.toLowerCase());
    if (byId != 0) return byId;
    final byRetailer =
        a.retailerName.toLowerCase().compareTo(b.retailerName.toLowerCase());
    if (byRetailer != 0) return byRetailer;
    return a.title.toLowerCase().compareTo(b.title.toLowerCase());
  }

  switch (sort) {
    case DealSort.newest:
    case DealSort.oldest:
      final newestFirst = sort == DealSort.newest;
      sorted.sort((a, b) {
        final aAt = dealFirstSeenAt(a);
        final bAt = dealFirstSeenAt(b);
        if (aAt == null && bAt == null) return byIdentity(a, b);
        // A deal with no date is never the newest or the oldest — it goes
        // last either way rather than winning by absence.
        if (aAt == null) return 1;
        if (bAt == null) return -1;
        final byTime = newestFirst ? bAt.compareTo(aAt) : aAt.compareTo(bAt);
        return byTime != 0 ? byTime : byIdentity(a, b);
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
  bool hideSoldOut = false,
  bool hideBids = false,
  DealCategory? category,
  FoodSubcategory? foodSubcategory,
  DealClassificationCache? classificationCache,
}) {
  final normalizedQuery = query.trim().toLowerCase();
  return deals.where((deal) {
    final matchesQuery = normalizedQuery.isEmpty ||
        deal.title.toLowerCase().contains(normalizedQuery) ||
        deal.retailerName.toLowerCase().contains(normalizedQuery) ||
        deal.sourceLabel.toLowerCase().contains(normalizedQuery);
    final matchesRetailer = retailerId == 'all' ||
        canonicalRetailerId(deal.retailerId, deal.retailerName) == retailerId;
    final matchesSource =
        sourceLabel == 'all' || deal.sourceLabel == sourceLabel;
    final matchesImage = !imagesOnly || deal.imageUrl != null;
    final matchesSaving = !savingsOnly ||
        deal.savingText != null ||
        deal.previousPriceText != null;
    final matchesAvailability = !hideSoldOut || !deal.soldOut;
    final matchesBidPreference = !hideBids || !isBidDeal(deal);

    var matchesCategory = true;
    if (category != null || foodSubcategory != null) {
      final classification = classificationCache?.classify(deal) ??
          classifyDeal(
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
        matchesAvailability &&
        matchesBidPreference &&
        matchesCategory;
  }).toList();
}
