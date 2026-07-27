import 'api_models.dart';

const _missingCatalogueTime = -9007199254740991;

int _dateTime(String? value) {
  if (value == null || value.isEmpty) return _missingCatalogueTime;
  return DateTime.tryParse(value)?.millisecondsSinceEpoch ??
      _missingCatalogueTime;
}

List<Catalogue> sortCataloguesMostRecent(
  Iterable<Catalogue> catalogues, {
  DateTime? now,
}) {
  final today = now ?? DateTime.now();
  final sorted = catalogues.where((catalogue) {
    final validTo = DateTime.tryParse(catalogue.validTo ?? '');
    if (validTo == null) return true;
    final endOfDay = DateTime(
      validTo.year,
      validTo.month,
      validTo.day,
      23,
      59,
      59,
      999,
    );
    return !endOfDay.isBefore(today);
  }).toList();
  sorted.sort((left, right) {
    final leftCaptured = _dateTime(left.capturedAt);
    final rightCaptured = _dateTime(right.capturedAt);
    final leftPrimary = _dateTime(left.validFrom);
    final rightPrimary = _dateTime(right.validFrom);
    final primaryDifference = (rightPrimary == _missingCatalogueTime
            ? rightCaptured
            : rightPrimary)
        .compareTo(
            leftPrimary == _missingCatalogueTime ? leftCaptured : leftPrimary);
    if (primaryDifference != 0) return primaryDifference;

    final captureDifference = rightCaptured.compareTo(leftCaptured);
    if (captureDifference != 0) return captureDifference;

    final retailerDifference = (left.retailerName ?? left.name)
        .compareTo(right.retailerName ?? right.name);
    if (retailerDifference != 0) return retailerDifference;
    return left.name.compareTo(right.name);
  });
  return sorted;
}
