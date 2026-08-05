import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/store_grouping.dart';

void main() {
  test('store groups use the same Boxer content counts as Marketplace', () {
    final groups = groupNearbyStores(
      const [
        NearbyStore(
          placeId: 'boxer-soweto',
          name: 'Boxer Soweto',
          retailerId: 'boxer',
          detailsLoaded: false,
        ),
      ],
      marketplaceDeals: const [
        Deal(
          id: 'boxer-rice',
          retailerId: 'boxer',
          retailerName: 'Boxer',
          title: 'Rice 10 kg',
        ),
      ],
      marketplaceCatalogues: const [
        Catalogue(
          id: 'boxer-weekly',
          retailerId: 'boxer',
          retailerName: 'Boxer',
          name: 'Weekly catalogue',
          url: 'https://example.test/boxer-weekly',
        ),
        Catalogue(
          id: 'boxer-month-end',
          retailerId: 'boxer',
          retailerName: 'Boxer',
          name: 'Month-end catalogue',
          url: 'https://example.test/boxer-month-end',
        ),
      ],
    );

    expect(groups.single.dealCount, 1);
    expect(groups.single.catalogueCount, 2);
    expect(groups.single.offerCount, 3);
  });

  test('store groups do not double count repeated marketplace content', () {
    const catalogue = Catalogue(
      id: 'boxer-weekly',
      retailerId: 'boxer',
      retailerName: 'Boxer',
      name: 'Weekly catalogue',
      url: 'https://example.test/boxer-weekly',
    );
    final group = groupNearbyStores(
      const [
        NearbyStore(
          placeId: 'boxer-soweto',
          name: 'Boxer Soweto',
          retailerId: 'boxer',
        ),
      ],
      marketplaceCatalogues: const [catalogue, catalogue],
    ).single;

    expect(group.catalogueCount, 1);
  });
}
