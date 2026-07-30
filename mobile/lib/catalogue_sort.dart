import 'api_models.dart';

const _missingCatalogueTime = -9007199254740991;

enum CatalogueSort { latest, oldest, store }

extension CatalogueSortLabel on CatalogueSort {
  String get label => switch (this) {
        CatalogueSort.latest => 'Latest',
        CatalogueSort.oldest => 'Oldest',
        CatalogueSort.store => 'Store name',
      };
}

int _dateTime(String? value) {
  if (value == null || value.isEmpty) return _missingCatalogueTime;
  return DateTime.tryParse(value)?.millisecondsSinceEpoch ??
      _missingCatalogueTime;
}

List<Catalogue> sortCataloguesMostRecent(
  Iterable<Catalogue> catalogues, {
  DateTime? now,
}) =>
    sortCatalogues(catalogues, CatalogueSort.latest, now: now);

List<Catalogue> sortCatalogues(
  Iterable<Catalogue> catalogues,
  CatalogueSort sort, {
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
  sorted.sort((left, right) => switch (sort) {
        CatalogueSort.latest => _compareCatalogueDates(left, right),
        CatalogueSort.oldest => _compareCatalogueDates(right, left),
        CatalogueSort.store => _compareCatalogueStores(left, right),
      });
  return sorted;
}

int _compareCatalogueDates(Catalogue left, Catalogue right) {
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
  return _compareCatalogueStores(left, right);
}

int _compareCatalogueStores(Catalogue left, Catalogue right) {
  final retailerDifference = (left.retailerName ?? left.name)
      .toLowerCase()
      .compareTo((right.retailerName ?? right.name).toLowerCase());
  if (retailerDifference != 0) return retailerDifference;
  final dateDifference = _compareCatalogueDatesWithoutStore(left, right);
  if (dateDifference != 0) return dateDifference;
  return left.name.compareTo(right.name);
}

int _compareCatalogueDatesWithoutStore(Catalogue left, Catalogue right) {
  final leftCaptured = _dateTime(left.capturedAt);
  final rightCaptured = _dateTime(right.capturedAt);
  final leftPrimary = _dateTime(left.validFrom);
  final rightPrimary = _dateTime(right.validFrom);
  final primaryDifference = (rightPrimary == _missingCatalogueTime
          ? rightCaptured
          : rightPrimary)
      .compareTo(
          leftPrimary == _missingCatalogueTime ? leftCaptured : leftPrimary);
  return primaryDifference != 0
      ? primaryDifference
      : rightCaptured.compareTo(leftCaptured);
}
