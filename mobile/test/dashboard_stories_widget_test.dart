import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/dashboard_stories.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/dashboard_stories.dart';

void main() {
  testWidgets('shows catalogue pages before the deal in a segmented story',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const Scaffold(
        body: DashboardStories(
          stories: [_story],
        ),
      ),
    ));

    await tester.tap(find.byTooltip('View Pick n Pay story'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('story-progress-0')), findsOneWidget);
    expect(find.byKey(const Key('story-progress-1')), findsOneWidget);
    expect(find.byKey(const Key('story-progress-2')), findsOneWidget);
    expect(find.text('Page 1 of 2'), findsOneWidget);

    await tester.tap(find.byTooltip('Next story item'));
    await tester.pumpAndSettle();
    expect(find.text('Page 2 of 2'), findsOneWidget);

    await tester.tap(find.byTooltip('Next story item'));
    await tester.pumpAndSettle();
    expect(find.text('Coffee 200g'), findsOneWidget);
    expect(find.text('R79.99'), findsOneWidget);
    expect(find.text('View deal'), findsOneWidget);
  });

  testWidgets('loads remote catalogue pages only after its story opens',
      (tester) async {
    var loads = 0;
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: DashboardStories(
          stories: const [_lazyStory],
          loadPages: (url) async {
            loads += 1;
            expect(url, 'https://trolleyscout.co.za/api/catalogue-pages');
            return const [
              CataloguePage(
                pageNumber: 1,
                imageUrl: 'https://images.test/remote-page-1.webp',
              ),
              CataloguePage(
                pageNumber: 2,
                imageUrl: 'https://images.test/remote-page-2.webp',
              ),
            ];
          },
        ),
      ),
    ));

    expect(loads, 0);
    await tester.tap(find.byTooltip('View Pick n Pay story'));
    await tester.pumpAndSettle();

    expect(loads, 1);
    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(find.byKey(const Key('story-progress-0')), findsOneWidget);
    expect(find.byKey(const Key('story-progress-1')), findsOneWidget);
    expect(find.byKey(const Key('story-progress-2')), findsOneWidget);
  });
}

const _catalogue = Catalogue(
  name: 'Weekly catalogue',
  url: 'https://retailer.test/catalogue',
  retailerName: 'Pick n Pay',
);

const _deal = Deal(
  id: 'coffee',
  retailerId: 'pick-n-pay',
  retailerName: 'Pick n Pay',
  title: 'Coffee 200g',
  imageUrl: 'https://images.test/coffee.png',
  productUrl: 'https://retailer.test/coffee',
  priceText: 'R79.99',
);

const _story = DashboardStory(
  id: 'pick-n-pay',
  retailerName: 'Pick n Pay',
  frames: [
    DashboardStoryFrame(
      id: 'page-1',
      kind: DashboardStoryFrameKind.catalogue,
      imageUrl: '',
      imageUrls: [],
      title: 'Weekly catalogue',
      sourceUrl: 'https://retailer.test/catalogue',
      subtitle: 'Page 1 of 2',
      pageNumber: 1,
      catalogue: _catalogue,
    ),
    DashboardStoryFrame(
      id: 'page-2',
      kind: DashboardStoryFrameKind.catalogue,
      imageUrl: '',
      imageUrls: [],
      title: 'Weekly catalogue',
      sourceUrl: 'https://retailer.test/catalogue',
      subtitle: 'Page 2 of 2',
      pageNumber: 2,
      catalogue: _catalogue,
    ),
    DashboardStoryFrame(
      id: 'deal',
      kind: DashboardStoryFrameKind.deal,
      imageUrl: '',
      imageUrls: [],
      title: 'Coffee 200g',
      sourceUrl: 'https://retailer.test/coffee',
      subtitle: 'R79.99',
      deal: _deal,
    ),
  ],
);

const _lazyCatalogue = Catalogue(
  id: 'remote-weekly',
  name: 'Remote weekly catalogue',
  url: 'https://retailer.test/catalogue',
  pagesUrl: 'https://trolleyscout.co.za/api/catalogue-pages',
  retailerName: 'Pick n Pay',
  imageUrl: 'https://images.test/cover.webp',
  pages: [
    CataloguePage(
      pageNumber: 1,
      imageUrl: 'https://images.test/cover.webp',
    ),
  ],
);

const _lazyStory = DashboardStory(
  id: 'pick-n-pay',
  retailerName: 'Pick n Pay',
  frames: [
    DashboardStoryFrame(
      id: 'remote-cover',
      kind: DashboardStoryFrameKind.catalogue,
      imageUrl: 'https://images.test/cover.webp',
      imageUrls: ['https://images.test/cover.webp'],
      title: 'Remote weekly catalogue',
      sourceUrl: 'https://retailer.test/catalogue',
      subtitle: 'Catalogue cover',
      pageNumber: 1,
      catalogue: _lazyCatalogue,
    ),
    DashboardStoryFrame(
      id: 'deal',
      kind: DashboardStoryFrameKind.deal,
      imageUrl: '',
      imageUrls: [],
      title: 'Coffee 200g',
      sourceUrl: 'https://retailer.test/coffee',
      subtitle: 'R79.99',
      deal: _deal,
    ),
  ],
);
