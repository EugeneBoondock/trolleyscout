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
    expect(
      stories.first.frames.map((frame) => frame.imageUrl),
      [
        'https://images.test/page-1.webp',
        'https://images.test/page-2.webp',
        'https://images.test/coffee.png',
      ],
    );
  });
}
