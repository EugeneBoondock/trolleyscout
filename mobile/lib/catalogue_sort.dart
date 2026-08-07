import 'api_models.dart';

const _missingCatalogueTime = -9007199254740991;

enum CatalogueSort { latest, oldest, store }

enum CatalogueTimingFilter { current, endingSoon, upcoming, all }

enum CatalogueTiming { current, endingSoon, upcoming }

extension CatalogueTimingFilterLabel on CatalogueTimingFilter {
  String get label => switch (this) {
        CatalogueTimingFilter.current => 'Current',
        CatalogueTimingFilter.endingSoon => 'Ending soon',
        CatalogueTimingFilter.upcoming => 'Upcoming',
        CatalogueTimingFilter.all => 'All',
      };

  String get title => switch (this) {
        CatalogueTimingFilter.current => 'Current catalogues',
        CatalogueTimingFilter.endingSoon => 'Catalogues ending soon',
        CatalogueTimingFilter.upcoming => 'Upcoming catalogues',
        CatalogueTimingFilter.all => 'All catalogue dates',
      };
}

CatalogueTiming catalogueTiming(Catalogue catalogue, {DateTime? now}) {
  final today = _dateOnly(now ?? DateTime.now());
  final validFrom = _catalogueDay(catalogue.validFrom);
  if (validFrom != null && validFrom.isAfter(today)) {
    return CatalogueTiming.upcoming;
  }

  final validTo = _catalogueDay(catalogue.validTo);
  if (validTo != null && !validTo.isAfter(today.add(const Duration(days: 3)))) {
    return CatalogueTiming.endingSoon;
  }
  return CatalogueTiming.current;
}

List<Catalogue> filterCataloguesByTiming(
  Iterable<Catalogue> catalogues,
  CatalogueTimingFilter filter, {
  DateTime? now,
}) {
  if (filter == CatalogueTimingFilter.all) return catalogues.toList();
  return catalogues.where((catalogue) {
    final timing = catalogueTiming(catalogue, now: now);
    return filter == CatalogueTimingFilter.current
        ? timing != CatalogueTiming.upcoming
        : timing.name == filter.name;
  }).toList();
}

DateTime _dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

DateTime? _catalogueDay(String? value) {
  final parsed = DateTime.tryParse(value ?? '');
  return parsed == null ? null : _dateOnly(parsed);
}

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

/// Newest first, where "newest" means most recently added to Trolley Scout.
///
/// This used to lead with validFrom, which reads as the right idea and is not:
/// shops start their specials on the same day as each other, so nearly every
/// pair tied on it, tied again on capture time, and fell through to the store
/// name. "Latest" was quietly rendering the alphabet.
///
/// Capture time is what the shopper means. A catalogue that landed in the app
/// an hour ago is the latest one whether its dates start today or last week,
/// and it is the only field that is genuinely distinct per catalogue.
int _compareCatalogueDates(Catalogue left, Catalogue right) {
  final leftCaptured = _dateTime(left.capturedAt);
  final rightCaptured = _dateTime(right.capturedAt);
  final captureDifference = rightCaptured.compareTo(leftCaptured);
  if (captureDifference != 0) return captureDifference;

  // Same moment, or neither was stamped: fall back to when the specials run.
  final leftStart = _dateTime(left.validFrom);
  final rightStart = _dateTime(right.validFrom);
  final startDifference = rightStart.compareTo(leftStart);
  if (startDifference != 0) return startDifference;
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

/// The same newest-first rule, without recursing back into the store name.
int _compareCatalogueDatesWithoutStore(Catalogue left, Catalogue right) {
  final captureDifference =
      _dateTime(right.capturedAt).compareTo(_dateTime(left.capturedAt));
  if (captureDifference != 0) return captureDifference;
  return _dateTime(right.validFrom).compareTo(_dateTime(left.validFrom));
}
