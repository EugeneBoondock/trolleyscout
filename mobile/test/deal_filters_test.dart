import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/deal_categories.dart';
import 'package:trolley_scout/deal_filters.dart';

void main() {
  const deals = [
    Deal(
      id: 'one',
      title: 'Rice 2kg',
      retailerId: 'local',
      retailerName: 'Local Market',
      sourceLabel: 'Store scout',
      imageUrl: 'https://market.test/rice.jpg',
      savingText: 'Save R10',
    ),
    Deal(
      id: 'two',
      title: 'Milk 2L',
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceLabel: 'Weekly specials',
    ),
    Deal(
      id: 'three',
      title: 'Weekly value pack',
      retailerId: 'local',
      retailerName: 'Local Market',
      sourceLabel: 'Food and grocery specials',
      sourceUrl: 'https://market.test/groceries',
      evidenceText: 'Weekly value pack',
    ),
  ];

  test('filters deals by text, retailer, source, image, and savings', () {
    expect(filterDeals(deals, query: 'rice').map((deal) => deal.id), ['one']);
    expect(filterDeals(deals, retailerId: 'shoprite').map((deal) => deal.id),
        ['two']);
    expect(
        filterDeals(deals, sourceLabel: 'Store scout').map((deal) => deal.id),
        ['one']);
    expect(
        filterDeals(deals, imagesOnly: true).map((deal) => deal.id), ['one']);
    expect(
        filterDeals(deals, savingsOnly: true).map((deal) => deal.id), ['one']);
  });

  test('uses source metadata when a title has no product signal', () {
    expect(
      filterDeals(deals, category: DealCategory.food).map((deal) => deal.id),
      contains('three'),
    );
  });

  test('hides only deals explicitly marked sold out', () {
    const availabilityDeals = [
      Deal(
        id: 'available',
        title: 'Available shoe',
        retailerName: 'Bathu',
      ),
      Deal(
        id: 'sold-out',
        title: 'Sold-out shoe',
        retailerName: 'Bathu',
        soldOut: true,
      ),
    ];

    expect(
      filterDeals(availabilityDeals, hideSoldOut: true).map((deal) => deal.id),
      ['available'],
    );
  });

  test('filters branch and parent feed labels through the canonical store', () {
    const aliasedDeals = [
      Deal(
        id: 'usave-one',
        title: 'Maize meal',
        retailerId: 'shoprite',
        retailerName: 'Shoprite Usave',
        sourceLabel: 'Weekly specials',
      ),
      Deal(
        id: 'spar-one',
        title: 'Fresh milk',
        retailerId: 'store-online:za:greenfields-spar.test',
        retailerName: 'KwikSpar',
        sourceLabel: 'Store scout',
      ),
    ];

    expect(
      filterDeals(aliasedDeals, retailerId: 'usave').map((deal) => deal.id),
      ['usave-one'],
    );
    expect(
      filterDeals(aliasedDeals, retailerId: 'spar').map((deal) => deal.id),
      ['spar-one'],
    );
  });
}
