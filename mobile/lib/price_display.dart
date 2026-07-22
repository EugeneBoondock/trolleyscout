// A "was" price only means something when it is a real number above the
// current price. Feeds sometimes emit R0.00 (their "no previous price"
// marker) and showing "R10.99, was R0.00" reads as a broken deal.
String? meaningfulWasPrice(String? wasText, String? priceText) {
  final was = _randToCents(wasText);
  if (was == null || was <= 0) return null;
  final price = _randToCents(priceText);
  if (price != null && was <= price) return null;
  return wasText;
}

int? _randToCents(String? value) {
  if (value == null) return null;
  final match = RegExp(r'(\d+(?:[.,]\d{1,2})?)').firstMatch(value.replaceAll(' ', ''));
  if (match == null) return null;
  final amount = double.tryParse(match.group(1)!.replaceAll(',', '.'));
  return amount == null ? null : (amount * 100).round();
}
