import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/scout_chat_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/catalogue_reader.dart';

void main() {
  testWidgets('Mr Scout renders deal and catalogue recommendations',
      (tester) async {
    String? sentMessage;
    List<ScoutChatTurn>? sentHistory;

    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        darkTheme: TS.darkTheme(),
        home: Scaffold(
          body: ScoutChatScreen(
            api: Api(baseUrl: 'https://example.test'),
            sendMessage: (message, history) async {
              sentMessage = message;
              sentHistory = history;
              return const ScoutChatAnswer(
                reply: 'The cereal offer is the strongest match.',
                deals: [
                  ScoutChatDealCard(
                    id: 'deal-1',
                    retailerName: 'Fresh Market',
                    title: 'Family cereal',
                    priceText: r'$4.99',
                    previousPriceText: r'$6.99',
                    savingText: r'Save $2',
                    productUrl: 'https://shop.example.test/cereal',
                  ),
                ],
                catalogues: [
                  ScoutChatCatalogueCard(
                    id: 'catalogue-1',
                    retailerName: 'Fresh Market',
                    name: 'Weekly savings',
                    url: 'https://shop.example.test/catalogue',
                    pageCount: 1,
                    pageImageUrls: [
                      'https://img.example.test/page-1.jpg',
                    ],
                  ),
                ],
                followUps: ['Show breakfast deals'],
              );
            },
          ),
        ),
      ),
    );

    expect(find.text('Mr Scout'), findsOneWidget);
    expect(find.text('Find the best grocery savings'), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey('mr-scout-message')),
      'Find cereal under five dollars',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('mr-scout-send')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(sentMessage, 'Find cereal under five dollars');
    expect(sentHistory, isEmpty);
    expect(
        find.text('The cereal offer is the strongest match.'), findsOneWidget);
    expect(find.text('Family cereal'), findsOneWidget);
    expect(find.text(r'$4.99'), findsOneWidget);
    expect(find.text('Weekly savings'), findsOneWidget);
    expect(find.text('1 page'), findsOneWidget);
    expect(find.text('Show breakfast deals'), findsOneWidget);

    await tester.ensureVisible(find.text('Weekly savings'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Weekly savings'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(CatalogueReader), findsOneWidget);
  });

  testWidgets('Mr Scout uses theme-safe surfaces in dark mode', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        darkTheme: TS.darkTheme(),
        themeMode: ThemeMode.dark,
        home: Scaffold(
          body: ScoutChatScreen(
            api: Api(baseUrl: 'https://example.test'),
            sendMessage: (_, __) async =>
                const ScoutChatAnswer(reply: 'Ready.'),
          ),
        ),
      ),
    );

    final header = tester.widget<DecoratedBox>(
      find.byKey(const ValueKey('mr-scout-header')),
    );
    final decoration = header.decoration as BoxDecoration;
    final context = tester.element(find.byType(ScoutChatScreen));

    expect(decoration.color, TS.surfaceOf(context));
    expect(decoration.color, isNot(TS.bg));

    final composer = tester.widget<DecoratedBox>(
      find.byKey(const ValueKey('mr-scout-composer')),
    );
    final composerDecoration = composer.decoration as BoxDecoration;
    expect(composerDecoration.color, TS.surfaceOf(context));
  });

  testWidgets('image-heavy recommendations stay inside a phone viewport',
      (tester) async {
    _configurePhone(tester, width: 360, height: 800);
    await _pumpChat(
      tester,
      sendMessage: (_, __) async => _imageHeavyAnswer,
    );

    await _send(tester, 'Show image deals and catalogues');
    await tester.ensureVisible(
      find.byKey(const ValueKey('scout-deal-card-deal-image-1')),
    );
    await tester.pump();

    final cardRect = tester.getRect(
      find.byKey(const ValueKey('scout-deal-card-deal-image-1')),
    );
    expect(cardRect.left, greaterThanOrEqualTo(0));
    expect(cardRect.right, lessThanOrEqualTo(360));
    expect(find.byType(Image), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('image recommendations reflow at 200 percent text',
      (tester) async {
    _configurePhone(tester, width: 320, height: 568, textScale: 2);
    await _pumpChat(
      tester,
      sendMessage: (_, __) async => _imageHeavyAnswer,
    );
    final composerRect = tester.getRect(
      find.byKey(const ValueKey('mr-scout-composer')),
    );
    expect(composerRect.left, greaterThanOrEqualTo(0));
    expect(composerRect.right, lessThanOrEqualTo(320));
    expect(tester.takeException(), isNull);

    final starter = find.text('Find the best grocery savings');
    await tester.ensureVisible(starter);
    await tester.pump();
    await tester.tap(starter);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(
      find.text('These visual results match your request.'),
      findsOneWidget,
    );
    final firstDeal =
        find.byKey(const ValueKey('scout-deal-card-deal-image-1'));
    await tester.ensureVisible(firstDeal);
    await tester.pump();

    final cardRect = tester.getRect(firstDeal);
    expect(cardRect.left, greaterThanOrEqualTo(0));
    expect(cardRect.right, lessThanOrEqualTo(320));
    expect(
      find.byKey(const ValueKey('scout-rich-card-list-3')),
      findsNothing,
      reason: 'Large text should stack rich cards instead of clipping a rail.',
    );

    await tester.ensureVisible(
      find.byKey(const ValueKey('scout-catalogue-card-catalogue-image-2')),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading and recoverable error states keep the chat usable',
      (tester) async {
    _configurePhone(tester, width: 360, height: 800);
    final firstRequest = Completer<ScoutChatAnswer>();
    var attempts = 0;
    await _pumpChat(
      tester,
      sendMessage: (_, __) {
        attempts += 1;
        if (attempts == 1) return firstRequest.future;
        if (attempts == 2) {
          throw const ApiException(
              'The live scout is temporarily unavailable.');
        }
        return Future.value(const ScoutChatAnswer(reply: 'Back online.'));
      },
    );

    await tester.enterText(
      find.byKey(const ValueKey('mr-scout-message')),
      'Find coffee',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('mr-scout-send')));
    await tester.pump();
    expect(
      find.byKey(const ValueKey('mr-scout-loading')),
      findsOneWidget,
    );

    firstRequest.complete(
      const ScoutChatAnswer(reply: 'I found a coffee deal.'),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('I found a coffee deal.'), findsOneWidget);

    await _send(tester, 'Find tea');
    expect(
      find.text('The live scout is temporarily unavailable.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Try again'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(attempts, 3);
    expect(find.text('Back online.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

const _imageHeavyAnswer = ScoutChatAnswer(
  reply: 'These visual results match your request.',
  deals: [
    ScoutChatDealCard(
      id: 'deal-image-1',
      retailerName: 'Fresh Market',
      title: 'Large family breakfast box',
      priceText: r'$12.99',
      previousPriceText: r'$18.99',
      savingText: r'Save $6',
      productUrl: 'https://shop.example.test/deal-1',
      imageUrl: 'https://images.example.test/deal-1.jpg',
    ),
    ScoutChatDealCard(
      id: 'deal-image-2',
      retailerName: 'Value Grocer',
      title: 'Fresh produce bundle',
      priceText: r'$9.50',
      productUrl: 'https://shop.example.test/deal-2',
      imageUrl: 'https://images.example.test/deal-2.jpg',
    ),
    ScoutChatDealCard(
      id: 'deal-image-3',
      retailerName: 'Corner Store',
      title: 'Pantry refill pack',
      priceText: r'$20.00',
      productUrl: 'https://shop.example.test/deal-3',
      imageUrl: 'https://images.example.test/deal-3.jpg',
      soldOut: true,
    ),
  ],
  catalogues: [
    ScoutChatCatalogueCard(
      id: 'catalogue-image-1',
      retailerName: 'Fresh Market',
      name: 'Weekly food savings',
      url: 'https://shop.example.test/catalogue-1',
      pageCount: 8,
      imageUrl: 'https://images.example.test/catalogue-1.jpg',
    ),
    ScoutChatCatalogueCard(
      id: 'catalogue-image-2',
      retailerName: 'Value Grocer',
      name: 'Monthly household catalogue',
      url: 'https://shop.example.test/catalogue-2',
      pageCount: 12,
      pageImageUrls: [
        'https://images.example.test/catalogue-2-page-1.jpg',
        'https://images.example.test/catalogue-2-page-2.jpg',
      ],
    ),
  ],
  followUps: ['Only show in-stock items', 'Find a cheaper option'],
);

void _configurePhone(
  WidgetTester tester, {
  required double width,
  required double height,
  double textScale = 1,
}) {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

Future<void> _pumpChat(
  WidgetTester tester, {
  required ScoutChatSender sendMessage,
  ThemeMode themeMode = ThemeMode.light,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: themeMode,
      home: Scaffold(
        body: ScoutChatScreen(
          api: Api(baseUrl: 'https://example.test'),
          sendMessage: sendMessage,
        ),
      ),
    ),
  );
}

Future<void> _send(WidgetTester tester, String message) async {
  await tester.enterText(
    find.byKey(const ValueKey('mr-scout-message')),
    message,
  );
  await tester.pump();
  await tester.tap(find.byKey(const ValueKey('mr-scout-send')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
}
