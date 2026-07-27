import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/share_card.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('ShareCardData', () {
    test('builds an exact Trolley Scout link for a catalogue', () {
      final data = ShareCardData.fromCatalogue(const Catalogue(
        id: 'latest-specials-123130',
        retailerId: 'food-lovers',
        name: 'Winter savings',
        url: 'https://catalogues.example.test/winter',
        retailerName: 'Food Lover’s Market',
      ));

      expect(
        data.link,
        'https://trolleyscout.co.za/deals?catalogue=latest-specials-123130&retailer=food-lovers',
      );
      expect(data.noun, 'catalogue');
    });

    test('maps a deal, keeping only a meaningful was price', () {
      const deal = Deal(
        title: 'Clover Fresh Milk 2L',
        retailerName: 'Checkers',
        priceText: 'R29.99',
        previousPriceText: 'R39.99',
        savingText: 'Save R10',
        productUrl: 'https://checkers.co.za/milk',
        imageUrl: 'https://cdn.example.test/milk.jpg',
      );

      final data = ShareCardData.fromDeal(deal);

      expect(data.eyebrow, 'DEAL');
      expect(data.sourceName, 'Checkers');
      expect(data.previousPriceText, 'R39.99');
      expect(data.badgeText, 'Save R10');
      expect(data.link, 'https://checkers.co.za/milk');
      expect(data.shareText, contains('at Checkers'));
      expect(data.shareText, contains('https://trolleyscout.co.za'));
      expect(data.fileName, 'trolley-scout-clover-fresh-milk-2l.png');
    });

    test('drops a zero was price and a non-web product link', () {
      const deal = Deal(
        title: 'Bread',
        retailerName: 'Spar',
        priceText: 'R18.99',
        previousPriceText: 'R0.00',
        productUrl: 'about:blank',
      );

      final data = ShareCardData.fromDeal(deal);

      expect(data.previousPriceText, isNull);
      expect(data.link, isNull);
    });

    test('prefers the reel gallery cover for a window-shopping deal', () {
      const deal = ScrollDeal(
        id: 'reel-1',
        title: 'Air Fryer',
        retailerName: "Daddy's Deals",
        sourceLabel: 'Deal site',
        source: 'daddys',
        productUrl: 'https://daddysdeals.co.za/air-fryer',
        images: ['https://cdn.example.test/fryer.jpg'],
      );

      final data = ShareCardData.fromScrollDeal(deal);

      expect(data.imageUrl, 'https://cdn.example.test/fryer.jpg');
      expect(data.noun, 'deal');
    });

    test('maps a rental listing to place, features and portal wording', () {
      const listing = PropertyListing(
        id: 'p-1',
        portal: 'property24',
        portalName: 'Property24',
        title: '2 Bedroom Apartment in Sea Point',
        listingUrl: 'https://property24.com/listing/1',
        listingType: 'rent',
        priceText: 'R14 500 pm',
        location: 'Sea Point',
        province: 'Western Cape',
        bedrooms: 2,
        bathrooms: 1.5,
      );

      final data = ShareCardData.fromProperty(listing);

      expect(data.eyebrow, 'TO RENT');
      expect(data.subtitle, 'Sea Point, Western Cape');
      expect(data.badgeText, '2 bed · 1.5 bath');
      expect(data.noun, 'home');
      expect(data.shareText, contains('on Property24'));
    });

    test('falls back to price on application when a portal hides the price',
        () {
      const listing = PropertyListing(
        id: 'p-2',
        portal: 'privateproperty',
        portalName: 'Private Property',
        title: 'Family home',
        listingUrl: 'https://privateproperty.co.za/2',
        listingType: 'sale',
      );

      expect(ShareCardData.fromProperty(listing).priceText,
          'Price on application');
    });
  });

  group('DealShareCard', () {
    testWidgets('lays out the whole deal without overflowing its poster',
        (tester) async {
      final data = ShareCardData.fromDeal(const Deal(
        title: 'TechByte Reusable Silicone Kitchen Mat Set One Size Fits All '
            'Five Colours Available For Every Counter',
        retailerName: 'Amazon South Africa',
        priceText: 'R136.93',
        previousPriceText: 'R152.15',
        savingText: 'Save R15.22 with voucher',
      ));

      await _pumpCard(tester, data);

      expect(find.text('DEAL'), findsOneWidget);
      expect(find.text('AMAZON SOUTH AFRICA'), findsOneWidget);
      expect(find.text('R136.93'), findsOneWidget);
      expect(find.text('R152.15'), findsOneWidget);
      expect(find.text('Save R15.22 with voucher'), findsOneWidget);
      expect(find.text('FOUND ON TROLLEY SCOUT'), findsOneWidget);
      expect(tester.getSize(find.byType(DealShareCard)),
          const Size(DealShareCard.width, DealShareCard.height));

      final wasPrice = tester.widget<Text>(find.text('R152.15'));
      expect(wasPrice.style?.decoration, TextDecoration.lineThrough);
    });

    testWidgets('stands in with an icon when a deal has no photo',
        (tester) async {
      final data = ShareCardData.fromDeal(const Deal(
        title: 'Bulk rice 10kg',
        retailerName: 'Boxer',
        priceText: 'R149.99',
      ));

      await _pumpCard(tester, data);

      expect(find.byIcon(Icons.local_offer_outlined), findsOneWidget);
      expect(find.byType(Image), findsOneWidget); // the logo only
    });

    testWidgets('renders a home with its suburb and dark-theme colours',
        (tester) async {
      final data = ShareCardData.fromProperty(const PropertyListing(
        id: 'p-3',
        portal: 'property24',
        portalName: 'Property24',
        title: '3 Bedroom House in Kempton Park',
        listingUrl: 'https://property24.com/3',
        listingType: 'sale',
        priceText: 'R1 295 000',
        location: 'Kempton Park',
        bedrooms: 3,
        bathrooms: 2,
      ));

      await _pumpCard(tester, data, theme: TS.darkTheme());

      expect(find.text('FOR SALE'), findsOneWidget);
      expect(find.text('Kempton Park'), findsOneWidget);
      expect(find.text('3 bed · 2 bath'), findsOneWidget);
      expect(find.byIcon(Icons.home_outlined), findsOneWidget);
    });
  });

  testWidgets('share sheet previews the card and offers both ways to send',
      (tester) async {
    final data = ShareCardData.fromDeal(const Deal(
      title: 'Sunlight Dishwashing Liquid 750ml',
      retailerName: 'Pick n Pay',
      priceText: 'R32.99',
    ));

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => showShareCardSheet(context, data),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Share this deal'), findsOneWidget);
    expect(find.byType(DealShareCard), findsOneWidget);
    // The capture reads from this boundary, so it must exist around the card.
    expect(
      find.ancestor(
        of: find.byType(DealShareCard),
        matching: find.byType(RepaintBoundary),
      ),
      findsWidgets,
    );
    expect(find.byKey(const Key('share-card-image')), findsOneWidget);
    expect(find.byKey(const Key('share-card-link')), findsOneWidget);
  });

  // A shared card outlives the moment it was made and reaches people who never
  // opened the app, so it has to carry the bad news as well as the good.
  testWidgets('a sold-out deal says so on the card it shares', (tester) async {
    final data = ShareCardData.fromDeal(const Deal(
      title: 'Non-Stick Frypan 28cm',
      retailerName: 'PEP',
      priceText: 'R199.99',
      previousPriceText: 'R249.99',
      savingText: '20% off',
      soldOut: true,
    ));

    expect(data.soldOut, isTrue);

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: DealShareCard(data: data)),
    ));
    await tester.pump();

    expect(find.byKey(const ValueKey('share-card-sold-out')), findsOneWidget);
    expect(find.text('SOLD OUT'), findsOneWidget);
    // The saving gives up its slot: a discount on something nobody can buy is
    // not the news.
    expect(find.text('20% off'), findsNothing);
  });

  testWidgets('an in-stock deal keeps its saving badge', (tester) async {
    final data = ShareCardData.fromDeal(const Deal(
      title: 'Non-Stick Frypan 28cm',
      retailerName: 'PEP',
      priceText: 'R199.99',
      savingText: '20% off',
    ));

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: DealShareCard(data: data)),
    ));
    await tester.pump();

    expect(find.byKey(const ValueKey('share-card-sold-out')), findsNothing);
    expect(find.text('20% off'), findsOneWidget);
  });
}

Future<void> _pumpCard(
  WidgetTester tester,
  ShareCardData data, {
  ThemeData? theme,
}) async {
  await tester.pumpWidget(MaterialApp(
    theme: theme ?? TS.lightTheme(),
    home: Scaffold(body: Center(child: DealShareCard(data: data))),
  ));
  await tester.pumpAndSettle();
}
