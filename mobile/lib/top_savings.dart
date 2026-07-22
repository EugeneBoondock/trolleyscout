// Picks the deals with the largest real rand saving for the dashboard's
// "today's top savings" strip — the fastest possible answer to "is there
// anything worth opening the app for today?".
import 'api_models.dart';
import 'price_display.dart';

List<Deal> topSavingsDeals(List<Deal> deals, {int limit = 3}) {
  final ranked = deals
      .map((deal) => (deal: deal, savingCents: _savedCents(deal)))
      .where((entry) => entry.savingCents > 0)
      .toList()
    ..sort((left, right) => right.savingCents.compareTo(left.savingCents));
  return ranked.take(limit < 0 ? 0 : limit).map((entry) => entry.deal).toList();
}

int _savedCents(Deal deal) {
  final wasText = meaningfulWasPrice(deal.previousPriceText, deal.priceText);
  final was = randCents(wasText);
  final price = randCents(deal.priceText);
  if (was == null || price == null) return 0;
  return was - price;
}

int? randCents(String? value) {
  if (value == null) return null;
  final match =
      RegExp(r'(\d+(?:[.,]\d{1,2})?)').firstMatch(value.replaceAll(' ', ''));
  if (match == null) return null;
  final amount = double.tryParse(match.group(1)!.replaceAll(',', '.'));
  return amount == null ? null : (amount * 100).round();
}
