import 'package:flutter/material.dart';
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

  testWidgets('uses the catalogue page reader instead of a PDF view',
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

    expect(find.byKey(const ValueKey('catalogue-pdf-view')), findsNothing);
    expect(find.text('Page 1 of 1'), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
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

      await tester.tap(find.byTooltip('Open official source'));
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
