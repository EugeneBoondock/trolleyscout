import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';

void main() {
  test('parses full discovery catalogues and image fields', () {
    final result = DiscoveryResult.fromJson({
      'deals': [
        {
          'id': 'deal-1',
          'title': 'Rice 2kg',
          'retailerName': 'Local Market',
          'imageUrl': 'https://market.test/rice.jpg',
        }
      ],
      'leaflets': [
        {
          'name': 'Weekly catalogue',
          'retailerName': 'Local Market',
          'url': 'https://market.test/catalogue',
          'imageUrl': 'https://market.test/catalogue.jpg',
          'validFrom': '2026-07-16',
          'validTo': '2026-07-31',
        }
      ],
      'refreshedAt': '2026-07-16T10:00:00.000Z',
      'summary': {
        'foundDealCount': 1,
        'checkedSourceCount': 1,
        'unavailableSourceCount': 0,
        'leafletCount': 1,
      },
    });

    expect(result.deals.single.imageUrl, 'https://market.test/rice.jpg');
    expect(
        result.catalogues.single.imageUrl, 'https://market.test/catalogue.jpg');
    expect(result.catalogues.single.retailerName, 'Local Market');
    expect(result.refreshedAt, '2026-07-16T10:00:00.000Z');
  });

  test('parses store logos, discovery metadata, and offer images', () {
    final store = NearbyStore.fromJson({
      'placeId': 'store-1',
      'name': 'Local Market',
      'lat': -26.1,
      'lon': 28.05,
      'logoUrl': 'https://market.test/favicon.ico',
      'firstSeenAt': '2026-07-01T10:00:00.000Z',
      'lastSeenAt': '2026-07-16T10:00:00.000Z',
      'promotionCount': 3,
    });
    final offer = VerifiedOffer.fromJson({
      'id': 'offer-1',
      'retailerId': 'shoprite',
      'title': 'Milk 2L',
      'sourceUrl': 'https://shop.test/milk',
      'capturedAt': '2026-07-16T10:00:00.000Z',
      'imageUrl': 'https://shop.test/milk.jpg',
    });

    expect(store.logoUrl, 'https://market.test/favicon.ico');
    expect(store.firstSeenAt, '2026-07-01T10:00:00.000Z');
    expect(store.lastSeenAt, '2026-07-16T10:00:00.000Z');
    expect(store.promotionCount, 3);
    expect(offer.imageUrl, 'https://shop.test/milk.jpg');
  });
}
