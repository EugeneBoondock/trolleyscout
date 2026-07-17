import 'api_models.dart';

List<Deal> filterDeals(
  List<Deal> deals, {
  String query = '',
  String retailerId = 'all',
  String sourceLabel = 'all',
  bool imagesOnly = false,
  bool savingsOnly = false,
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
    return matchesQuery &&
        matchesRetailer &&
        matchesSource &&
        matchesImage &&
        matchesSaving;
  }).toList();
}
