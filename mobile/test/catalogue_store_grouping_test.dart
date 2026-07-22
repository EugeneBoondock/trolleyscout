import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/store_grouping.dart';

void main() {
  group('catalogue pages', () {
    test('parses page dimensions and ordered image fallbacks', () {
      final catalogue = Catalogue.fromLeaflet({
        'name': 'Winter savings',
        'url': 'https://catalogues.example.test/winter',
        'pages': [
          {
            'pageNumber': 2,
            'imageUrl': 'https://cdn.example.test/page-2.webp',
            'width': 1350,
            'height': 1909,
            'fallbacks': [
              'https://cdn.example.test/page-2.jpg',
              'https://cdn.example.test/page-2-large.webp',
            ],
          },
        ],
      });

      final page = catalogue.pages.single;
      expect(page.pageNumber, 2);
      expect(page.width, 1350);
      expect(page.height, 1909);
      expect(page.imageUrls, [
        'https://cdn.example.test/page-2.webp',
        'https://cdn.example.test/page-2.jpg',
        'https://cdn.example.test/page-2-large.webp',
      ]);
      expect(catalogue.toJson()['pages'], [
        {
          'pageNumber': 2,
          'imageUrl': 'https://cdn.example.test/page-2.webp',
          'width': 1350,
          'height': 1909,
          'fallbacks': [
            'https://cdn.example.test/page-2.jpg',
            'https://cdn.example.test/page-2-large.webp',
          ],
        },
      ]);
    });

    test('recognises a direct PDF even when its URL has a query', () {
      const catalogue = Catalogue(
        name: 'Weekly PDF',
        url: 'https://market.example.test/weekly.pdf?download=1',
      );

      expect(catalogue.isDirectPdf, isTrue);
    });
  });

  group('store grouping', () {
    test('groups known chain branches only by retailer id', () {
      final groups = groupNearbyStores(const [
        NearbyStore(
          placeId: 'pnp-rosebank',
          name: 'Pick n Pay Rosebank',
          retailerId: 'pick-n-pay',
          website: 'https://www.pnp.co.za/rosebank',
          deals: [
            Deal(
              title: 'Milk',
              retailerName: 'Pick n Pay Rosebank',
              priceText: 'R20.00',
            ),
          ],
        ),
        NearbyStore(
          placeId: 'pnp-sandton',
          name: 'PnP Sandton',
          retailerId: 'pick-n-pay',
          website: 'https://different-host.example.test',
          deals: [
            Deal(
              title: 'Milk',
              retailerName: 'PnP Sandton',
              priceText: 'R23.00',
            ),
          ],
        ),
      ]);

      expect(groups, hasLength(1));
      expect(groups.single.displayName, 'Pick n Pay');
      expect(groups.single.branches, hasLength(2));
      expect(groups.single.branches[0].deals.single.priceText, 'R20.00');
      expect(groups.single.branches[1].deals.single.priceText, 'R23.00');
      expect(groups.single.nearestDistanceM, isNull);
    });

    test('reports the nearest known branch distance for the store card', () {
      const group = StoreGroup(
        id: 'retailer:test',
        displayName: 'Test',
        branches: [
          NearbyStore(placeId: 'far', name: 'Far', distanceM: 4200),
          NearbyStore(placeId: 'unknown', name: 'Unknown'),
          NearbyStore(placeId: 'near', name: 'Near', distanceM: 850),
        ],
      );

      expect(group.nearestDistanceM, 850);
    });

    test('groups unknown stores by a verified host', () {
      final groups = groupNearbyStores(const [
        NearbyStore(
          placeId: 'local-1',
          name: 'Local Market Rosebank',
          website: 'https://www.localmarket.co.za/rosebank',
        ),
        NearbyStore(
          placeId: 'local-2',
          name: 'Local Market Sandton',
          website: 'https://localmarket.co.za/sandton',
        ),
      ]);

      expect(groups, hasLength(1));
      expect(groups.single.branches, hasLength(2));
    });

    test('uses exact normalised brand when an unknown host is unavailable', () {
      final groups = groupNearbyStores(const [
        NearbyStore(placeId: 'one', name: '  Family   Foods '),
        NearbyStore(placeId: 'two', name: 'family foods'),
        NearbyStore(placeId: 'three', name: 'Family Foods Sandton'),
        NearbyStore(
          placeId: 'four',
          name: 'Family Foods',
          website: 'javascript:alert(1)',
        ),
      ]);

      expect(groups, hasLength(2));
      expect(
        groups.singleWhere((group) => group.branches.length == 3).branches,
        hasLength(3),
      );
      expect(
        groups
            .singleWhere((group) => group.branches.length == 1)
            .branches
            .single
            .name,
        'Family Foods Sandton',
      );
    });

    test('keeps different known retailer ids separate on the same host', () {
      final groups = groupNearbyStores(const [
        NearbyStore(
          placeId: 'shoprite',
          name: 'Shoprite',
          retailerId: 'shoprite',
          website: 'https://stores.example.test/shoprite',
        ),
        NearbyStore(
          placeId: 'checkers',
          name: 'Checkers',
          retailerId: 'checkers',
          website: 'https://stores.example.test/checkers',
        ),
      ]);

      expect(groups, hasLength(2));
    });
  });
}
