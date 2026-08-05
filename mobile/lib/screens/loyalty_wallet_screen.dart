import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:barcode_widget/barcode_widget.dart';

import '../loyalty_wallet.dart';
import '../personal_coupon_vault.dart';
import '../receipt_insights.dart';
import '../receipt_scan.dart';
import '../receipt_vault.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/guided_card_camera.dart';

class LoyaltyWalletScreen extends StatefulWidget {
  const LoyaltyWalletScreen({
    super.key,
    this.store,
    this.couponStore,
    this.receiptStore,
    this.receiptBudgetStore,
    this.receiptImagePicker,
    this.receiptScanner,
    this.loyaltyImagePicker,
    this.couponImagePicker,
    this.guidedCardCapture,
  });

  final LoyaltyWalletStore? store;
  final PersonalCouponVaultStore? couponStore;
  final ReceiptVaultStore? receiptStore;
  final ReceiptBudgetStore? receiptBudgetStore;
  final Future<String?> Function(ReceiptCaptureSource source)?
      receiptImagePicker;
  final ReceiptImageScanner? receiptScanner;
  final Future<String?> Function(
    LoyaltyCardPhotoSide side,
    LoyaltyCaptureSource source,
  )? loyaltyImagePicker;
  final Future<String?> Function(
    PersonalCouponPhotoSide side,
    PersonalCouponCaptureSource source,
  )? couponImagePicker;
  final GuidedCardCapture? guidedCardCapture;

  @override
  State<LoyaltyWalletScreen> createState() => _LoyaltyWalletScreenState();
}

class _LoyaltyWalletScreenState extends State<LoyaltyWalletScreen> {
  late final LoyaltyWalletStore _store = widget.store ?? LoyaltyWalletStore();
  late Future<List<LoyaltyCard>> _future = _store.load();
  final Set<String> _revealed = {};
  final Set<String> _busy = {};

  Future<String?> _pickLoyaltyPhoto(LoyaltyCardPhotoSide side) async {
    final source = await showModalBottomSheet<LoyaltyCaptureSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${side == LoyaltyCardPhotoSide.front ? 'Front' : 'Back'} card photo',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Take photo'),
                subtitle: const Text('Open the camera'),
                onTap: () =>
                    Navigator.pop(context, LoyaltyCaptureSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choose from device'),
                subtitle: const Text('Use an existing card photo'),
                onTap: () =>
                    Navigator.pop(context, LoyaltyCaptureSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !mounted) return null;
    try {
      if (widget.loyaltyImagePicker != null) {
        return await widget.loyaltyImagePicker!(side, source);
      }
      if (source == LoyaltyCaptureSource.camera) {
        final capture = widget.guidedCardCapture ?? captureGuidedCard;
        final label = side == LoyaltyCardPhotoSide.front ? 'Front' : 'Back';
        return await capture(
          context,
          title: '$label of loyalty card',
          instruction: 'Keep all four card edges inside the frame.',
        );
      }
      final image = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 88,
        maxWidth: 1800,
      );
      return image?.path;
    } on PlatformException catch (error) {
      if (mounted) {
        showNotice(
          context,
          error.message ?? 'Card photo access is unavailable.',
        );
      }
      return null;
    }
  }

  Future<void> _addCard() async {
    var program = '';
    var number = '';
    var note = '';
    var expiryDate = '';
    String? frontImagePath;
    String? backImagePath;
    final programController = TextEditingController();
    final expiryController = TextEditingController();
    final submitted = await showModalBottomSheet<
        ({
          String cardNumber,
          String expiryDate,
          String? frontImagePath,
          String? backImagePath,
          String note,
          String programName,
        })>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
              20, 4, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Add loyalty card',
                    style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 6),
                Text(
                  'The card number stays in secure storage on this device.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
                const SizedBox(height: 16),
                Text('Retailer quick picks',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        )),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final retailer in loyaltyProgramQuickPicks)
                      ChoiceChip(
                        key: Key('loyalty-quick-pick-$retailer'),
                        avatar: const Icon(Icons.storefront_outlined, size: 17),
                        label: Text(retailer),
                        selected: program == retailer,
                        onSelected: (_) => setSheetState(() {
                          program = retailer;
                          programController
                            ..text = retailer
                            ..selection = TextSelection.collapsed(
                              offset: retailer.length,
                            );
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: programController,
                  autofocus: true,
                  maxLength: 80,
                  onChanged: (value) => setSheetState(() => program = value),
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Program or retailer',
                    hintText: 'Smart Shopper',
                    prefixIcon: Icon(Icons.storefront_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  maxLength: 100,
                  autocorrect: false,
                  onChanged: (value) => setSheetState(() => number = value),
                  decoration: const InputDecoration(
                    labelText: 'Card number',
                    prefixIcon: Icon(Icons.credit_card_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('loyalty-expiry-date'),
                  controller: expiryController,
                  readOnly: true,
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime(now.year + 1, now.month, now.day),
                      firstDate: DateTime(now.year, now.month, now.day),
                      lastDate: DateTime(now.year + 20, 12, 31),
                      helpText: 'Choose card expiry',
                    );
                    if (picked == null) return;
                    setSheetState(() {
                      expiryDate = picked.toIso8601String().substring(0, 10);
                      expiryController.text = expiryDate;
                    });
                  },
                  decoration: InputDecoration(
                    labelText: 'Expiry date (optional)',
                    hintText: 'Choose date',
                    prefixIcon: const Icon(Icons.event_outlined),
                    suffixIcon: expiryDate.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear expiry date',
                            onPressed: () => setSheetState(() {
                              expiryDate = '';
                              expiryController.clear();
                            }),
                            icon: const Icon(Icons.close),
                          ),
                  ),
                ),
                const SizedBox(height: 16),
                Text('Card photos (optional)',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        )),
                const SizedBox(height: 4),
                Text(
                  'Save the front and barcode side as a checkout fallback. Photos stay on this device.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _CardPhotoPicker(
                        key: const Key('loyalty-front-photo'),
                        label: 'Front',
                        selected: frontImagePath != null,
                        onPressed: () async {
                          final path = await _pickLoyaltyPhoto(
                            LoyaltyCardPhotoSide.front,
                          );
                          if (path != null) {
                            setSheetState(() => frontImagePath = path);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _CardPhotoPicker(
                        key: const Key('loyalty-back-photo'),
                        label: 'Barcode side',
                        selected: backImagePath != null,
                        onPressed: () async {
                          final path = await _pickLoyaltyPhoto(
                            LoyaltyCardPhotoSide.back,
                          );
                          if (path != null) {
                            setSheetState(() => backImagePath = path);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  maxLength: 120,
                  onChanged: (value) => note = value,
                  decoration: const InputDecoration(
                    labelText: 'Note (optional)',
                    hintText: 'Household card',
                    prefixIcon: Icon(Icons.notes_outlined),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    key: const Key('save-loyalty-card'),
                    onPressed:
                        program.trim().isEmpty || number.trim().length < 4
                            ? null
                            : () => Navigator.pop(
                                  context,
                                  (
                                    programName: program.trim(),
                                    cardNumber: number.trim(),
                                    expiryDate: expiryDate,
                                    frontImagePath: frontImagePath,
                                    backImagePath: backImagePath,
                                    note: note.trim(),
                                  ),
                                ),
                    icon: const Icon(Icons.lock_outline),
                    label: const Text('Save securely'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    programController.dispose();
    expiryController.dispose();

    if (submitted == null || !mounted) return;
    try {
      final cards = await _store.add(
        programName: submitted.programName,
        cardNumber: submitted.cardNumber,
        note: submitted.note,
        expiryDate: submitted.expiryDate,
        frontImageSourcePath: submitted.frontImagePath,
        backImageSourcePath: submitted.backImagePath,
      );
      if (mounted) {
        setState(() {
          _future = Future.value(cards);
        });
      }
    } on FormatException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  Future<void> _remove(LoyaltyCard card) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove loyalty card?'),
        content: Text('${card.programName} will be removed from this device.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy.add(card.id));
    final cards = await _store.remove(card.id);
    if (mounted) {
      setState(() {
        _busy.remove(card.id);
        _revealed.remove(card.id);
        _future = Future.value(cards);
      });
    }
  }

  Future<void> _openCheckout(LoyaltyCard card) => Navigator.of(context).push(
        MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (context) => _LoyaltyCheckoutScreen(card: card),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<LoyaltyCard>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
            message: 'Loyalty cards are unavailable.',
            onRetry: () => setState(() {
              _future = _store.load();
            }),
          );
        }
        final cards = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ScreenHeader(
              eyebrow: 'Private on-device wallet',
              title: 'Cards, coupons and receipts',
              description:
                  'Keep loyalty numbers, private coupon codes and receipt photos together without sending them to Trolley Scout servers.',
              action: FilledButton.icon(
                onPressed: _addCard,
                icon: const Icon(Icons.add),
                label: const Text('Add card'),
              ),
            ),
            if (cards.isEmpty)
              EmptyCard(
                message: 'No loyalty cards saved on this device yet.',
                icon: Icons.credit_card_outlined,
                action: FilledButton(
                    onPressed: _addCard, child: const Text('Add first card')),
              )
            else
              for (final card in cards)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              color: TS.yellow,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.credit_card, color: TS.ink),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(card.programName,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w900)),
                                if (card.note != null)
                                  Text(card.note!,
                                      style: TextStyle(
                                          color: TS.mutedOf(context),
                                          fontSize: 12)),
                                if (card.expiryDate != null) ...[
                                  const SizedBox(height: 6),
                                  _LoyaltyExpiryBadge(card: card),
                                ],
                              ],
                            ),
                          ),
                          IconButton(
                            tooltip: 'Remove loyalty card',
                            onPressed: _busy.contains(card.id)
                                ? null
                                : () => _remove(card),
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      SelectableText(
                        _revealed.contains(card.id)
                            ? card.cardNumber
                            : maskLoyaltyNumber(card.cardNumber),
                        key: Key('loyalty-number-${card.id}'),
                        style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.2),
                      ),
                      const SizedBox(height: 10),
                      if (card.frontImagePath != null ||
                          card.backImagePath != null) ...[
                        Text(
                          '${card.frontImagePath != null && card.backImagePath != null ? '2 card photos' : '1 card photo'} saved on this device',
                          style: TextStyle(
                            color: TS.mutedOf(context),
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FilledButton.icon(
                            key: Key('checkout-loyalty-${card.id}'),
                            onPressed: () => _openCheckout(card),
                            icon: const Icon(Icons.qr_code_scanner, size: 18),
                            label: const Text('Use at checkout'),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => setState(() {
                              if (!_revealed.add(card.id)) {
                                _revealed.remove(card.id);
                              }
                            }),
                            icon: Icon(_revealed.contains(card.id)
                                ? Icons.visibility_off
                                : Icons.visibility),
                            label: Text(_revealed.contains(card.id)
                                ? 'Hide number'
                                : 'Reveal number'),
                          ),
                          OutlinedButton.icon(
                            key: Key('copy-loyalty-${card.id}'),
                            onPressed: () {
                              Clipboard.setData(
                                  ClipboardData(text: card.cardNumber));
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('Card number copied.')),
                              );
                            },
                            icon: const Icon(Icons.copy, size: 17),
                            label: const Text('Copy number'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
            const SizedBox(height: 14),
            _PersonalCouponPanel(
              store: widget.couponStore,
              imagePicker: widget.couponImagePicker,
              guidedCardCapture: widget.guidedCardCapture,
            ),
            const SizedBox(height: 20),
            _ReceiptVaultPanel(
              imagePicker: widget.receiptImagePicker,
              scanner: widget.receiptScanner,
              store: widget.receiptStore,
              budgetStore: widget.receiptBudgetStore,
            ),
          ],
        );
      },
    );
  }
}

class _CardPhotoPicker extends StatelessWidget {
  const _CardPhotoPicker({
    super.key,
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: selected ? '$label card photo attached' : 'Add $label card photo',
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(72),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              selected ? Icons.check_circle : Icons.add_a_photo_outlined,
              color: selected ? TS.greenOf(context) : null,
            ),
            const SizedBox(height: 6),
            Text(selected ? '$label attached' : 'Add $label'),
          ],
        ),
      ),
    );
  }
}

class _CouponPhotoPicker extends StatelessWidget {
  const _CouponPhotoPicker({
    super.key,
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: selected
            ? '$label coupon photo attached'
            : 'Add $label coupon photo',
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(72),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? Icons.check_circle : Icons.add_a_photo_outlined,
                color: selected ? TS.greenOf(context) : null,
              ),
              const SizedBox(height: 6),
              Text(selected ? '$label attached' : 'Add $label'),
            ],
          ),
        ),
      );
}

class _LoyaltyExpiryBadge extends StatelessWidget {
  const _LoyaltyExpiryBadge({required this.card});

  final LoyaltyCard card;

  @override
  Widget build(BuildContext context) {
    final state = loyaltyExpiryState(card.expiryDate);
    final (label, icon, color) = switch (state) {
      LoyaltyExpiryState.expired => (
          'Expired ${card.expiryDate}',
          Icons.error_outline,
          TS.redOf(context),
        ),
      LoyaltyExpiryState.expiringSoon => (
          'Expires soon: ${card.expiryDate}',
          Icons.schedule,
          TS.inkOf(context),
        ),
      LoyaltyExpiryState.active => (
          'Valid through ${card.expiryDate}',
          Icons.event_available_outlined,
          TS.greenOf(context),
        ),
      LoyaltyExpiryState.noExpiry => (
          'No expiry saved',
          Icons.event_outlined,
          TS.mutedOf(context),
        ),
    };
    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: state == LoyaltyExpiryState.expiringSoon
              ? TS.yellow.withValues(alpha: 0.62)
              : color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: state == LoyaltyExpiryState.expiringSoon
                ? TS.lineOf(context).withValues(alpha: 0.48)
                : color.withValues(alpha: 0.45),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoyaltyCheckoutScreen extends StatefulWidget {
  const _LoyaltyCheckoutScreen({required this.card});

  final LoyaltyCard card;

  @override
  State<_LoyaltyCheckoutScreen> createState() => _LoyaltyCheckoutScreenState();
}

class _LoyaltyCheckoutScreenState extends State<_LoyaltyCheckoutScreen> {
  late LoyaltyCardPhotoSide _photoSide = widget.card.backImagePath != null
      ? LoyaltyCardPhotoSide.back
      : LoyaltyCardPhotoSide.front;

  String? get _selectedPhoto => switch (_photoSide) {
        LoyaltyCardPhotoSide.front => widget.card.frontImagePath,
        LoyaltyCardPhotoSide.back => widget.card.backImagePath,
      };

  @override
  Widget build(BuildContext context) {
    final card = widget.card;
    final hasFront = card.frontImagePath != null;
    final hasBack = card.backImagePath != null;
    return Scaffold(
      key: const Key('loyalty-checkout-screen'),
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        surfaceTintColor: Colors.white,
        title: const Text('Checkout card'),
        leading: IconButton(
          tooltip: 'Close checkout card',
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
          children: [
            Text(
              card.programName,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w900,
                  ),
            ),
            if (card.expiryDate != null) ...[
              const SizedBox(height: 5),
              Text(
                switch (loyaltyExpiryState(card.expiryDate)) {
                  LoyaltyExpiryState.expired => 'Expired ${card.expiryDate}',
                  LoyaltyExpiryState.expiringSoon =>
                    'Expires soon: ${card.expiryDate}',
                  _ => 'Valid through ${card.expiryDate}',
                },
                style: TextStyle(
                  color: loyaltyExpiryState(card.expiryDate) ==
                          LoyaltyExpiryState.expired
                      ? Colors.red.shade800
                      : Colors.grey.shade700,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(height: 18),
            Semantics(
              key: const Key('loyalty-checkout-barcode'),
              label:
                  'Scannable barcode for ${card.programName}, card number ${card.cardNumber}',
              image: true,
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: Colors.black, width: 2),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: LayoutBuilder(
                  builder: (context, constraints) => BarcodeWidget(
                    barcode: Barcode.code128(),
                    data: card.cardNumber,
                    width: constraints.maxWidth,
                    height: 150,
                    drawText: false,
                    color: Colors.black,
                    backgroundColor: Colors.white,
                    errorBuilder: (context, error) => SizedBox(
                      height: 150,
                      child: Center(
                        child: Text(
                          'Show the card number to the cashier.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey.shade800),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            SelectableText(
              card.cardNumber,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.black,
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.3,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const Key('copy-checkout-card-number'),
              style: FilledButton.styleFrom(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: card.cardNumber));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Card number copied.')),
                );
              },
              icon: const Icon(Icons.copy, size: 18),
              label: const Text('Copy card number'),
            ),
            const SizedBox(height: 12),
            Text(
              'Turn the screen toward the scanner. If it does not read, show the saved barcode-side photo or the card number.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade700),
            ),
            if (hasFront || hasBack) ...[
              const SizedBox(height: 26),
              Text(
                'Card photo fallback',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: Colors.black,
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (hasBack)
                    ChoiceChip(
                      label: const Text('Barcode side'),
                      selected: _photoSide == LoyaltyCardPhotoSide.back,
                      onSelected: (_) => setState(
                        () => _photoSide = LoyaltyCardPhotoSide.back,
                      ),
                    ),
                  if (hasFront)
                    ChoiceChip(
                      label: const Text('Front'),
                      selected: _photoSide == LoyaltyCardPhotoSide.front,
                      onSelected: (_) => setState(
                        () => _photoSide = LoyaltyCardPhotoSide.front,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              if (_selectedPhoto != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.file(
                    File(_selectedPhoto!),
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => Container(
                      height: 180,
                      color: Colors.grey.shade200,
                      alignment: Alignment.center,
                      child: const Text(
                        'This card photo is unavailable.',
                        style: TextStyle(color: Colors.black),
                      ),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PersonalCouponPanel extends StatefulWidget {
  const _PersonalCouponPanel({
    this.store,
    this.imagePicker,
    this.guidedCardCapture,
  });

  final PersonalCouponVaultStore? store;
  final Future<String?> Function(
    PersonalCouponPhotoSide side,
    PersonalCouponCaptureSource source,
  )? imagePicker;
  final GuidedCardCapture? guidedCardCapture;

  @override
  State<_PersonalCouponPanel> createState() => _PersonalCouponPanelState();
}

class _PersonalCouponPanelState extends State<_PersonalCouponPanel> {
  late final PersonalCouponVaultStore _store =
      widget.store ?? PersonalCouponVaultStore();
  late Future<List<PersonalCoupon>> _future = _store.load();
  final Set<String> _busy = {};

  Future<String?> _pickPhoto(PersonalCouponPhotoSide side) async {
    final label = side == PersonalCouponPhotoSide.offer ? 'Offer' : 'Terms';
    final source = await showModalBottomSheet<PersonalCouponCaptureSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$label coupon photo',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Take photo'),
                subtitle: const Text('Open the camera'),
                onTap: () => Navigator.pop(
                  context,
                  PersonalCouponCaptureSource.camera,
                ),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choose from device'),
                subtitle: const Text('Use an existing coupon photo'),
                onTap: () => Navigator.pop(
                  context,
                  PersonalCouponCaptureSource.gallery,
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !mounted) return null;
    try {
      if (widget.imagePicker != null) {
        return await widget.imagePicker!(side, source);
      }
      if (source == PersonalCouponCaptureSource.camera) {
        final capture = widget.guidedCardCapture ?? captureGuidedCard;
        return await capture(
          context,
          title: '$label side of coupon',
          instruction: 'Keep all four coupon edges inside the frame.',
        );
      }
      final image = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 88,
        maxWidth: 1800,
      );
      return image?.path;
    } on PlatformException catch (error) {
      if (mounted) {
        showNotice(
          context,
          error.message ?? 'Coupon photo access is unavailable.',
        );
      }
      return null;
    }
  }

  Future<void> _addCoupon() async {
    var retailer = '';
    var code = '';
    var receivedDate = DateTime.now().toIso8601String().substring(0, 10);
    var validThrough = DateTime.now()
        .add(const Duration(days: 30))
        .toIso8601String()
        .substring(0, 10);
    var note = '';
    var terms = '';
    String? offerImagePath;
    String? termsImagePath;
    final receivedController = TextEditingController(text: receivedDate);
    final expiryController = TextEditingController(text: validThrough);
    final submitted = await showModalBottomSheet<
        ({
          String retailer,
          String code,
          String receivedDate,
          String expiry,
          String note,
          String terms,
          String? offerImagePath,
          String? termsImagePath,
        })>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            4,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Save private coupon',
                    style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 6),
                Text(
                  'For codes sent directly to you. Public reusable codes belong in Community vouchers.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('coupon-retailer'),
                  autofocus: true,
                  maxLength: 80,
                  textCapitalization: TextCapitalization.words,
                  onChanged: (value) => setSheetState(() => retailer = value),
                  decoration: const InputDecoration(
                    labelText: 'Retailer',
                    hintText: 'Woolworths',
                    prefixIcon: Icon(Icons.storefront_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('coupon-code'),
                  maxLength: 100,
                  autocorrect: false,
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (value) => setSheetState(() => code = value),
                  decoration: const InputDecoration(
                    labelText: 'Coupon code',
                    prefixIcon: Icon(Icons.confirmation_number_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('coupon-received-date'),
                  controller: receivedController,
                  readOnly: true,
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime.tryParse(receivedDate) ?? now,
                      firstDate: DateTime(now.year - 10),
                      lastDate: now,
                      helpText: 'Choose received date',
                    );
                    if (picked == null) return;
                    setSheetState(() {
                      receivedDate = picked.toIso8601String().substring(0, 10);
                      receivedController.text = receivedDate;
                    });
                  },
                  decoration: InputDecoration(
                    labelText: 'Received date (optional)',
                    prefixIcon: const Icon(Icons.calendar_today_outlined),
                    suffixIcon: receivedDate.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear received date',
                            onPressed: () => setSheetState(() {
                              receivedDate = '';
                              receivedController.clear();
                            }),
                            icon: const Icon(Icons.close),
                          ),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('coupon-expiry'),
                  controller: expiryController,
                  readOnly: true,
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime.tryParse(validThrough) ?? now,
                      firstDate: DateTime(now.year - 10),
                      lastDate: DateTime(now.year + 10, 12, 31),
                      helpText: 'Choose coupon expiry',
                    );
                    if (picked == null) return;
                    setSheetState(() {
                      validThrough = picked.toIso8601String().substring(0, 10);
                      expiryController.text = validThrough;
                    });
                  },
                  decoration: const InputDecoration(
                    labelText: 'Valid through',
                    prefixIcon: Icon(Icons.event_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('coupon-terms-summary'),
                  maxLength: 160,
                  maxLines: 2,
                  onChanged: (value) => terms = value,
                  decoration: const InputDecoration(
                    labelText: 'Terms or validity (optional)',
                    hintText: 'In store only, minimum spend R500',
                    prefixIcon: Icon(Icons.rule_outlined),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Coupon photos (optional)',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Keep the offer and terms as a checkout fallback. Photos stay on this device.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _CouponPhotoPicker(
                        key: const Key('coupon-offer-photo'),
                        label: 'Offer',
                        selected: offerImagePath != null,
                        onPressed: () async {
                          final path = await _pickPhoto(
                            PersonalCouponPhotoSide.offer,
                          );
                          if (path != null) {
                            setSheetState(() => offerImagePath = path);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _CouponPhotoPicker(
                        key: const Key('coupon-terms-photo'),
                        label: 'Terms',
                        selected: termsImagePath != null,
                        onPressed: () async {
                          final path = await _pickPhoto(
                            PersonalCouponPhotoSide.terms,
                          );
                          if (path != null) {
                            setSheetState(() => termsImagePath = path);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('coupon-note'),
                  maxLength: 160,
                  maxLines: 2,
                  onChanged: (value) => note = value,
                  decoration: const InputDecoration(
                    labelText: 'Note (optional)',
                    hintText: 'R100 off an online order',
                    prefixIcon: Icon(Icons.notes_outlined),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    key: const Key('save-private-coupon'),
                    onPressed: retailer.trim().isEmpty ||
                            code.trim().length < 2 ||
                            DateTime.tryParse(validThrough.trim()) == null
                        ? null
                        : () => Navigator.pop(
                              context,
                              (
                                retailer: retailer.trim(),
                                code: code.trim(),
                                receivedDate: receivedDate,
                                expiry: validThrough.trim(),
                                note: note.trim(),
                                terms: terms.trim(),
                                offerImagePath: offerImagePath,
                                termsImagePath: termsImagePath,
                              ),
                            ),
                    icon: const Icon(Icons.lock_outline),
                    label: const Text('Save on this device'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    receivedController.dispose();
    expiryController.dispose();
    if (submitted == null || !mounted) return;

    try {
      final coupons = await _store.add(
        retailerName: submitted.retailer,
        code: submitted.code,
        receivedDate: submitted.receivedDate,
        validThrough: submitted.expiry,
        note: submitted.note,
        terms: submitted.terms,
        offerImageSourcePath: submitted.offerImagePath,
        termsImageSourcePath: submitted.termsImagePath,
      );
      if (mounted) {
        setState(() {
          _future = Future.value(coupons);
        });
      }
    } on FormatException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  Future<void> _remove(PersonalCoupon coupon) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete private coupon?'),
        content:
            Text('${coupon.retailerName} will be removed from this device.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy.add(coupon.id));
    final coupons = await _store.remove(coupon.id);
    if (mounted) {
      setState(() {
        _busy.remove(coupon.id);
        _future = Future.value(coupons);
      });
    }
  }

  Future<void> _openCheckout(PersonalCoupon coupon) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (context) => _PersonalCouponCheckoutScreen(coupon: coupon),
        ),
      );

  @override
  Widget build(BuildContext context) => FutureBuilder<List<PersonalCoupon>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError || snapshot.data == null) {
            return ErrorPane(
              message: 'Private coupons are unavailable.',
              onRetry: () => setState(() {
                _future = _store.load();
              }),
            );
          }
          final coupons = snapshot.data!;
          return Column(
            key: const Key('personal-coupon-vault'),
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('PRIVATE COUPONS', style: TS.eyebrowOf(context)),
                        const SizedBox(height: 3),
                        Text(
                          'Your personal codes',
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                  ),
                  FilledButton.icon(
                    key: const Key('add-private-coupon'),
                    onPressed: _addCoupon,
                    icon: const Icon(Icons.confirmation_number_outlined),
                    label: const Text('Add coupon'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Codes and details stay in secure storage on this device.',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
              ),
              const SizedBox(height: 12),
              if (coupons.isEmpty)
                EmptyCard(
                  message: 'No private coupons saved on this device yet.',
                  icon: Icons.confirmation_number_outlined,
                  action: FilledButton(
                    onPressed: _addCoupon,
                    child: const Text('Add first coupon'),
                  ),
                )
              else
                for (final coupon in coupons)
                  PaperCard(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                coupon.retailerName,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w900),
                              ),
                            ),
                            if (coupon.isExpired)
                              const Chip(label: Text('Expired')),
                            IconButton(
                              tooltip: 'Delete private coupon',
                              onPressed: _busy.contains(coupon.id)
                                  ? null
                                  : () => _remove(coupon),
                              icon: const Icon(Icons.delete_outline),
                            ),
                          ],
                        ),
                        SelectableText(
                          coupon.code,
                          key: Key('private-coupon-code-${coupon.id}'),
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          'Valid through ${coupon.validThrough}',
                          style: TextStyle(
                            color: coupon.isExpired
                                ? TS.redOf(context)
                                : TS.mutedOf(context),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (coupon.receivedDate != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Received ${coupon.receivedDate}',
                            style: TextStyle(
                              color: TS.mutedOf(context),
                              fontSize: 12,
                            ),
                          ),
                        ],
                        if (coupon.terms != null) ...[
                          const SizedBox(height: 5),
                          Text(
                            coupon.terms!,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                        if (coupon.note != null) ...[
                          const SizedBox(height: 5),
                          Text(coupon.note!),
                        ],
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            FilledButton.icon(
                              key: Key('show-coupon-${coupon.id}'),
                              onPressed: () => _openCheckout(coupon),
                              icon: const Icon(Icons.qr_code_2, size: 18),
                              label: const Text('Show at checkout'),
                            ),
                            FilledButton.tonalIcon(
                              onPressed: () {
                                Clipboard.setData(
                                  ClipboardData(text: coupon.code),
                                );
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Coupon code copied.'),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.copy, size: 17),
                              label: const Text('Copy code'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
            ],
          );
        },
      );
}

class _PersonalCouponCheckoutScreen extends StatefulWidget {
  const _PersonalCouponCheckoutScreen({required this.coupon});

  final PersonalCoupon coupon;

  @override
  State<_PersonalCouponCheckoutScreen> createState() =>
      _PersonalCouponCheckoutScreenState();
}

class _PersonalCouponCheckoutScreenState
    extends State<_PersonalCouponCheckoutScreen> {
  late PersonalCouponPhotoSide _photoSide = widget.coupon.offerImagePath != null
      ? PersonalCouponPhotoSide.offer
      : PersonalCouponPhotoSide.terms;

  String? get _selectedPhoto => switch (_photoSide) {
        PersonalCouponPhotoSide.offer => widget.coupon.offerImagePath,
        PersonalCouponPhotoSide.terms => widget.coupon.termsImagePath,
      };

  @override
  Widget build(BuildContext context) {
    final coupon = widget.coupon;
    final hasOffer = coupon.offerImagePath != null;
    final hasTerms = coupon.termsImagePath != null;
    return Scaffold(
      key: const Key('personal-coupon-checkout-screen'),
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        surfaceTintColor: Colors.white,
        title: const Text('Checkout coupon'),
        leading: IconButton(
          tooltip: 'Close checkout coupon',
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
          children: [
            Text(
              coupon.retailerName,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: 5),
            Text(
              coupon.isExpired
                  ? 'Expired ${coupon.validThrough}'
                  : 'Valid through ${coupon.validThrough}',
              style: TextStyle(
                color: coupon.isExpired
                    ? Colors.red.shade800
                    : Colors.grey.shade700,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (coupon.terms != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Text(
                  coupon.terms!,
                  style: TextStyle(
                    color: Colors.grey.shade900,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
            if (coupon.isExpired) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Text(
                  'This coupon is past its saved expiry date. Check with the retailer before using it.',
                  style: TextStyle(
                    color: Colors.red.shade900,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 18),
            Semantics(
              key: const Key('personal-coupon-checkout-barcode'),
              label:
                  'Scannable coupon barcode for ${coupon.retailerName}, code ${coupon.code}',
              image: true,
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: Colors.black, width: 2),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: LayoutBuilder(
                  builder: (context, constraints) => BarcodeWidget(
                    barcode: Barcode.code128(),
                    data: coupon.code,
                    width: constraints.maxWidth,
                    height: 150,
                    drawText: false,
                    color: Colors.black,
                    backgroundColor: Colors.white,
                    errorBuilder: (context, error) => SizedBox(
                      height: 150,
                      child: Center(
                        child: Text(
                          'Show the coupon code to the cashier.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey.shade800),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            SelectableText(
              coupon.code,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.black,
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.3,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const Key('copy-checkout-coupon-code'),
              style: FilledButton.styleFrom(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: coupon.code));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Coupon code copied.')),
                );
              },
              icon: const Icon(Icons.copy, size: 18),
              label: const Text('Copy coupon code'),
            ),
            const SizedBox(height: 12),
            Text(
              'Turn the screen toward the scanner. If it does not read, show the saved offer photo or the code.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade700),
            ),
            if (hasOffer || hasTerms) ...[
              const SizedBox(height: 26),
              Text(
                'Coupon photo fallback',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: Colors.black,
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (hasOffer)
                    ChoiceChip(
                      label: const Text('Offer'),
                      selected: _photoSide == PersonalCouponPhotoSide.offer,
                      onSelected: (_) => setState(
                        () => _photoSide = PersonalCouponPhotoSide.offer,
                      ),
                    ),
                  if (hasTerms)
                    ChoiceChip(
                      label: const Text('Terms'),
                      selected: _photoSide == PersonalCouponPhotoSide.terms,
                      onSelected: (_) => setState(
                        () => _photoSide = PersonalCouponPhotoSide.terms,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              if (_selectedPhoto != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.file(
                    File(_selectedPhoto!),
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => Container(
                      height: 180,
                      color: Colors.grey.shade200,
                      alignment: Alignment.center,
                      child: const Text(
                        'This coupon photo is unavailable.',
                        style: TextStyle(color: Colors.black),
                      ),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

enum ReceiptCaptureSource { camera, gallery }

class _ReceiptVaultPanel extends StatefulWidget {
  const _ReceiptVaultPanel({
    this.store,
    this.budgetStore,
    this.imagePicker,
    this.scanner,
  });

  final ReceiptVaultStore? store;
  final ReceiptBudgetStore? budgetStore;
  final Future<String?> Function(ReceiptCaptureSource source)? imagePicker;
  final ReceiptImageScanner? scanner;

  @override
  State<_ReceiptVaultPanel> createState() => _ReceiptVaultPanelState();
}

class _ReceiptVaultPanelState extends State<_ReceiptVaultPanel> {
  late final ReceiptVaultStore _store = widget.store ?? ReceiptVaultStore();
  late final ReceiptBudgetStore _budgetStore =
      widget.budgetStore ?? ReceiptBudgetStore();
  late Future<List<ReceiptRecord>> _future = _store.load();
  late Future<ReceiptBudget?> _budgetFuture = _budgetStore.load();
  final Set<String> _busy = {};

  Future<void> _editBudget(
    List<ReceiptRecord> receipts,
    ReceiptBudget? current,
  ) async {
    final inferred = buildReceiptSpendInsights(receipts, budget: current);
    var currency = current?.currency ??
        (inferred.currency.isEmpty ? 'R' : inferred.currency);
    var amount = current?.amount.toStringAsFixed(2) ?? '';
    final submitted = await showModalBottomSheet<
        ({String currency, String amount, bool remove})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            4,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  current == null
                      ? 'Set monthly budget'
                      : 'Edit monthly budget',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 6),
                Text(
                  'Your budget stays on this device with your receipt totals.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: const Key('receipt-budget-currency'),
                  initialValue: currency,
                  maxLength: 8,
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (value) => setSheetState(() => currency = value),
                  decoration: const InputDecoration(
                    labelText: 'Currency',
                    hintText: 'R',
                    prefixIcon: Icon(Icons.currency_exchange_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  key: const Key('receipt-budget-amount'),
                  initialValue: amount,
                  autofocus: current == null,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (value) => setSheetState(() => amount = value),
                  decoration: const InputDecoration(
                    labelText: 'Monthly grocery budget',
                    hintText: '5000.00',
                    prefixIcon: Icon(Icons.savings_outlined),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    key: const Key('save-receipt-budget'),
                    onPressed: currency.trim().isEmpty ||
                            (parseReceiptMoney(amount)?.amount ?? 0) <= 0
                        ? null
                        : () => Navigator.pop(
                              context,
                              (
                                currency: currency.trim(),
                                amount: amount.trim(),
                                remove: false,
                              ),
                            ),
                    icon: const Icon(Icons.lock_outline),
                    label: const Text('Save budget'),
                  ),
                ),
                if (current != null) ...[
                  const SizedBox(height: 6),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      key: const Key('remove-receipt-budget'),
                      onPressed: () => Navigator.pop(
                        context,
                        (currency: '', amount: '', remove: true),
                      ),
                      child: const Text('Remove budget'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
    if (!mounted) return;
    if (submitted == null) return;
    if (submitted.remove) {
      await _budgetStore.clear();
      if (mounted) {
        setState(() {
          _budgetFuture = Future.value(null);
        });
      }
      return;
    }
    try {
      final budget = await _budgetStore.save(
        amountText: submitted.amount,
        currency: submitted.currency,
      );
      if (mounted) {
        setState(() {
          _budgetFuture = Future.value(budget);
        });
      }
    } on FormatException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  Future<String?> _pickImage(ReceiptCaptureSource source) async {
    if (widget.imagePicker != null) return widget.imagePicker!(source);
    final image = await ImagePicker().pickImage(
      source: source == ReceiptCaptureSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      imageQuality: 86,
      maxWidth: 1800,
    );
    return image?.path;
  }

  Future<void> _addReceipt() async {
    final source = await showModalBottomSheet<ReceiptCaptureSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Add receipt',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                'Choose a photo. It stays on this device.',
                style: TextStyle(color: TS.mutedOf(context)),
              ),
              const SizedBox(height: 14),
              ListTile(
                key: const Key('capture-receipt-camera'),
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(
                  context,
                  ReceiptCaptureSource.camera,
                ),
              ),
              ListTile(
                key: const Key('capture-receipt-gallery'),
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.pop(
                  context,
                  ReceiptCaptureSource.gallery,
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !mounted) return;

    final imagePath = await _pickImage(source);
    if (imagePath == null || imagePath.trim().isEmpty || !mounted) return;
    final details = await showModalBottomSheet<
        ({
          String retailer,
          String date,
          String total,
          String note,
          List<ReceiptLineItem> items,
        })>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _ReceiptDetailsSheet(
        imagePath: imagePath,
        scanner: widget.scanner ?? scanReceiptImage,
      ),
    );
    if (details == null || !mounted) return;

    try {
      final receipts = await _store.add(
        retailerName: details.retailer,
        purchaseDate: details.date,
        sourceImagePath: imagePath,
        totalText: details.total,
        note: details.note,
        items: details.items,
      );
      if (mounted) {
        setState(() {
          _future = Future.value(receipts);
        });
      }
    } on FormatException catch (error) {
      if (mounted) showNotice(context, error.message);
    } on FileSystemException catch (error) {
      if (mounted) {
        showNotice(
            context,
            error.message.isEmpty
                ? 'The receipt image could not be saved.'
                : error.message);
      }
    }
  }

  Future<void> _remove(ReceiptRecord receipt) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete receipt?'),
        content: Text(
          '${receipt.retailerName} and its photo will be removed from this device.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy.add(receipt.id));
    final receipts = await _store.remove(receipt.id);
    if (mounted) {
      setState(() {
        _busy.remove(receipt.id);
        _future = Future.value(receipts);
      });
    }
  }

  void _view(ReceiptRecord receipt) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520, maxHeight: 720),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 12, 8, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(receipt.retailerName,
                              style: Theme.of(context).textTheme.titleLarge),
                          Text(
                            receipt.purchaseDate,
                            style: TextStyle(color: TS.mutedOf(context)),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close receipt',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: TS.lineOf(context)),
              Flexible(
                child: InteractiveViewer(
                  minScale: 1,
                  maxScale: 5,
                  child: Image.file(
                    File(receipt.imagePath),
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => Padding(
                      padding: const EdgeInsets.all(36),
                      child: Icon(Icons.broken_image_outlined,
                          size: 48, color: TS.mutedOf(context)),
                    ),
                  ),
                ),
              ),
              if (receipt.items.isNotEmpty) ...[
                Divider(height: 1, color: TS.lineOf(context)),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('ITEMS READ', style: TS.eyebrowOf(context)),
                      const SizedBox(height: 8),
                      for (final item in receipt.items.take(5))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 5),
                          child: Row(
                            children: [
                              Expanded(child: Text(item.title)),
                              if (item.priceText != null)
                                Text(
                                  item.priceText!,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      if (receipt.items.length > 5)
                        Text(
                          '+${receipt.items.length - 5} more items saved',
                          style: TextStyle(color: TS.mutedOf(context)),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<ReceiptRecord>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError || snapshot.data == null) {
            return ErrorPane(
              message: 'Receipts are unavailable.',
              onRetry: () => setState(() {
                _future = _store.load();
              }),
            );
          }
          final receipts = snapshot.data!;
          return FutureBuilder<ReceiptBudget?>(
            future: _budgetFuture,
            builder: (context, budgetSnapshot) {
              if (budgetSnapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              final budget = budgetSnapshot.data;
              final insights =
                  buildReceiptSpendInsights(receipts, budget: budget);
              return Column(
                key: const Key('receipt-vault'),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('RECEIPTS', style: TS.eyebrowOf(context)),
                            const SizedBox(height: 3),
                            Text(
                              'Private proof of purchase',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w900),
                            ),
                          ],
                        ),
                      ),
                      FilledButton.icon(
                        key: const Key('add-receipt'),
                        onPressed: _addReceipt,
                        icon: const Icon(Icons.receipt_long_outlined),
                        label: const Text('Add receipt'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Photos, totals and read items stay on this device. Trolley Scout never uploads them.',
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
                  ),
                  const SizedBox(height: 12),
                  _ReceiptInsightsCard(
                    insights: insights,
                    budget: budget,
                    onEditBudget: () => _editBudget(receipts, budget),
                  ),
                  const SizedBox(height: 14),
                  if (receipts.isEmpty)
                    EmptyCard(
                      message: 'No receipts saved on this device yet.',
                      icon: Icons.receipt_long_outlined,
                      action: FilledButton(
                        onPressed: _addReceipt,
                        child: const Text('Add first receipt'),
                      ),
                    )
                  else
                    for (final receipt in receipts)
                      PaperCard(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: InkWell(
                          key: Key('receipt-${receipt.id}'),
                          onTap: () => _view(receipt),
                          borderRadius: BorderRadius.circular(TS.cardRadius),
                          child: Padding(
                            padding: const EdgeInsets.all(4),
                            child: Row(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: Image.file(
                                    File(receipt.imagePath),
                                    width: 62,
                                    height: 72,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      width: 62,
                                      height: 72,
                                      color: TS.surfaceSoftOf(context),
                                      child: Icon(Icons.receipt_long_outlined,
                                          color: TS.mutedOf(context)),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(receipt.retailerName,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w900)),
                                      const SizedBox(height: 3),
                                      Text(
                                        receipt.purchaseDate,
                                        style: TextStyle(
                                            color: TS.mutedOf(context),
                                            fontSize: 12),
                                      ),
                                      if (receipt.totalText != null) ...[
                                        const SizedBox(height: 4),
                                        Text(receipt.totalText!,
                                            style: TextStyle(
                                                color: TS.redOf(context),
                                                fontWeight: FontWeight.w900)),
                                      ],
                                      if (receipt.items.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          '${receipt.items.length} ${receipt.items.length == 1 ? 'item' : 'items'} read on-device',
                                          style: TextStyle(
                                            color: TS.mutedOf(context),
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Delete receipt',
                                  onPressed: _busy.contains(receipt.id)
                                      ? null
                                      : () => _remove(receipt),
                                  icon: const Icon(Icons.delete_outline),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                ],
              );
            },
          );
        },
      );
}

class _ReceiptDetailsSheet extends StatefulWidget {
  const _ReceiptDetailsSheet({
    required this.imagePath,
    required this.scanner,
  });

  final String imagePath;
  final ReceiptImageScanner scanner;

  @override
  State<_ReceiptDetailsSheet> createState() => _ReceiptDetailsSheetState();
}

class _ReceiptDetailsSheetState extends State<_ReceiptDetailsSheet> {
  late final TextEditingController _retailer;
  late final TextEditingController _date;
  late final TextEditingController _total;
  late final TextEditingController _note;
  late final TextEditingController _items;
  bool _scanning = true;
  bool _scanFoundData = false;

  @override
  void initState() {
    super.initState();
    _retailer = TextEditingController()..addListener(_refresh);
    _date = TextEditingController(
      text: DateTime.now().toIso8601String().substring(0, 10),
    )..addListener(_refresh);
    _total = TextEditingController();
    _note = TextEditingController();
    _items = TextEditingController();
    _readReceipt();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  Future<void> _readReceipt() async {
    ReceiptScanResult? scan;
    try {
      scan = await widget.scanner(widget.imagePath);
    } on PlatformException {
      scan = null;
    } catch (_) {
      scan = null;
    }
    if (!mounted) return;
    if (scan != null) {
      if (_retailer.text.trim().isEmpty && scan.retailerName != null) {
        _retailer.text = scan.retailerName!;
      }
      if (scan.purchaseDate != null) _date.text = scan.purchaseDate!;
      if (_total.text.trim().isEmpty && scan.totalText != null) {
        _total.text = scan.totalText!;
      }
      if (_items.text.trim().isEmpty && scan.items.isNotEmpty) {
        _items.text = scan.items
            .map(
              (item) => item.priceText == null || item.priceText!.isEmpty
                  ? item.title
                  : '${item.title}  ${item.priceText}',
            )
            .join('\n');
      }
    }
    setState(() {
      _scanning = false;
      _scanFoundData = scan?.hasData ?? false;
    });
  }

  bool get _canSave =>
      _retailer.text.trim().isNotEmpty &&
      DateTime.tryParse(_date.text.trim()) != null;

  void _save() {
    if (!_canSave) return;
    Navigator.pop(
      context,
      (
        retailer: _retailer.text.trim(),
        date: _date.text.trim(),
        total: _total.text.trim(),
        note: _note.text.trim(),
        items: parseEditableReceiptItems(_items.text),
      ),
    );
  }

  @override
  void dispose() {
    _retailer
      ..removeListener(_refresh)
      ..dispose();
    _date
      ..removeListener(_refresh)
      ..dispose();
    _total.dispose();
    _note.dispose();
    _items.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          4,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Receipt details',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 6),
              Text(
                'Review what was read before saving. The photo and purchase details stay on this device.',
                style: TextStyle(color: TS.mutedOf(context)),
              ),
              const SizedBox(height: 14),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: _scanning
                    ? Container(
                        key: const Key('receipt-scan-progress'),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: TS.surfaceSoftOf(context),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: TS.lineOf(context)),
                        ),
                        child: const Row(
                          children: [
                            SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Reading this receipt on your device…',
                                style: TextStyle(fontWeight: FontWeight.w800),
                              ),
                            ),
                          ],
                        ),
                      )
                    : Container(
                        key: Key(
                          _scanFoundData
                              ? 'receipt-scan-success'
                              : 'receipt-scan-manual',
                        ),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: TS.surfaceSoftOf(context),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: TS.lineOf(context)),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              _scanFoundData
                                  ? Icons.check_circle_outline
                                  : Icons.edit_note_outlined,
                              color: _scanFoundData
                                  ? TS.greenOf(context)
                                  : TS.mutedOf(context),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _scanFoundData
                                    ? 'Receipt read on-device. Check the fields and items below.'
                                    : 'We couldn’t read this receipt. Add the details manually and keep the photo as proof.',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('receipt-retailer'),
                controller: _retailer,
                maxLength: 80,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Retailer',
                  hintText: 'Pick n Pay',
                  prefixIcon: Icon(Icons.storefront_outlined),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                key: const Key('receipt-date'),
                controller: _date,
                keyboardType: TextInputType.datetime,
                decoration: const InputDecoration(
                  labelText: 'Purchase date',
                  hintText: 'YYYY-MM-DD',
                  prefixIcon: Icon(Icons.event_outlined),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                key: const Key('receipt-total'),
                controller: _total,
                maxLength: 40,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Total (optional)',
                  hintText: 'R 482.50',
                  prefixIcon: Icon(Icons.payments_outlined),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                key: const Key('receipt-items'),
                controller: _items,
                minLines: 3,
                maxLines: 7,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Items bought (optional)',
                  hintText: 'Milk 2L  R 34.99\nBrown bread  R 18.49',
                  helperText:
                      'One item per line. These items privately improve your deal ranking.',
                  prefixIcon: Icon(Icons.shopping_basket_outlined),
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                key: const Key('receipt-note'),
                controller: _note,
                maxLength: 160,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Note (optional)',
                  hintText: 'Monthly groceries',
                  prefixIcon: Icon(Icons.notes_outlined),
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  key: const Key('save-receipt'),
                  onPressed: _canSave ? _save : null,
                  icon: const Icon(Icons.lock_outline),
                  label: const Text('Save on this device'),
                ),
              ),
            ],
          ),
        ),
      );
}

class _ReceiptInsightsCard extends StatelessWidget {
  const _ReceiptInsightsCard({
    required this.insights,
    required this.budget,
    required this.onEditBudget,
  });

  final ReceiptSpendInsights insights;
  final ReceiptBudget? budget;
  final VoidCallback onEditBudget;

  @override
  Widget build(BuildContext context) {
    final hasTotals = insights.currentReceiptCount > 0;
    final budgetAmount = budget?.amount;
    final remaining =
        budgetAmount == null ? null : budgetAmount - insights.currentMonthTotal;
    final progress = budgetAmount == null || budgetAmount <= 0
        ? 0.0
        : (insights.currentMonthTotal / budgetAmount).clamp(0.0, 1.0);
    final currency = budget?.currency ?? insights.currency;
    final maxMonth = insights.monthlyTotals.fold<double>(
      0,
      (value, month) => month.total > value ? month.total : value,
    );

    return PaperCard(
      key: const Key('receipt-spend-coach'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: TS.yellow,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.insights_outlined, color: TS.ink),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('SPEND COACH', style: TS.eyebrowOf(context)),
                    Text(
                      'Your month from saved receipts',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
              OutlinedButton(
                key: const Key('edit-receipt-budget'),
                onPressed: onEditBudget,
                child: Text(budget == null ? 'Set budget' : 'Edit budget'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (!hasTotals) ...[
            Text(
              'Add a total to a receipt to see this month’s spend, average and top retailer.',
              style: TextStyle(color: TS.mutedOf(context)),
            ),
          ] else ...[
            Text(
              formatReceiptMoney(insights.currentMonthTotal, currency),
              key: const Key('receipt-current-month-total'),
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.merge(TS.display)
                  .copyWith(color: TS.redOf(context)),
            ),
            Text(
              'spent this month from ${insights.currentReceiptCount} ${insights.currentReceiptCount == 1 ? 'receipt' : 'receipts'}',
              style: TextStyle(color: TS.mutedOf(context)),
            ),
            if (budgetAmount != null && remaining != null) ...[
              const SizedBox(height: 14),
              Semantics(
                label:
                    '${(progress * 100).round()} percent of monthly grocery budget used',
                child: LinearProgressIndicator(
                  key: const Key('receipt-budget-progress'),
                  value: progress,
                  minHeight: 10,
                  borderRadius: BorderRadius.circular(999),
                  color:
                      remaining >= 0 ? TS.greenOf(context) : TS.redOf(context),
                  backgroundColor: TS.surfaceSoftOf(context),
                ),
              ),
              const SizedBox(height: 7),
              Text(
                remaining >= 0
                    ? '${formatReceiptMoney(remaining, currency)} left in your monthly budget'
                    : '${formatReceiptMoney(remaining.abs(), currency)} over your monthly budget',
                key: const Key('receipt-budget-status'),
                style: TextStyle(
                  color:
                      remaining >= 0 ? TS.mutedOf(context) : TS.redOf(context),
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _ReceiptMetric(
                  label: 'Average receipt',
                  value: formatReceiptMoney(insights.averageReceipt, currency),
                ),
                _ReceiptMetric(
                  label: 'Last month',
                  value:
                      formatReceiptMoney(insights.previousMonthTotal, currency),
                ),
                _ReceiptMetric(
                  label: 'Top retailer',
                  value: insights.topRetailer ?? 'No leader yet',
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text('Three-month view', style: TS.eyebrowOf(context)),
            const SizedBox(height: 8),
            for (final month in insights.monthlyTotals) ...[
              Row(
                children: [
                  SizedBox(
                    width: 34,
                    child: Text(
                      _monthLabel(month.month),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: maxMonth <= 0 ? 0 : month.total / maxMonth,
                        minHeight: 8,
                        color: TS.greenOf(context),
                        backgroundColor: TS.surfaceSoftOf(context),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 92,
                    child: Text(
                      formatReceiptMoney(month.total, currency),
                      textAlign: TextAlign.end,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 7),
            ],
          ],
          if (insights.priceMemory.isNotEmpty) ...[
            const SizedBox(height: 16),
            Divider(height: 1, color: TS.lineOf(context)),
            const SizedBox(height: 14),
            Row(
              children: [
                Icon(
                  Icons.history_toggle_off_outlined,
                  size: 20,
                  color: TS.redOf(context),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'YOUR PRICE MEMORY',
                    key: const Key('receipt-price-memory'),
                    style: TS.eyebrowOf(context),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Recent prices read from your receipts. Use them to judge the next deal.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
            ),
            const SizedBox(height: 10),
            for (final item in insights.priceMemory.take(5))
              Container(
                margin: const EdgeInsets.only(bottom: 7),
                padding: const EdgeInsets.symmetric(
                  horizontal: 11,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  color: TS.surfaceSoftOf(context),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: TS.lineOf(context)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            '${item.retailerName} · ${item.purchaseDate}',
                            style: TextStyle(
                              color: TS.mutedOf(context),
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      item.priceText,
                      style: TextStyle(
                        color: TS.greenOf(context),
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (insights.missingTotalCount > 0) ...[
            const SizedBox(height: 10),
            Text(
              '${insights.missingTotalCount} ${insights.missingTotalCount == 1 ? 'receipt is' : 'receipts are'} missing a total this month.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
            ),
          ],
          if (insights.excludedCurrencyCount > 0) ...[
            const SizedBox(height: 4),
            Text(
              '${insights.excludedCurrencyCount} receipt total uses another currency and is not included.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            'Calculated only on this device from totals and items you review.',
            style: TextStyle(color: TS.faintOf(context), fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _ReceiptMetric extends StatelessWidget {
  const _ReceiptMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        width: 136,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: TS.surfaceSoftOf(context),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: TS.lineOf(context)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(color: TS.mutedOf(context), fontSize: 11)),
            const SizedBox(height: 3),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ],
        ),
      );
}

String _monthLabel(DateTime month) => const [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ][month.month - 1];
