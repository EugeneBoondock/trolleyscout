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

  testWidgets('keeps direct PDFs inside the catalogue reader', (tester) async {
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
    expect(find.textContaining('open another app'), findsNothing);
  });

  testWidgets('shows a grounded cover when page embedding is unavailable',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: const CatalogueReader(
        catalogue: Catalogue(
          name: 'Branch catalogue',
          url: 'https://market.example.test/catalogue',
          imageUrl: 'https://market.example.test/cover.jpg',
        ),
      ),
    ));

    expect(find.text('Catalogue pages are being prepared.'), findsOneWidget);
    expect(
      find.bySemanticsLabel('Cover for Branch catalogue'),
      findsOneWidget,
    );
  });
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
