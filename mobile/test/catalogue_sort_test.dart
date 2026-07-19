import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/catalogue_sort.dart';

void main() {
  test('orders catalogues by start date and then capture time', () {
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

    expect(
      sortCataloguesMostRecent(catalogues).map((item) => item.name),
      ['New Zulu', 'Undated Beta', 'Old Alpha'],
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
}
