import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/catalogue_reader.dart';

void main() {
  testWidgets('reads every image page with accessible page controls',
      (tester) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const CatalogueReader(catalogue: _imageCatalogue),
    ));

    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(find.byType(PageView), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
    expect(find.bySemanticsLabel('Catalogue page 1 of 2'), findsOneWidget);
    expect(find.byTooltip('Previous page'), findsOneWidget);
    expect(find.byTooltip('Next page'), findsOneWidget);
    expect(find.byTooltip('Zoom out'), findsOneWidget);
    expect(find.byTooltip('Reset zoom'), findsOneWidget);
    expect(find.byTooltip('Zoom in'), findsOneWidget);

    await tester.tap(find.byTooltip('Next page'));
    await tester.pumpAndSettle();

    expect(find.text('Page 2 of 2'), findsOneWidget);
    expect(find.bySemanticsLabel('Catalogue page 2 of 2'), findsWidgets);
    semantics.dispose();
  });

  testWidgets('opens and closes the reader as an in-app full-screen dialog',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.darkTheme(),
      home: Scaffold(
        body: Builder(
          builder: (context) => FilledButton(
            onPressed: () => showCatalogueReader(context, _imageCatalogue),
            child: const Text('Read catalogue'),
          ),
        ),
      ),
    ));

    await tester.tap(find.text('Read catalogue'));
    await tester.pumpAndSettle();

    expect(find.byType(CatalogueReader), findsOneWidget);
    expect(find.text('Winter savings'), findsOneWidget);

    await tester.tap(find.byTooltip('Close catalogue'));
    await tester.pumpAndSettle();

    expect(find.byType(CatalogueReader), findsNothing);
  });

  testWidgets('opens the catalogue share preview with an exact app link',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const CatalogueReader(
        catalogue: Catalogue(
          id: 'latest-specials-123130',
          retailerId: 'food-lovers',
          name: 'Winter savings',
          url: 'https://catalogues.example.test/winter',
          retailerName: 'Food Lover’s Market',
        ),
      ),
    ));

    await tester.tap(find.byTooltip('Catalogue actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('catalogue-action-share')));
    await tester.pumpAndSettle();

    expect(find.text('Share this catalogue'), findsOneWidget);
    expect(find.text('Send the card, or just the link.'), findsOneWidget);
  });

  testWidgets('uses the full PDF instead of a one-page cover preview',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const CatalogueReader(
        catalogue: Catalogue(
          name: 'Weekly PDF',
          url: 'https://market.example.test/weekly.pdf',
          imageUrl: 'https://market.example.test/cover.jpg',
        ),
      ),
    ));
    await tester.pump();

    expect(find.byKey(const ValueKey('catalogue-pdf-view')), findsOneWidget);
    expect(find.text('Page 1 of 1'), findsNothing);
    expect(find.byType(InteractiveViewer), findsNothing);
  });

  testWidgets('embeds a PDF-only catalogue instead of giving up',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const CatalogueReader(
        catalogue: Catalogue(
          name: 'OK Foods specials',
          url: 'https://www.okfoods.co.za/leaflets/CEN-Foods.pdf',
          sourceUrl: 'https://www.okfoods.co.za/specials.html',
        ),
      ),
    ));
    await tester.pump();

    expect(find.byKey(const ValueKey('catalogue-pdf-view')), findsOneWidget);
    expect(find.text('Catalogue preview unavailable.'), findsNothing);
  });

  testWidgets('loads every directory page before opening the reader',
      (tester) async {
    final pages = Completer<List<CataloguePage>>();
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: CatalogueReader(
        catalogue: const Catalogue(
          name: 'Boxer catalogue week 30',
          url:
              'https://www.cataloguespecials.co.za/view/specials/boxer-catalogue-3703321',
          pagesUrl:
              'https://trolleyscout.co.za/api/catalogue-pages?flyer=3703321&store=boxer',
          sourceLabel: 'Catalogue Specials',
        ),
        loadPages: (_) => pages.future,
      ),
    ));
    await tester.pump();

    expect(find.text('Loading every catalogue page'), findsOneWidget);
    expect(find.byTooltip('Catalogue actions'), findsOneWidget);

    pages.complete(const [
      CataloguePage(
        pageNumber: 1,
        imageUrl: 'https://cdn.example.test/page-1.webp',
      ),
      CataloguePage(
        pageNumber: 2,
        imageUrl: 'https://cdn.example.test/page-2.webp',
      ),
    ]);
    await tester.pumpAndSettle();

    expect(find.text('Page 1 of 2'), findsOneWidget);
  });

  testWidgets(
      'replaces a one-page cover with every remotely published catalogue page',
      (tester) async {
    var loadCalls = 0;
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: CatalogueReader(
        catalogue: const Catalogue(
          name: 'Boxer weekly catalogue',
          url: 'https://catalogues.example.test/boxer-weekly',
          pagesUrl:
              'https://trolleyscout.co.za/api/catalogue-pages?source=latest-specials&flyer=123196',
          pages: [
            CataloguePage(
              pageNumber: 1,
              imageUrl: 'https://cdn.example.test/boxer-cover.webp',
            ),
          ],
        ),
        loadPages: (_) async {
          loadCalls += 1;
          return List.generate(
            12,
            (index) => CataloguePage(
              pageNumber: index + 1,
              imageUrl: 'https://cdn.example.test/boxer-page-${index + 1}.webp',
            ),
          );
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(loadCalls, 1);
    expect(find.text('Page 1 of 12'), findsOneWidget);
    expect(find.byTooltip('Next page'), findsOneWidget);
  });

  testWidgets('never presents a failed multi-page load as page one of one',
      (tester) async {
    var attempts = 0;
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: CatalogueReader(
        catalogue: const Catalogue(
          name: 'Boxer month-end catalogue',
          url: 'https://catalogues.example.test/boxer-month-end',
          sourceUrl: 'https://www.boxer.co.za/promotions',
          pagesUrl:
              'https://trolleyscout.co.za/api/catalogue-pages?source=boxer',
          pages: [
            CataloguePage(
              pageNumber: 1,
              imageUrl: 'https://cdn.example.test/boxer-cover.webp',
            ),
          ],
        ),
        loadPages: (_) async {
          attempts += 1;
          if (attempts == 1) throw StateError('Temporary page-list failure');
          return const [
            CataloguePage(
              pageNumber: 1,
              imageUrl: 'https://cdn.example.test/boxer-page-1.webp',
            ),
            CataloguePage(
              pageNumber: 2,
              imageUrl: 'https://cdn.example.test/boxer-page-2.webp',
            ),
            CataloguePage(
              pageNumber: 3,
              imageUrl: 'https://cdn.example.test/boxer-page-3.webp',
            ),
          ];
        },
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Couldn’t load the full catalogue'), findsOneWidget);
    expect(find.text('Page 1 of 1'), findsNothing);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(attempts, 2);
    expect(find.text('Page 1 of 3'), findsOneWidget);
  });

  testWidgets('offers a distraction-free full-screen reading mode',
      (tester) async {
    final platformCalls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      platformCalls.add(call);
      return null;
    });
    addTearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    await tester.pumpWidget(MaterialApp(
      theme: TS.darkTheme(),
      home: const CatalogueReader(catalogue: _imageCatalogue),
    ));

    await tester.tap(find.byTooltip('Enter full screen'));
    await tester.pumpAndSettle();

    expect(find.byTooltip('Exit full screen'), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(
      platformCalls.any(
        (call) =>
            call.method == 'SystemChrome.setEnabledSystemUIMode' &&
            call.arguments == 'SystemUiMode.immersiveSticky',
      ),
      isTrue,
    );

    await tester.tap(find.byTooltip('Exit full screen'));
    await tester.pumpAndSettle();
    expect(
      platformCalls.any(
        (call) =>
            call.method == 'SystemChrome.setEnabledSystemUIMode' &&
            call.arguments == 'SystemUiMode.edgeToEdge',
      ),
      isTrue,
    );
  });

  testWidgets('offers the official source when no catalogue page is available',
      (tester) async {
    Uri? openedUri;
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: CatalogueReader(
        catalogue: const Catalogue(
          name: 'Weekly PDF',
          url: 'invalid.pdf',
          sourceUrl: 'https://market.example.test/catalogue',
        ),
        openExternal: (uri) async => openedUri = uri,
      ),
    ));
    await tester.pump();

    expect(find.text('Catalogue preview unavailable.'), findsOneWidget);
    expect(find.text('Open official source'), findsOneWidget);

    await tester.tap(find.text('Open official source'));
    await tester.pump();

    expect(openedUri, Uri.parse('https://market.example.test/catalogue'));
  });

  testWidgets('offers the official source when every page image fails',
      (tester) async {
    Uri? openedUri;
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: CatalogueReader(
        catalogue: const Catalogue(
          name: 'Unavailable image catalogue',
          url: 'https://cdn.market.example.test/catalogue-preview',
          sourceUrl: 'https://market.example.test/catalogue',
          pages: [
            CataloguePage(pageNumber: 1, imageUrl: ''),
          ],
        ),
        openExternal: (uri) async => openedUri = uri,
      ),
    ));
    await tester.pump();

    final sourceButton = find.text('Open official source');
    expect(find.text('Catalogue page unavailable.'), findsOneWidget);
    expect(sourceButton, findsOneWidget);

    await tester.tap(sourceButton);
    await tester.pump();

    expect(openedUri, Uri.parse('https://market.example.test/catalogue'));
  });

  for (final themeMode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('shows an official source fallback in ${themeMode.name} mode',
        (tester) async {
      Uri? openedUri;
      await tester.pumpWidget(MaterialApp(
        theme: TS.lightTheme(),
        darkTheme: TS.darkTheme(),
        themeMode: themeMode,
        home: CatalogueReader(
          catalogue: const Catalogue(
            name: 'Branch catalogue',
            url: 'https://cdn.market.example.test/catalogue-preview',
            sourceUrl: 'https://market.example.test/catalogue',
            imageUrl: 'https://market.example.test/cover.jpg',
          ),
          openExternal: (uri) async => openedUri = uri,
        ),
      ));

      expect(find.text('Page 1 of 1'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Catalogue page 1 of 1'),
        findsOneWidget,
      );

      await tester.tap(find.byTooltip('Catalogue actions'));
      await tester.pumpAndSettle();
      final sourceAction = find.byKey(const Key('catalogue-action-source'));
      expect(sourceAction, findsOneWidget);
      await tester.tap(sourceAction);
      await tester.pump();

      expect(openedUri, Uri.parse('https://market.example.test/catalogue'));
    });
  }
}

const _imageCatalogue = Catalogue(
  name: 'Winter savings',
  url: 'https://catalogues.example.test/winter',
  retailerName: 'Example Market',
  pages: [
    CataloguePage(
      pageNumber: 1,
      imageUrl: 'https://cdn.example.test/page-1.webp',
      fallbacks: ['https://cdn.example.test/page-1.jpg'],
    ),
    CataloguePage(
      pageNumber: 2,
      imageUrl: 'https://cdn.example.test/page-2.webp',
      fallbacks: ['https://cdn.example.test/page-2.jpg'],
    ),
  ],
);
