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
          'documentUrl': 'https://cdn.market.test/catalogue.pdf',
          'imageUrl': 'https://market.test/catalogue.jpg',
          'capturedAt': '2026-07-19T10:00:00.000Z',
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
    expect(result.catalogues.single.capturedAt, '2026-07-19T10:00:00.000Z');
    expect(
        result.catalogues.single.url, 'https://cdn.market.test/catalogue.pdf');
    expect(result.catalogues.single.sourceUrl, 'https://market.test/catalogue');
    final restored = DiscoveryResult.fromJson(result.toJson());
    expect(restored.catalogues.single.url,
        'https://cdn.market.test/catalogue.pdf');
    expect(
        restored.catalogues.single.sourceUrl, 'https://market.test/catalogue');
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

  test('keeps branch promotion savings and validity dates in Near me', () {
    final store = NearbyStore.fromJson({
      'placeId': 'shoprite-branch',
      'name': 'Shoprite Example',
      'lat': -33.9,
      'lon': 18.4,
      'promotions': [
        {
          'id': 'branch-special-1',
          'kind': 'deal',
          'storeName': 'Shoprite Example',
          'retailerId': 'shoprite',
          'title': 'Tait’s Crackers',
          'priceText': 'R16.99',
          'savingText': 'Buy 4 For R20',
          'validFrom': '2026-07-20',
          'validTo': '2026-08-09',
        }
      ],
    });

    expect(store.deals, hasLength(1));
    expect(store.deals.single.retailerName, 'Shoprite Example');
    expect(store.deals.single.priceText, 'R16.99');
    expect(store.deals.single.savingText, 'Buy 4 For R20');
    expect(store.deals.single.validFrom, '2026-07-20');
    expect(store.deals.single.validTo, '2026-08-09');
  });

  test('scroll deals preserve a distinct ordered product gallery', () {
    final deal = ScrollDeal.fromJson({
      'id': 'window-1',
      'title': 'Gallery deal',
      'retailerName': 'Example Store',
      'sourceLabel': 'Example',
      'source': 'example',
      'productUrl': 'https://example.test/products/1',
      'imageUrl': 'https://example.test/images/cover.jpg',
      'images': [
        'https://example.test/images/cover.jpg',
        'https://example.test/images/side.jpg',
        '',
        'https://example.test/images/side.jpg',
      ],
    });

    expect(deal.gallery, [
      'https://example.test/images/cover.jpg',
      'https://example.test/images/side.jpg',
    ]);
    expect(ScrollDeal.fromJson(deal.toJson()).gallery, deal.gallery);
  });

  test('scroll deal gallery falls back to its single cover image', () {
    const deal = ScrollDeal(
      id: 'window-2',
      title: 'Single image deal',
      retailerName: 'Example Store',
      sourceLabel: 'Example',
      source: 'example',
      productUrl: 'https://example.test/products/2',
      imageUrl: 'https://example.test/images/only.jpg',
    );

    expect(deal.gallery, ['https://example.test/images/only.jpg']);
  });
}
