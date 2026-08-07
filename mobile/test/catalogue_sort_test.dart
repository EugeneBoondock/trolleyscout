import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/catalogue_sort.dart';

void main() {
  test('separates current, ending-soon, and upcoming catalogues', () {
    final now = DateTime(2026, 8, 2, 12);
    const catalogues = [
      Catalogue(
        id: 'current',
        name: 'Current',
        url: 'https://example.test/current',
        validFrom: '2026-07-30',
        validTo: '2026-08-20',
      ),
      Catalogue(
        id: 'ending',
        name: 'Ending',
        url: 'https://example.test/ending',
        validFrom: '2026-07-30',
        validTo: '2026-08-03',
      ),
      Catalogue(
        id: 'upcoming',
        name: 'Upcoming',
        url: 'https://example.test/upcoming',
        validFrom: '2026-08-05',
        validTo: '2026-08-18',
      ),
    ];

    expect(
      filterCataloguesByTiming(
        catalogues,
        CatalogueTimingFilter.current,
        now: now,
      ).map((catalogue) => catalogue.id),
      ['current', 'ending'],
    );
    expect(
      filterCataloguesByTiming(
        catalogues,
        CatalogueTimingFilter.endingSoon,
        now: now,
      ).map((catalogue) => catalogue.id),
      ['ending'],
    );
    expect(
      filterCataloguesByTiming(
        catalogues,
        CatalogueTimingFilter.upcoming,
        now: now,
      ).map((catalogue) => catalogue.id),
      ['upcoming'],
    );
  });

  test('orders catalogues by when they landed, newest first', () {
    const catalogues = [
      Catalogue(
        name: 'Old Alpha',
        retailerName: 'Alpha',
        url: 'https://alpha.example/old',
        validFrom: '2026-07-01',
        capturedAt: '2026-07-19T12:00:00.000Z',
      ),
      Catalogue(
        name: 'New Zulu',
        retailerName: 'Zulu',
        url: 'https://zulu.example/new',
        validFrom: '2026-07-19',
        capturedAt: '2026-07-18T12:00:00.000Z',
      ),
      Catalogue(
        name: 'Undated Beta',
        retailerName: 'Beta',
        url: 'https://beta.example/undated',
        capturedAt: '2026-07-17T12:00:00.000Z',
      ),
    ];

    // Old Alpha's specials started three weeks ago, but it reached the app
    // most recently, so that is the one a shopper means by "latest". Sorting
    // on start date instead put it last and let the store name decide the
    // rest of the order.
    expect(
      sortCataloguesMostRecent(catalogues).map((item) => item.name),
      ['Old Alpha', 'New Zulu', 'Undated Beta'],
    );
  });

  test('does not change the source list', () {
    const catalogues = [
      Catalogue(name: 'B', url: 'https://b.example', validFrom: '2026-07-01'),
      Catalogue(name: 'A', url: 'https://a.example', validFrom: '2026-07-02'),
    ];

    sortCataloguesMostRecent(catalogues);

    expect(catalogues.map((item) => item.name), ['B', 'A']);
  });

  test('supports oldest and store-name ordering', () {
    const catalogues = [
      Catalogue(
        name: 'Zulu latest',
        retailerName: 'Zulu',
        url: 'https://zulu.example/latest',
        validFrom: '2026-07-20',
      ),
      Catalogue(
        name: 'Alpha oldest',
        retailerName: 'Alpha',
        url: 'https://alpha.example/oldest',
        validFrom: '2026-07-01',
      ),
      Catalogue(
        name: 'Bravo middle',
        retailerName: 'Bravo',
        url: 'https://bravo.example/middle',
        validFrom: '2026-07-10',
      ),
    ];

    expect(
      sortCatalogues(catalogues, CatalogueSort.oldest).map((item) => item.name),
      ['Alpha oldest', 'Bravo middle', 'Zulu latest'],
    );
    expect(
      sortCatalogues(catalogues, CatalogueSort.store).map((item) => item.name),
      ['Alpha oldest', 'Bravo middle', 'Zulu latest'],
    );
  });

  test('uses capture time when start dates match', () {
    const catalogues = [
      Catalogue(
        name: 'Alpha captured old',
        url: 'https://example.test/old',
        validFrom: '2026-07-18',
        capturedAt: '2026-07-18T08:00:00.000Z',
      ),
      Catalogue(
        name: 'Zulu captured new',
        url: 'https://example.test/new',
        validFrom: '2026-07-18',
        capturedAt: '2026-07-18T12:00:00.000Z',
      ),
    ];

    expect(
      sortCataloguesMostRecent(catalogues).map((item) => item.name),
      ['Zulu captured new', 'Alpha captured old'],
    );
  });

  test('removes catalogues after their last valid day', () {
    const catalogues = [
      Catalogue(
        name: 'Expired',
        url: 'https://example.test/expired.pdf',
        validTo: '2026-07-26',
      ),
      Catalogue(
        name: 'Current',
        url: 'https://example.test/current.pdf',
        validTo: '2026-07-27',
      ),
    ];

    expect(
      sortCataloguesMostRecent(
        catalogues,
        now: DateTime.utc(2026, 7, 27, 12),
      ).map((item) => item.name),
      ['Current'],
    );
  });
}
