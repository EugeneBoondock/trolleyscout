import 'api_models.dart';

const _missingCatalogueTime = -0x7FFFFFFFFFFFFFFF;

int _dateTime(String? value) {
  if (value == null || value.isEmpty) return _missingCatalogueTime;
  return DateTime.tryParse(value)?.millisecondsSinceEpoch ??
      _missingCatalogueTime;
}

List<Catalogue> sortCataloguesMostRecent(Iterable<Catalogue> catalogues) {
  final sorted = catalogues.toList();
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
