import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/deal_categories.dart';
import 'package:trolley_scout/deal_filters.dart';
import 'package:trolley_scout/favourite_stores_store.dart';

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

  test('matches favourite store groups and legacy store names', () {
    const shopriteFavourite = FavouriteStore(
      id: 'retailer:shoprite',
      displayName: 'Shoprite',
      savedAt: 1,
    );
    const localFavourite = FavouriteStore(
      id: 'name:local-market',
      displayName: 'Local Market',
      savedAt: 1,
    );

    expect(
      deals
          .where((deal) =>
              isDealFromFavouriteStores(deal, const [shopriteFavourite]))
          .map((deal) => deal.id),
      ['two'],
    );
    expect(
      deals
          .where(
              (deal) => isDealFromFavouriteStores(deal, const [localFavourite]))
          .map((deal) => deal.id),
      ['one', 'three'],
    );
  });

  test('uses source metadata when a title has no product signal', () {
    expect(
      filterDeals(deals, category: DealCategory.food).map((deal) => deal.id),
      contains('three'),
    );
  });

  test('filters a full marketplace feed by clothing without blocking', () {
    final largeFeed = List<Deal>.generate(
      12000,
      (index) => Deal(
        id: 'large-$index',
        title: switch (index % 3) {
          0 => 'Men’s cotton T-shirt $index',
          1 => 'Long-life milk 1L $index',
          _ => 'Cordless drill kit $index',
        },
        retailerId: 'market-$index',
        retailerName: 'Market $index',
        sourceLabel: 'Weekly specials',
      ),
    );
    // Warm the classifier first: a real category tap happens long after the
    // app has classified its first titles, so JIT compilation of the keyword
    // scan must not count against the responsiveness budget.
    filterDeals(
      largeFeed.take(200).toList(),
      category: DealCategory.clothing,
      classificationCache: DealClassificationCache(),
    );
    final watch = Stopwatch()..start();

    final clothing = filterDeals(
      largeFeed,
      category: DealCategory.clothing,
      classificationCache: DealClassificationCache(),
    );
    watch.stop();

    expect(clothing, hasLength(4000));
    expect(
      watch.elapsed,
      lessThan(const Duration(seconds: 1)),
      reason: 'A category tap must stay responsive on a 12,000-deal feed.',
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

  test('hides auction listings when the shopper does not want bids', () {
    // BobShop labels English auctions "Current bid", so the figure shown is an
    // opening bid that climbs, not a price anyone can pay today.
    const mixed = [
      Deal(id: 'plain-camera', title: 'Camera', retailerName: 'Takealot'),
      Deal(
        id: 'camera-auction',
        title: 'Camera auction',
        retailerName: 'BobShop',
        unitText: 'Current bid',
      ),
    ];

    expect(
      filterDeals(mixed, hideBids: true).map((deal) => deal.id),
      ['plain-camera'],
    );
    expect(
      filterDeals(mixed).map((deal) => deal.id),
      ['plain-camera', 'camera-auction'],
    );
  });

  test('orders by first sighting, not by when a source was last rescanned', () {
    // capturedAt is restamped on every rescan, so ordering by it put a
    // fortnight-old shelf price above something listed this morning.
    const dated = [
      Deal(
        id: 'old-but-rescanned',
        title: 'Rice 2kg',
        retailerName: 'Local Market',
        addedAt: '2026-07-20T08:00:00.000Z',
        capturedAt: '2026-07-31T08:00:00.000Z',
      ),
      Deal(
        id: 'genuinely-new',
        title: 'Milk 2L',
        retailerName: 'Shoprite',
        addedAt: '2026-07-29T08:00:00.000Z',
        capturedAt: '2026-07-29T08:00:00.000Z',
      ),
    ];

    expect(
      sortDeals(dated, DealSort.newest).map((deal) => deal.id),
      ['genuinely-new', 'old-but-rescanned'],
    );
    expect(
      sortDeals(dated, DealSort.oldest).map((deal) => deal.id),
      ['old-but-rescanned', 'genuinely-new'],
    );
  });

  test('sends undated deals to the end of both date sorts', () {
    const mixed = [
      Deal(id: 'undated', title: 'Bread', retailerName: 'Local Market'),
      Deal(
        id: 'dated',
        title: 'Milk',
        retailerName: 'Shoprite',
        addedAt: '2026-07-29T08:00:00.000Z',
      ),
    ];

    expect(sortDeals(mixed, DealSort.newest).last.id, 'undated');
    expect(sortDeals(mixed, DealSort.oldest).last.id, 'undated');
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
