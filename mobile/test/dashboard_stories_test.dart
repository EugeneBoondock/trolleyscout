import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/dashboard_stories.dart';

void main() {
  test('puts catalogue pages before retailer deals', () {
    final stories = buildDashboardStories(
      catalogues: const [
        Catalogue(
          name: 'Weekly catalogue',
          url: 'https://retailer.test/catalogue',
          retailerName: 'Pick n Pay',
          pages: [
            CataloguePage(
              pageNumber: 1,
              imageUrl: 'https://images.test/page-1.webp',
            ),
            CataloguePage(
              pageNumber: 2,
              imageUrl: 'https://images.test/page-2.webp',
            ),
          ],
        ),
      ],
      deals: const [
        Deal(
          id: 'coffee',
          retailerId: 'pick-n-pay',
          retailerName: 'Pick n Pay',
          title: 'Coffee 200g',
          imageUrl: 'https://images.test/coffee.png',
          productUrl: 'https://retailer.test/coffee',
          priceText: 'R79.99',
        ),
      ],
      retailers: const [
        Retailer(
          id: 'pick-n-pay',
          name: 'Pick n Pay',
          shortName: 'PnP',
          group: 'Supermarket',
          program: 'Smart Shopper',
          sourceNote: 'Official sources',
          verifiedOn: '2026-07-26',
          accentColor: '#d71920',
          logoUrl: 'https://images.test/pnp-logo.png',
          sources: [],
        ),
      ],
    );

    expect(stories, hasLength(1));
    expect(stories.first.logoUrl, 'https://images.test/pnp-logo.png');
    expect(
      stories.first.frames.map((frame) => frame.kind),
      [
        DashboardStoryFrameKind.catalogue,
        DashboardStoryFrameKind.catalogue,
        DashboardStoryFrameKind.deal
      ],
    );
    final frames =
        stories.first.frames.map((frame) => frame.imageUrl).toList();
    // Catalogue pages stay full size — they are leaflet scans the shopper
    // pinches into. The product photo behind them is resized for the card.
    expect(frames[0], 'https://images.test/page-1.webp');
    expect(frames[1], 'https://images.test/page-2.webp');
    expect(frames[2], contains('https://images.test/coffee.png'));
    expect(frames[2], contains('/cdn-cgi/image/'));
  });

  test('matches catalogue artwork by retailer id when display names differ',
      () {
    final stories = buildDashboardStories(
      catalogues: const [
        Catalogue(
          name: 'Weekend offers',
          url: 'https://retailer.test/weekend',
          retailerId: 'food-lovers-market',
          retailerName: 'Food Lover\'s Market Western Cape',
          imageUrl: 'https://images.test/weekend.webp',
        ),
      ],
      deals: const [],
      retailers: const [
        Retailer(
          id: 'food-lovers-market',
          name: 'Food Lover\'s Market',
          shortName: 'Food Lover\'s',
          group: 'Supermarket',
          program: 'FreshStop Rewards',
          sourceNote: 'Official sources',
          verifiedOn: '2026-08-02',
          accentColor: '#4c8c2b',
          logoUrl: 'https://images.test/food-lovers-logo.png',
          sources: [],
        ),
      ],
    );

    expect(stories, hasLength(1));
    expect(stories.first.id, 'food-lovers-market');
    expect(stories.first.retailerName, 'Food Lover\'s Market');
    expect(stories.first.logoUrl, 'https://images.test/food-lovers-logo.png');
  });
}
