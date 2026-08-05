import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/loyalty_wallet.dart';
import 'package:trolley_scout/personal_coupon_vault.dart';
import 'package:trolley_scout/receipt_insights.dart';
import 'package:trolley_scout/receipt_scan.dart';
import 'package:trolley_scout/receipt_vault.dart';
import 'package:trolley_scout/screens/loyalty_wallet_screen.dart';
import 'package:trolley_scout/session_cookie_store.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  test('wallet saves card numbers in the secret backend', () async {
    final secrets = MemorySessionSecretBackend();
    final files = _MemoryLoyaltyFiles();
    final store = LoyaltyWalletStore(secrets: secrets, files: files);

    final cards = await store.add(
      programName: 'Smart Shopper',
      cardNumber: '1234 5678 9012',
      note: 'Household card',
      expiryDate: '2027-08-01',
      frontImageSourcePath: '/picked/front.jpg',
      backImageSourcePath: '/picked/back.png',
    );

    expect(cards.single.programName, 'Smart Shopper');
    expect(cards.single.expiryDate, '2027-08-01');
    expect(cards.single.frontImagePath, contains('-front.jpg'));
    expect(cards.single.backImagePath, contains('-back.jpg'));
    expect(files.savedSides, [
      LoyaltyCardPhotoSide.front,
      LoyaltyCardPhotoSide.back,
    ]);
    expect((await store.load()).single.cardNumber, '1234 5678 9012');
    expect(secrets.values.values.single, contains('1234 5678 9012'));
    await expectLater(
      store.add(programName: 'smart shopper', cardNumber: '1234 5678 9012'),
      throwsFormatException,
    );
    await store.remove(cards.single.id);
    expect(files.deletedPaths, [
      cards.single.frontImagePath,
      cards.single.backImagePath,
    ]);
  });

  test('wallet rejects bad dates and identifies expiring cards', () async {
    final store = LoyaltyWalletStore(
      secrets: MemorySessionSecretBackend(),
      files: _MemoryLoyaltyFiles(),
    );
    await expectLater(
      store.add(
        programName: 'Shoprite',
        cardNumber: '123456',
        expiryDate: '2027-02-30',
      ),
      throwsFormatException,
    );
    expect(
      loyaltyExpiryState('2026-08-20', now: DateTime(2026, 8, 1)),
      LoyaltyExpiryState.expiringSoon,
    );
    expect(
      loyaltyExpiryState('2026-07-31', now: DateTime(2026, 8, 1)),
      LoyaltyExpiryState.expired,
    );
    expect(
      loyaltyExpiryState('2027-08-01', now: DateTime(2026, 8, 1)),
      LoyaltyExpiryState.active,
    );
    expect(loyaltyExpiryState(null), LoyaltyExpiryState.noExpiry);
  });

  test('wallet masks every card except its final four characters', () {
    expect(maskLoyaltyNumber('123456789012'), '•••• •••• 9012');
    expect(maskLoyaltyNumber('AB12'), 'AB12');
  });

  testWidgets('shopper adds, reveals and removes an on-device loyalty card',
      (tester) async {
    final semantics = tester.ensureSemantics();
    final files = _MemoryLoyaltyFiles();
    final selectedPhotos = <LoyaltyCardPhotoSide>[];
    final store = LoyaltyWalletStore(
      secrets: MemorySessionSecretBackend(),
      files: files,
    );
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: store,
          couponStore: PersonalCouponVaultStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptBudgetStore: ReceiptBudgetStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: ReceiptVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryReceiptFiles(),
          ),
          loyaltyImagePicker: (side, source) async {
            selectedPhotos.add(side);
            expect(source, LoyaltyCaptureSource.gallery);
            return '/picked/${side.name}.jpg';
          },
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add first card'));
    await tester.pumpAndSettle();
    final fields = find.byType(TextField);
    expect(find.text('Retailer quick picks'), findsOneWidget);
    await tester.tap(find.byKey(const Key('loyalty-quick-pick-Pick n Pay')));
    await tester.pump();
    expect(
      tester.widget<TextField>(fields.at(0)).controller?.text,
      'Pick n Pay',
    );
    await tester.ensureVisible(
      find.byKey(const Key('loyalty-back-photo')),
    );
    await tester.tap(find.byKey(const Key('loyalty-back-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose from device'));
    await tester.pumpAndSettle();
    expect(find.text('Barcode side attached'), findsOneWidget);
    expect(selectedPhotos, [LoyaltyCardPhotoSide.back]);
    await tester.enterText(fields.at(0), 'Smart Shopper');
    await tester.enterText(fields.at(1), '123456789012');
    await tester.enterText(fields.at(3), 'Household card');
    await tester.ensureVisible(find.byKey(const Key('save-loyalty-card')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-loyalty-card')));
    await tester.pumpAndSettle();

    expect(find.text('•••• •••• 9012'), findsOneWidget);
    expect(find.text('123456789012'), findsNothing);
    expect(find.text('1 card photo saved on this device'), findsOneWidget);
    await tester.ensureVisible(find.text('Use at checkout'));
    await tester.tap(find.text('Use at checkout'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loyalty-checkout-barcode')), findsOneWidget);
    expect(
      tester
          .getSemantics(find.byKey(const Key('loyalty-checkout-barcode')))
          .label,
      contains('Scannable barcode for Smart Shopper'),
    );
    semantics.dispose();
    expect(find.text('123456789012'), findsOneWidget);
    await tester.tap(find.byKey(const Key('copy-checkout-card-number')));
    await tester.pump();
    expect(find.text('Card number copied.'), findsOneWidget);
    await tester.tap(find.byTooltip('Close checkout card'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reveal number'));
    await tester.pump();
    expect(find.text('123456789012'), findsOneWidget);

    await tester.ensureVisible(find.byTooltip('Remove loyalty card'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Remove loyalty card'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
    await tester.pumpAndSettle();
    expect(find.text('No loyalty cards saved on this device yet.'),
        findsOneWidget);
  });

  testWidgets('card form recovers when photo permission is denied',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: LoyaltyWalletStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryLoyaltyFiles(),
          ),
          couponStore: PersonalCouponVaultStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptBudgetStore: ReceiptBudgetStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: ReceiptVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryReceiptFiles(),
          ),
          loyaltyImagePicker: (side, source) async => throw PlatformException(
            code: 'camera_denied',
            message: 'Camera permission denied.',
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add first card'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('loyalty-front-photo')));
    await tester.tap(find.byKey(const Key('loyalty-front-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take photo'));
    await tester.pumpAndSettle();

    expect(find.text('Camera permission denied.'), findsOneWidget);
    expect(find.text('Add loyalty card'), findsOneWidget);
    expect(find.text('Front attached'), findsNothing);
  });

  testWidgets('camera choice uses the guided card capture flow',
      (tester) async {
    String? capturedTitle;
    String? capturedInstruction;
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: LoyaltyWalletStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryLoyaltyFiles(),
          ),
          couponStore: PersonalCouponVaultStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptBudgetStore: ReceiptBudgetStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: ReceiptVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryReceiptFiles(),
          ),
          guidedCardCapture: (
            context, {
            required title,
            required instruction,
          }) async {
            capturedTitle = title;
            capturedInstruction = instruction;
            return '/guided/front.jpg';
          },
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add first card'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('loyalty-front-photo')));
    await tester.tap(find.byKey(const Key('loyalty-front-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take photo'));
    await tester.pumpAndSettle();

    expect(capturedTitle, 'Front of loyalty card');
    expect(capturedInstruction, 'Keep all four card edges inside the frame.');
    expect(find.text('Front attached'), findsOneWidget);
  });

  test('receipt vault saves metadata securely and manages its local photo',
      () async {
    final secrets = MemorySessionSecretBackend();
    final files = _MemoryReceiptFiles();
    final store = ReceiptVaultStore(secrets: secrets, files: files);

    final receipts = await store.add(
      retailerName: 'Shoprite',
      purchaseDate: '2026-08-01',
      sourceImagePath: '/picked/receipt.jpg',
      totalText: 'R 482.50',
      note: 'Monthly groceries',
      items: const [
        ReceiptLineItem(title: 'Milk 2L', priceText: 'R 34.99'),
      ],
    );

    expect(receipts.single.retailerName, 'Shoprite');
    expect(receipts.single.imagePath, startsWith('/saved/receipt-'));
    expect(receipts.single.items.single.title, 'Milk 2L');
    expect(secrets.values.values.single, contains('Shoprite'));
    expect(files.savedSources, ['/picked/receipt.jpg']);

    await store.remove(receipts.single.id);
    expect(await store.load(), isEmpty);
    expect(files.deletedPaths, [receipts.single.imagePath]);
  });

  test('private coupon vault saves, orders, and removes coupon codes',
      () async {
    final secrets = MemorySessionSecretBackend();
    final files = _MemoryCouponFiles();
    final store = PersonalCouponVaultStore(secrets: secrets, files: files);

    await store.add(
      retailerName: 'Woolworths',
      code: 'SAVE100',
      validThrough: '2026-08-31',
      receivedDate: '2026-08-01',
      note: 'R100 off',
      terms: 'In store only, minimum spend R500',
      offerImageSourcePath: '/picked/offer.jpg',
      termsImageSourcePath: '/picked/terms.png',
    );
    final coupons = await store.add(
      retailerName: 'Checkers',
      code: 'FRESH20',
      validThrough: '2026-08-15',
    );

    expect(coupons.map((coupon) => coupon.retailerName),
        ['Checkers', 'Woolworths']);
    expect(coupons.last.receivedDate, '2026-08-01');
    expect(coupons.last.terms, 'In store only, minimum spend R500');
    expect(coupons.last.offerImagePath, contains('-offer.jpg'));
    expect(coupons.last.termsImagePath, contains('-terms.jpg'));
    expect(files.savedSides, [
      PersonalCouponPhotoSide.offer,
      PersonalCouponPhotoSide.terms,
    ]);
    expect(secrets.values.values.single, contains('SAVE100'));
    await expectLater(
      store.add(
        retailerName: 'woolworths',
        code: 'save100',
        validThrough: '2026-09-01',
      ),
      throwsFormatException,
    );
    await expectLater(
      store.add(
        retailerName: 'Shoprite',
        code: 'SAVE20',
        validThrough: '2026-09-01',
        receivedDate: '2026-02-31',
      ),
      throwsFormatException,
    );
    await store.remove(coupons.first.id);
    expect((await store.load()).single.retailerName, 'Woolworths');
    await store.remove(coupons.last.id);
    expect(files.deletedPaths, [
      coupons.last.offerImagePath,
      coupons.last.termsImagePath,
    ]);
  });

  testWidgets('shopper saves, copies and deletes a private coupon',
      (tester) async {
    final couponFiles = _MemoryCouponFiles();
    final couponStore = PersonalCouponVaultStore(
      secrets: MemorySessionSecretBackend(),
      files: couponFiles,
    );
    final pickedCouponSides = <PersonalCouponPhotoSide>[];
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: LoyaltyWalletStore(secrets: MemorySessionSecretBackend()),
          couponStore: couponStore,
          couponImagePicker: (side, source) async {
            expect(source, PersonalCouponCaptureSource.gallery);
            pickedCouponSides.add(side);
            return '/picked/${side.name}.jpg';
          },
          receiptBudgetStore: ReceiptBudgetStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: ReceiptVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryReceiptFiles(),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add first coupon'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const Key('coupon-retailer')), 'Woolworths');
    await tester.enterText(find.byKey(const Key('coupon-code')), 'SAVE100');
    await tester.enterText(
        find.byKey(const Key('coupon-note')), 'R100 off an online order');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('coupon-offer-photo')));
    await tester.tap(find.byKey(const Key('coupon-offer-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose from device'));
    await tester.pumpAndSettle();
    await tester.dragFrom(const Offset(400, 500), const Offset(0, -700));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-private-coupon')));
    await tester.pumpAndSettle();

    expect(find.text('Woolworths'), findsOneWidget);
    expect(find.text('SAVE100'), findsOneWidget);
    expect(find.text('R100 off an online order'), findsOneWidget);
    expect(pickedCouponSides, [PersonalCouponPhotoSide.offer]);
    expect(couponFiles.savedSides, [PersonalCouponPhotoSide.offer]);
    await tester.drag(find.byType(ListView), const Offset(0, -320));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Show at checkout'));
    await tester.tap(find.text('Show at checkout'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('personal-coupon-checkout-screen')),
        findsOneWidget);
    expect(find.byKey(const Key('personal-coupon-checkout-barcode')),
        findsOneWidget);
    expect(find.text('Coupon photo fallback'), findsOneWidget);
    await tester.tap(find.byKey(const Key('copy-checkout-coupon-code')));
    await tester.pump();
    expect(find.text('Coupon code copied.'), findsOneWidget);
    await tester.tap(find.byTooltip('Close checkout coupon'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Copy code'));
    await tester.tap(find.text('Copy code'));
    await tester.pump();
    expect(find.text('Coupon code copied.'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byTooltip('Delete private coupon'),
      -180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(ListView), const Offset(0, 320));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Delete private coupon'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.text('No private coupons saved on this device yet.'),
        findsOneWidget);
  });

  testWidgets('coupon photo denial explains how the shopper can recover',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: LoyaltyWalletStore(secrets: MemorySessionSecretBackend()),
          couponStore: PersonalCouponVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryCouponFiles(),
          ),
          receiptBudgetStore: ReceiptBudgetStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: ReceiptVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryReceiptFiles(),
          ),
          couponImagePicker: (_, __) async => throw PlatformException(
            code: 'photo-denied',
            message: 'Allow coupon photo access in Settings.',
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add first coupon'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('coupon-offer-photo')));
    await tester.tap(find.byKey(const Key('coupon-offer-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose from device'));
    await tester.pumpAndSettle();

    expect(find.text('Allow coupon photo access in Settings.'), findsOneWidget);
    expect(find.byKey(const Key('save-private-coupon')), findsOneWidget);
  });

  testWidgets('expired coupon checkout stays scan-ready in dark mode',
      (tester) async {
    final couponStore = PersonalCouponVaultStore(
      secrets: MemorySessionSecretBackend(),
      files: _MemoryCouponFiles(),
    );
    await couponStore.add(
      retailerName: 'Checkers',
      code: 'WINTER20',
      validThrough: '2020-08-01',
    );
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: ThemeMode.dark,
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: LoyaltyWalletStore(secrets: MemorySessionSecretBackend()),
          couponStore: couponStore,
          receiptBudgetStore: ReceiptBudgetStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: ReceiptVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryReceiptFiles(),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Show at checkout'));
    await tester.tap(find.text('Show at checkout'));
    await tester.pumpAndSettle();

    final checkout = tester.widget<Scaffold>(
      find.byKey(const Key('personal-coupon-checkout-screen')),
    );
    expect(checkout.backgroundColor, Colors.white);
    expect(
      find.text(
        'This coupon is past its saved expiry date. '
        'Check with the retailer before using it.',
      ),
      findsOneWidget,
    );
    final semantics = tester.getSemantics(
      find.byKey(const Key('personal-coupon-checkout-barcode')),
    );
    expect(semantics.label, contains('Scannable coupon barcode'));
    expect(semantics.label, contains('WINTER20'));
  });

  testWidgets('shopper saves and deletes a private receipt in light mode',
      (tester) async {
    final files = _MemoryReceiptFiles();
    var pickedImage = false;
    final receiptStore = ReceiptVaultStore(
      secrets: MemorySessionSecretBackend(),
      files: files,
    );
    final walletStore =
        LoyaltyWalletStore(secrets: MemorySessionSecretBackend());
    final couponStore = PersonalCouponVaultStore(
      secrets: MemorySessionSecretBackend(),
    );
    final budgetStore =
        ReceiptBudgetStore(secrets: MemorySessionSecretBackend());

    Widget buildWallet() => MaterialApp(
          key: UniqueKey(),
          theme: TS.lightTheme(),
          darkTheme: TS.darkTheme(),
          home: Scaffold(
            body: LoyaltyWalletScreen(
              store: walletStore,
              couponStore: couponStore,
              receiptBudgetStore: budgetStore,
              receiptStore: receiptStore,
              receiptImagePicker: (_) async {
                pickedImage = true;
                return '/picked/receipt.jpg';
              },
              receiptScanner: (_) async => const ReceiptScanResult(
                retailerName: 'Shoprite',
                purchaseDate: '2026-08-01',
                totalText: 'R 482.50',
                items: [
                  ReceiptLineItem(title: 'Milk 2L', priceText: 'R 34.99'),
                  ReceiptLineItem(
                    title: 'Brown bread',
                    priceText: 'R 18.49',
                  ),
                ],
              ),
            ),
          ),
        );
    await tester.pumpWidget(buildWallet());
    await tester.pumpAndSettle();

    await tester.drag(find.byType(ListView), const Offset(0, -760));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add first receipt'));
    await tester.pumpAndSettle();
    final gallery = find.byKey(const Key('capture-receipt-gallery'));
    await tester.ensureVisible(gallery);
    await tester.tap(gallery);
    for (var frame = 0; frame < 12; frame += 1) {
      await tester.pump(const Duration(milliseconds: 150));
      if (find.byKey(const Key('receipt-scan-success')).evaluate().isNotEmpty) {
        break;
      }
    }
    expect(pickedImage, isTrue);
    expect(find.byKey(const Key('receipt-retailer')), findsOneWidget);
    expect(find.byKey(const Key('receipt-scan-success')), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('receipt-retailer')))
          .controller
          ?.text,
      'Shoprite',
    );
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('receipt-items')))
          .controller
          ?.text,
      contains('Brown bread'),
    );
    await tester.enterText(
        find.byKey(const Key('receipt-note')), 'Monthly groceries');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.dragFrom(const Offset(400, 500), const Offset(0, -700));
    await tester.pumpAndSettle();
    final saveReceipt = find.byKey(const Key('save-receipt'));
    await tester.ensureVisible(saveReceipt);
    await tester.pumpAndSettle();
    await tester.tap(saveReceipt);
    await tester.pumpAndSettle();

    expect(saveReceipt, findsNothing);
    final savedReceipts = await receiptStore.load();
    expect(savedReceipts.single.retailerName, 'Shoprite');
    expect(savedReceipts.single.items, hasLength(2));

    // Rebuild from the saved local record so the assertions do not depend on
    // the scroll offset left behind the modal sheet.
    await tester.pumpWidget(buildWallet());
    await tester.pumpAndSettle();
    for (var attempt = 0;
        attempt < 10 && find.text('Shoprite').evaluate().isEmpty;
        attempt += 1) {
      await tester.drag(find.byType(ListView), const Offset(0, -320));
      await tester.pumpAndSettle();
    }
    expect(find.text('Shoprite'), findsWidgets);
    expect(find.text('R 482.50'), findsWidgets);
    expect(
        find.text('Photos, totals and read items stay on this device. '
            'Trolley Scout never uploads them.'),
        findsOneWidget);
    expect(find.text('2 items read on-device'), findsOneWidget);
    final deleteReceipt = find.byTooltip('Delete receipt');
    await tester.ensureVisible(deleteReceipt);
    await tester.pumpAndSettle();
    await tester.tap(deleteReceipt);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(await receiptStore.load(), isEmpty);
  });

  testWidgets('saved receipt totals become a private monthly spending coach',
      (tester) async {
    final files = _MemoryReceiptFiles();
    final receiptStore = ReceiptVaultStore(
      secrets: MemorySessionSecretBackend(),
      files: files,
    );
    final budgetStore =
        ReceiptBudgetStore(secrets: MemorySessionSecretBackend());
    final month = DateTime.now().toIso8601String().substring(0, 7);
    await receiptStore.add(
      retailerName: 'Shoprite',
      purchaseDate: '$month-01',
      sourceImagePath: '/picked/one.jpg',
      totalText: 'R 480.00',
      items: const [
        ReceiptLineItem(title: 'Maize meal 10kg', priceText: 'R 99.99'),
      ],
    );
    await receiptStore.add(
      retailerName: 'Checkers',
      purchaseDate: '$month-02',
      sourceImagePath: '/picked/two.jpg',
      totalText: 'R 220.00',
    );
    await budgetStore.save(amountText: '2000', currency: 'R');

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: LoyaltyWalletStore(secrets: MemorySessionSecretBackend()),
          couponStore: PersonalCouponVaultStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: receiptStore,
          receiptBudgetStore: budgetStore,
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -1050));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('receipt-spend-coach')), findsOneWidget);
    expect(find.text('R 700.00'), findsWidgets);
    expect(find.text('R 1300.00 left in your monthly budget'), findsOneWidget);
    expect(find.text('R 350.00'), findsOneWidget);
    expect(find.text('Shoprite'), findsWidgets);
    expect(find.byKey(const Key('receipt-price-memory')), findsOneWidget);
    expect(find.text('Maize meal 10kg'), findsOneWidget);
    final progress = tester.widget<LinearProgressIndicator>(
      find.byKey(const Key('receipt-budget-progress')),
    );
    expect(progress.value, closeTo(0.35, 0.001));

    tester
        .widget<OutlinedButton>(find.byKey(const Key('edit-receipt-budget')))
        .onPressed!();
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const Key('receipt-budget-amount')), '1500');
    await tester.tap(find.byKey(const Key('save-receipt-budget')));
    await tester.pumpAndSettle();
    expect((await budgetStore.load())?.amount, 1500);
  });

  testWidgets('private wallet keeps readable surfaces in dark mode',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: ThemeMode.dark,
      home: Scaffold(
        body: LoyaltyWalletScreen(
          store: LoyaltyWalletStore(secrets: MemorySessionSecretBackend()),
          couponStore: PersonalCouponVaultStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptBudgetStore: ReceiptBudgetStore(
            secrets: MemorySessionSecretBackend(),
          ),
          receiptStore: ReceiptVaultStore(
            secrets: MemorySessionSecretBackend(),
            files: _MemoryReceiptFiles(),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Cards, coupons and receipts'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -760));
    await tester.pumpAndSettle();
    final vault = find.byKey(const Key('receipt-vault'));
    expect(vault, findsOneWidget);
    expect(Theme.of(tester.element(vault)).brightness, Brightness.dark);
  });
}

class _MemoryReceiptFiles implements ReceiptFileBackend {
  final savedSources = <String>[];
  final deletedPaths = <String>[];

  @override
  Future<String> save(String id, String sourcePath) async {
    savedSources.add(sourcePath);
    return '/saved/$id.jpg';
  }

  @override
  Future<void> delete(String savedPath) async {
    deletedPaths.add(savedPath);
  }
}

class _MemoryLoyaltyFiles implements LoyaltyCardFileBackend {
  final savedSides = <LoyaltyCardPhotoSide>[];
  final deletedPaths = <String>[];

  @override
  Future<String> save(
    String id,
    LoyaltyCardPhotoSide side,
    String sourcePath,
  ) async {
    savedSides.add(side);
    return '/saved/$id-${side.name}.jpg';
  }

  @override
  Future<void> delete(String savedPath) async {
    deletedPaths.add(savedPath);
  }
}

class _MemoryCouponFiles implements PersonalCouponFileBackend {
  final savedSides = <PersonalCouponPhotoSide>[];
  final deletedPaths = <String>[];

  @override
  Future<String> save(
    String id,
    PersonalCouponPhotoSide side,
    String sourcePath,
  ) async {
    savedSides.add(side);
    return '/saved/$id-${side.name}.jpg';
  }

  @override
  Future<void> delete(String savedPath) async {
    deletedPaths.add(savedPath);
  }
}
