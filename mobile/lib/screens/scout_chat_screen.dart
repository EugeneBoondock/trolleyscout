import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../assisted_store_cart.dart';
import '../store_agent.dart';
import '../store_carts.dart';
import '../api.dart';
import '../theme.dart';
import '../widgets/catalogue_reader.dart';
import '../widgets/in_app_browser.dart';
import '../widgets/store_carts_sheet.dart';
import '../widgets/scout_mark.dart';
import '../widgets/scout_voice_sheet.dart';

typedef ScoutChatSender = Future<ScoutChatAnswer> Function(
  String message,
  List<ScoutChatTurn> history,
);
typedef ScoutGroceryTransfer = Future<void> Function(
  ScoutGroceryPlanItem item,
);

class ScoutChatScreen extends StatefulWidget {
  const ScoutChatScreen({
    super.key,
    required this.api,
    this.account,
    this.onUpgrade,
    this.sendMessage,
    this.transferItem,
  });

  final Api api;
  final MemberAccount? account;
  final VoidCallback? onUpgrade;
  final ScoutChatSender? sendMessage;
  final ScoutGroceryTransfer? transferItem;

  @override
  State<ScoutChatScreen> createState() => _ScoutChatScreenState();
}

class _ScoutChatScreenState extends State<ScoutChatScreen> {
  static const _groceryStorageKey = 'trolley-scout-grocery-plan-v1';
  static const _starterPrompts = [
    'Create a grocery list for the cheapest vegan food',
    'Show useful catalogues',
    'Find deals within my budget',
  ];

  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  final _scrollController = ScrollController();
  final List<_ScoutMessage> _messages = [];
  List<ScoutGroceryPlanItem> _groceryItems = [];
  ScoutGroceryPlan? _groceryPlan;
  var _sending = false;
  var _messageNumber = 0;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_handleComposerFocus);
    // The badge counts real store carts, so it has to follow them.
    StoreCartStore.instance.addListener(_onStoreCartsChanged);
    StoreCartStore.instance.load();
    _restoreGroceryPlan();
  }

  void _onStoreCartsChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _focusNode.removeListener(_handleComposerFocus);
    StoreCartStore.instance.removeListener(_onStoreCartsChanged);
    _controller.dispose();
    _focusNode.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  List<ScoutChatTurn> get _history => _messages
      .where((message) => !message.isError)
      .map((message) => ScoutChatTurn(
            role: message.role,
            text: message.text,
          ))
      .toList(growable: false)
      .reversed
      .take(8)
      .toList(growable: false)
      .reversed
      .toList(growable: false);

  Future<void> _ask(String value) async {
    final message = value.trim();
    if (message.isEmpty || _sending) return;

    final history = _history;
    final number = ++_messageNumber;
    _controller.clear();
    _focusNode.unfocus();
    setState(() {
      _sending = true;
      _messages.add(_ScoutMessage(
        id: 'user-$number',
        role: ScoutChatRole.user,
        text: message,
      ));
    });
    _scrollToEnd();

    try {
      final answer = await (widget.sendMessage ?? widget.api.scoutChat)(
        message,
        history,
      );
      if (!mounted) return;
      setState(() {
        if (answer.groceryPlan != null) {
          _groceryPlan = answer.groceryPlan;
          _groceryItems = _mergeGroceryItems(
            _groceryItems,
            answer.groceryPlan!.items,
          );
        }
        _messages.add(_ScoutMessage(
          answer: answer,
          id: 'assistant-$number',
          role: ScoutChatRole.assistant,
          text: answer.reply,
        ));
      });
    } on ApiException catch (error) {
      _showError(number, error.message, retryPrompt: message);
    } catch (_) {
      _showError(
        number,
        'Mr Scout could not answer right now. Please try again.',
        retryPrompt: message,
      );
    } finally {
      if (mounted) {
        setState(() => _sending = false);
        _scrollToEnd();
      }
    }
  }

  void _showError(
    int number,
    String message, {
    required String retryPrompt,
  }) {
    if (!mounted) return;
    setState(() {
      _messages.add(_ScoutMessage(
        id: 'assistant-error-$number',
        role: ScoutChatRole.assistant,
        text: message,
        isError: true,
        retryPrompt: retryPrompt,
      ));
    });
  }

  void _handleComposerFocus() {
    if (!_focusNode.hasFocus) return;
    Future<void>.delayed(const Duration(milliseconds: 180), _scrollToEnd);
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: MediaQuery.of(context).disableAnimations
            ? Duration.zero
            : const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
      );
    });
  }

  Future<void> _restoreGroceryPlan() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_groceryStorageKey);
    if (stored == null || stored.isEmpty || !mounted) return;

    try {
      final decoded = jsonDecode(stored);
      if (decoded is! Map) return;
      final plan = ScoutGroceryPlan.fromJson(
        Map<String, dynamic>.from(decoded),
      );
      if (!mounted) return;
      setState(() {
        _groceryPlan = plan;
        _groceryItems = plan.items;
      });
    } catch (_) {
      await prefs.remove(_groceryStorageKey);
    }
  }

  Future<void> _transferGroceryItem(ScoutGroceryPlanItem item) async {
    if (widget.transferItem != null) {
      return widget.transferItem!(item);
    }

    await widget.api.saveDealToBasket(
      Deal(
        capturedAt: DateTime.now().toUtc().toIso8601String(),
        evidenceText: item.assumption,
        id: item.id,
        imageUrl: item.imageUrl,
        previousPriceText: item.previousPriceText,
        priceText: item.priceText,
        productUrl: item.productUrl,
        retailerId: item.retailerId,
        retailerName: item.retailerName,
        savingText: item.promotionText,
        sourceLabel: 'Mr Scout grocery plan',
        sourceUrl: item.sourceUrl,
        title: item.title,
      ),
      quantity: item.quantity,
    );
  }

  /// The basket button counts what is actually sitting in shop carts, and
  /// falls back to the temporary grocery list when nothing has been added yet.
  int get _cartBadgeCount {
    final inStores = StoreCartStore.instance.totalItemCount;
    return inStores > 0 ? inStores : _groceryItems.length;
  }

  Future<void> _openCarts() async {
    await StoreCartStore.instance.load();
    if (!mounted) return;
    // A built grocery list with nothing yet added is still the useful thing to
    // open, so it wins until a shop cart exists.
    if (StoreCartStore.instance.carts.isEmpty && _groceryItems.isNotEmpty) {
      await _openGroceryPlan();
      return;
    }
    if (!mounted) return;
    await showStoreCartsSheet(context);
  }

  Future<void> _openGroceryPlan() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _GroceryPlannerSheet(
        items: _groceryItems,
        plan: _groceryPlan,
        storageKey: _groceryStorageKey,
        onChanged: (items) {
          if (!mounted) return;
          setState(() => _groceryItems = items);
        },
        onTransfer: _transferGroceryItem,
      ),
    );
  }

  bool get _voiceAllowed {
    final account = widget.account;
    if (account == null) return false;
    return account.isAdmin ||
        (account.planStatus == 'active' && account.planId != 'free');
  }

  Future<void> _openVoiceChat() async {
    if (_voiceAllowed) {
      return showScoutVoiceSheet(
        context,
        api: widget.api,
        surface: 'scout',
      );
    }

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: TS.lineOf(context),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Center(
              child: AnimatedScoutMark(
                motion: ScoutMarkMotion.scout,
                size: 72,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Talk with Mr Scout',
              textAlign: TextAlign.center,
              style:
                  Theme.of(context).textTheme.headlineSmall?.merge(TS.display),
            ),
            const SizedBox(height: 8),
            Text(
              'Voice conversations are included with Scout, Household, Organisation, and Developers plans.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: TS.mutedOf(context),
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              key: const ValueKey('mr-scout-voice-upgrade'),
              onPressed: widget.onUpgrade == null
                  ? null
                  : () {
                      Navigator.of(context).pop();
                      widget.onUpgrade!();
                    },
              icon: const Icon(Icons.workspace_premium_outlined),
              label: const Text('See Scout plans'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final horizontalPadding =
        MediaQuery.sizeOf(context).width < 360 ? 10.0 : 14.0;
    final headerInScroll = MediaQuery.textScalerOf(context).scale(1) >= 1.6 ||
        MediaQuery.sizeOf(context).height < 620;
    return Column(
      children: [
        if (!headerInScroll) _buildHeader(context),
        Expanded(
          child: CustomScrollView(
            key: const ValueKey('mr-scout-conversation'),
            controller: _scrollController,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            slivers: [
              if (headerInScroll)
                SliverToBoxAdapter(child: _buildHeader(context)),
              if (_messages.isEmpty && !_sending)
                if (headerInScroll)
                  SliverToBoxAdapter(
                    child: _EmptyState(
                      prompts: _starterPrompts,
                      sending: _sending,
                      onSelected: _ask,
                    ),
                  )
                else
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _EmptyState(
                      prompts: _starterPrompts,
                      sending: _sending,
                      onSelected: _ask,
                    ),
                  )
              else
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    horizontalPadding,
                    18,
                    horizontalPadding,
                    20,
                  ),
                  sliver: SliverList.list(
                    children: [
                      for (final message in _messages)
                        Align(
                          alignment: Alignment.topCenter,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 760),
                            child: _MessageView(
                              message: message,
                              sending: _sending,
                              onFollowUp: _ask,
                            ),
                          ),
                        ),
                      if (_sending)
                        Align(
                          alignment: Alignment.topCenter,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 760),
                            child: const _ThinkingRow(),
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        _Composer(
          controller: _controller,
          focusNode: _focusNode,
          sending: _sending,
          onSend: _ask,
        ),
      ],
    );
  }

  Widget _buildHeader(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final showStatus =
        MediaQuery.sizeOf(context).width >= 500 && textScale < 1.5;
    return DecoratedBox(
      key: const ValueKey('mr-scout-header'),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border(
          bottom: BorderSide(color: TS.lineSoftOf(context), width: 1),
        ),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0x52000000)
                : const Color(0x101C1710),
            offset: const Offset(0, 3),
            blurRadius: 10,
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 11),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: TS.yellow,
                      border: Border.all(color: TS.ink, width: 1.5),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: const AnimatedScoutMark(
                      motion: ScoutMarkMotion.scout,
                      size: 38,
                    ),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Mr Scout',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.merge(TS.display),
                        ),
                        if (textScale < 1.5) ...[
                          const SizedBox(height: 2),
                          Text(
                            'Your personal shopping scout',
                            style: TextStyle(
                              color: TS.mutedOf(context),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Semantics(
                    button: true,
                    label: _voiceAllowed
                        ? 'Open Mr Scout voice chat'
                        : 'Mr Scout voice, available on Scout plans',
                    child: IconButton.filledTonal(
                      key: const ValueKey('mr-scout-voice-button'),
                      tooltip:
                          _voiceAllowed ? 'Voice chat' : 'Voice chat · Scout+',
                      onPressed: _openVoiceChat,
                      icon: Badge(
                        isLabelVisible: !_voiceAllowed,
                        smallSize: 7,
                        backgroundColor: TS.redOf(context),
                        child: const Icon(Icons.mic_rounded),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Semantics(
                    button: true,
                    label: 'Open store carts, ${_cartBadgeCount} items',
                    child: IconButton.filledTonal(
                      key: const ValueKey('mr-scout-grocery-button'),
                      tooltip: 'Store carts',
                      onPressed: _openCarts,
                      icon: Badge(
                        isLabelVisible: _cartBadgeCount > 0,
                        label: Text('$_cartBadgeCount'),
                        backgroundColor: TS.redOf(context),
                        textColor:
                            Theme.of(context).brightness == Brightness.light
                                ? Colors.white
                                : TS.ink,
                        child: const Icon(Icons.shopping_basket_outlined),
                      ),
                    ),
                  ),
                  if (showStatus) ...[
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: TS.surfaceSoftOf(context),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: TS.greenOf(context),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Ready',
                            style: TextStyle(
                              color: TS.inkOf(context),
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

List<ScoutGroceryPlanItem> _mergeGroceryItems(
  List<ScoutGroceryPlanItem> current,
  List<ScoutGroceryPlanItem> incoming,
) {
  final merged = <String, ScoutGroceryPlanItem>{
    for (final item in current) item.id: item,
  };
  for (final item in incoming) {
    merged[item.id] = item;
  }
  return merged.values.toList(growable: false);
}

class _GroceryPlannerSheet extends StatefulWidget {
  const _GroceryPlannerSheet({
    required this.items,
    required this.plan,
    required this.storageKey,
    required this.onChanged,
    required this.onTransfer,
  });

  final List<ScoutGroceryPlanItem> items;
  final ScoutGroceryPlan? plan;
  final String storageKey;
  final ValueChanged<List<ScoutGroceryPlanItem>> onChanged;
  final ScoutGroceryTransfer onTransfer;

  @override
  State<_GroceryPlannerSheet> createState() => _GroceryPlannerSheetState();
}

class _GroceryPlannerSheetState extends State<_GroceryPlannerSheet> {
  late List<ScoutGroceryPlanItem> _items;
  final Set<String> _transferring = {};

  @override
  void initState() {
    super.initState();
    _items = List.of(widget.items);
  }

  int get _totalCents => _items.fold(
        0,
        (total, item) => total + item.unitPriceCents * item.quantity,
      );

  void _replace(ScoutGroceryPlanItem item, int quantity) {
    setState(() {
      _items = [
        for (final current in _items)
          if (current.id == item.id)
            current.copyWithQuantity(quantity)
          else
            current,
      ];
    });
    widget.onChanged(List.unmodifiable(_items));
  }

  void _remove(ScoutGroceryPlanItem item) {
    setState(() => _items.removeWhere((current) => current.id == item.id));
    widget.onChanged(List.unmodifiable(_items));
  }

  Future<void> _save() async {
    final template = widget.plan;
    final plan = ScoutGroceryPlan(
      assumptions: template?.assumptions ?? const [],
      currencyCode: template?.currencyCode ?? 'ZAR',
      items: _items,
      maxStores: template?.maxStores ?? 3,
      missingItems: template?.missingItems ?? const [],
      storeCount: _items.map((item) => item.retailerId).toSet().length,
      subtotalCents: _totalCents,
      subtotalText: _formatGroceryMoney(
        _totalCents,
        template?.currencyCode ?? 'ZAR',
      ),
      totalCents: _totalCents,
      totalText: _formatGroceryMoney(
        _totalCents,
        template?.currencyCode ?? 'ZAR',
      ),
      tradeOffs: template?.tradeOffs ?? const [],
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(widget.storageKey, jsonEncode(plan.toJson()));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Grocery list saved on this device.')),
    );
  }

  Future<void> _transfer(ScoutGroceryPlanItem item) async {
    setState(() => _transferring.add(item.id));
    try {
      await widget.onTransfer(item);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${item.title} transferred to your basket.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${item.title} could not be transferred right now.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _transferring.remove(item.id));
    }
  }

  /// The store's checkout page, derived from any usable product link.
  Uri? _checkoutUriForStore(List<ScoutGroceryPlanItem> groceryItems) {
    for (final item in groceryItems) {
      final uri = Uri.tryParse(item.productUrl.trim());
      if (uri != null &&
          (uri.scheme == 'https' || uri.scheme == 'http') &&
          uri.host.isNotEmpty) {
        return checkoutUriFor(uri);
      }
    }
    return null;
  }

  Future<void> _openCheckout(
    String retailerName,
    List<ScoutGroceryPlanItem> groceryItems,
  ) async {
    final checkout = _checkoutUriForStore(groceryItems);
    if (checkout == null) return;
    await showInAppBrowser(
      context,
      checkout.toString(),
      title: '$retailerName checkout',
    );
  }

  Future<void> _shopStore(
    String retailerName,
    List<ScoutGroceryPlanItem> groceryItems,
  ) async {
    final assistedItems = groceryItems
        .map((item) => AssistedStoreCartItem.tryCreate(
              title: item.title,
              productUrl: item.productUrl,
              quantity: item.quantity,
              priceText: item.priceText,
            ))
        .whereType<AssistedStoreCartItem>()
        .toList(growable: false);
    if (assistedItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This store does not have usable product links yet.'),
        ),
      );
      return;
    }
    // Mr Scout drives the shop itself, in the shopper's own signed-in session,
    // and narrates every step. The one-tap helper stays as the fallback for
    // platforms where an agent cannot reach the page.
    final agentItems = assistedItems
        .map((item) => AgentItemPlan(
              title: item.title,
              productUri: item.productUri,
              quantity: item.quantity,
            ))
        .toList(growable: false);
    await showInAppBrowser(
      context,
      assistedItems.first.productUri.toString(),
      title: 'Shop $retailerName',
      assistedItems: assistedItems,
      agentItems: agentItems,
    );
  }

  @override
  Widget build(BuildContext context) {
    final currencyCode = widget.plan?.currencyCode ?? 'ZAR';
    final grouped = <String, List<ScoutGroceryPlanItem>>{};
    for (final item in _items) {
      grouped.putIfAbsent(item.retailerName, () => []).add(item);
    }

    return FractionallySizedBox(
      heightFactor: 0.94,
      child: Column(
        key: const ValueKey('mr-scout-grocery-sheet'),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 10, 10),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    color: TS.yellow,
                    border: Border.all(color: TS.ink),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.shopping_basket_outlined,
                    color: TS.ink,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Mr Scout grocery list',
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display),
                      ),
                      Text(
                        '${_items.length} items across ${grouped.length} stores',
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Close grocery list',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: TS.lineSoftOf(context)),
          Expanded(
            child: _items.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.playlist_add_rounded,
                            size: 48,
                            color: TS.mutedOf(context),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Your temporary grocery list is empty.',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Ask Mr Scout for the cheapest meat, vegetables, vegan food, or another grocery plan.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: TS.mutedOf(context)),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView(
                    key: const ValueKey('mr-scout-grocery-items'),
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
                    children: [
                      for (final entry in grouped.entries) ...[
                        _GroceryStoreHeader(
                          name: entry.key,
                          itemCount: entry.value.length,
                          onShop: () => _shopStore(entry.key, entry.value),
                          onCheckout: _checkoutUriForStore(entry.value) == null
                              ? null
                              : () => _openCheckout(entry.key, entry.value),
                          subtotal: _formatGroceryMoney(
                            entry.value.fold(
                              0,
                              (total, item) =>
                                  total + item.unitPriceCents * item.quantity,
                            ),
                            currencyCode,
                          ),
                        ),
                        const SizedBox(height: 8),
                        for (final item in entry.value)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _GroceryItemCard(
                              item: item,
                              lineTotal: _formatGroceryMoney(
                                item.unitPriceCents * item.quantity,
                                currencyCode,
                              ),
                              transferring: _transferring.contains(item.id),
                              onDecrease: item.quantity <= 1
                                  ? null
                                  : () => _replace(item, item.quantity - 1),
                              onIncrease: () =>
                                  _replace(item, item.quantity + 1),
                              onRemove: () => _remove(item),
                              onTransfer: () => _transfer(item),
                            ),
                          ),
                      ],
                      if (widget.plan != null) ...[
                        _GroceryNotes(
                          assumptions: widget.plan!.assumptions,
                          missingItems: widget.plan!.missingItems,
                          tradeOffs: widget.plan!.tradeOffs,
                        ),
                      ],
                    ],
                  ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: TS.surfaceOf(context),
              border: Border(
                top: BorderSide(color: TS.lineSoftOf(context)),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Overall total',
                          style: TextStyle(
                            color: TS.mutedOf(context),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      Text(
                        _formatGroceryMoney(_totalCents, currencyCode),
                        key: const ValueKey('mr-scout-grocery-total'),
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _items.isEmpty
                              ? null
                              : () {
                                  setState(() => _items = []);
                                  widget.onChanged(const []);
                                },
                          icon: const Icon(Icons.delete_sweep_outlined),
                          label: const Text('Clear'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton.icon(
                          key: const ValueKey('mr-scout-grocery-save'),
                          onPressed: _items.isEmpty ? null : _save,
                          icon: const Icon(Icons.save_outlined),
                          label: const Text('Save list'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GroceryStoreHeader extends StatelessWidget {
  const _GroceryStoreHeader({
    required this.name,
    required this.itemCount,
    required this.onShop,
    required this.subtotal,
    this.onCheckout,
  });

  final int itemCount;
  final String name;
  final VoidCallback onShop;
  final String subtotal;

  /// Jumps straight to the retailer's cart once items have been added.
  final VoidCallback? onCheckout;

  @override
  Widget build(BuildContext context) {
    final keyName = name
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    return Column(
      key: ValueKey('grocery-store-$name'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(Icons.storefront_outlined, size: 19),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                name,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
            Text(
              subtotal,
              style: TextStyle(
                color: TS.mutedOf(context),
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        const SizedBox(height: 7),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                key: ValueKey('grocery-shop-$keyName'),
                onPressed: onShop,
                icon: const Icon(Icons.add_shopping_cart_rounded, size: 18),
                label: const Text(
                  'Shop this store',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ),
            if (onCheckout != null) ...[
              const SizedBox(width: 7),
              Expanded(
                child: FilledButton.icon(
                  key: ValueKey('grocery-checkout-$keyName'),
                  onPressed: onCheckout,
                  icon: const Icon(Icons.shopping_cart_checkout_rounded,
                      size: 18),
                  label: const Text(
                    'Checkout',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Text(
            '$itemCount ${itemCount == 1 ? 'product' : 'products'} guided in one retailer session',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: TS.mutedOf(context),
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _GroceryItemCard extends StatelessWidget {
  const _GroceryItemCard({
    required this.item,
    required this.lineTotal,
    required this.transferring,
    required this.onDecrease,
    required this.onIncrease,
    required this.onRemove,
    required this.onTransfer,
  });

  final ScoutGroceryPlanItem item;
  final String lineTotal;
  final bool transferring;
  final VoidCallback? onDecrease;
  final VoidCallback onIncrease;
  final VoidCallback onRemove;
  final VoidCallback onTransfer;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: ValueKey('grocery-item-${item.id}'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(11),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 66,
                height: 66,
                child: item.imageUrl == null
                    ? ColoredBox(
                        color: TS.surfaceSoftOf(context),
                        child: Icon(
                          Icons.local_grocery_store_outlined,
                          color: TS.mutedOf(context),
                        ),
                      )
                    : Image.network(
                        item.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => ColoredBox(
                          color: TS.surfaceSoftOf(context),
                          child: Icon(
                            Icons.local_grocery_store_outlined,
                            color: TS.mutedOf(context),
                          ),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.group.toUpperCase(),
                    style: TS.eyebrowOf(context).copyWith(fontSize: 10),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.title,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 7,
                    runSpacing: 3,
                    children: [
                      Text(
                        '${item.priceText} each',
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (item.promotionText != null)
                        Text(
                          item.promotionText!,
                          style: TextStyle(
                            color: TS.greenOf(context),
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      IconButton.outlined(
                        visualDensity: VisualDensity.compact,
                        tooltip: 'Decrease quantity',
                        onPressed: onDecrease,
                        icon: const Icon(Icons.remove, size: 18),
                      ),
                      Text(
                        '${item.quantity}',
                        key: ValueKey('grocery-quantity-${item.id}'),
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      IconButton.outlined(
                        visualDensity: VisualDensity.compact,
                        tooltip: 'Increase quantity',
                        onPressed: onIncrease,
                        icon: const Icon(Icons.add, size: 18),
                      ),
                      Text(
                        lineTotal,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      IconButton(
                        tooltip: 'Remove ${item.title}',
                        onPressed: onRemove,
                        icon: const Icon(Icons.delete_outline_rounded),
                      ),
                      OutlinedButton.icon(
                        key: ValueKey('grocery-transfer-${item.id}'),
                        onPressed: transferring ? null : onTransfer,
                        icon: transferring
                            ? const SizedBox.square(
                                dimension: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.move_to_inbox_outlined),
                        label: const Text('Transfer'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroceryNotes extends StatelessWidget {
  const _GroceryNotes({
    required this.assumptions,
    required this.missingItems,
    required this.tradeOffs,
  });

  final List<String> assumptions;
  final List<String> missingItems;
  final List<String> tradeOffs;

  @override
  Widget build(BuildContext context) {
    if (assumptions.isEmpty && missingItems.isEmpty && tradeOffs.isEmpty) {
      return const SizedBox.shrink();
    }
    return Container(
      key: const ValueKey('mr-scout-grocery-notes'),
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: TS.surfaceSoftOf(context),
        borderRadius: BorderRadius.circular(TS.controlRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (assumptions.isNotEmpty)
            _GroceryNoteGroup(
              title: 'List assumptions',
              values: assumptions,
            ),
          if (missingItems.isNotEmpty)
            _GroceryNoteGroup(
              title: 'Missing or unavailable',
              values: missingItems,
            ),
          if (tradeOffs.isNotEmpty)
            _GroceryNoteGroup(
              title: 'Trade-offs',
              values: tradeOffs,
            ),
        ],
      ),
    );
  }
}

class _GroceryNoteGroup extends StatelessWidget {
  const _GroceryNoteGroup({
    required this.title,
    required this.values,
  });

  final String title;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 3),
          for (final value in values)
            Text(
              '• $value',
              style: TextStyle(
                color: TS.mutedOf(context),
                height: 1.35,
              ),
            ),
        ],
      ),
    );
  }
}

String _formatGroceryMoney(int cents, String currencyCode) {
  final amount = (cents / 100).toStringAsFixed(2);
  return switch (currencyCode.toUpperCase()) {
    'ZAR' => 'R$amount',
    'USD' => '\$$amount',
    'GBP' => '£$amount',
    'EUR' => '€$amount',
    _ => '${currencyCode.toUpperCase()} $amount',
  };
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.prompts,
    required this.sending,
    required this.onSelected,
  });

  final List<String> prompts;
  final bool sending;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 28, 18, 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: Column(
            key: const ValueKey('mr-scout-empty'),
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: TS.yellow,
                  border: Border.all(color: TS.ink, width: 2),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [
                    BoxShadow(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0x66000000)
                          : const Color(0x1F1C1710),
                      offset: const Offset(0, 5),
                      blurRadius: 14,
                    ),
                  ],
                ),
                child: const AnimatedScoutMark(
                  motion: ScoutMarkMotion.scout,
                  size: 62,
                ),
              ),
              const SizedBox(height: 22),
              Text(
                'What are you shopping for?',
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.merge(TS.display),
              ),
              const SizedBox(height: 9),
              Text(
                'Ask Mr Scout to compare deals, find catalogue pages, or work within your budget.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: TS.mutedOf(context),
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 22),
              _StarterPrompts(
                prompts: prompts,
                sending: sending,
                onSelected: onSelected,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScoutMessage {
  const _ScoutMessage({
    required this.id,
    required this.role,
    required this.text,
    this.answer,
    this.isError = false,
    this.retryPrompt,
  });

  final ScoutChatAnswer? answer;
  final String id;
  final bool isError;
  final ScoutChatRole role;
  final String text;
  final String? retryPrompt;
}

class _MessageView extends StatelessWidget {
  const _MessageView({
    required this.message,
    required this.sending,
    required this.onFollowUp,
  });

  final _ScoutMessage message;
  final bool sending;
  final ValueChanged<String> onFollowUp;

  @override
  Widget build(BuildContext context) {
    final assistant = message.role == ScoutChatRole.assistant;
    return Semantics(
      container: true,
      label: assistant ? 'Mr Scout says' : 'You said',
      child: Padding(
        key: ValueKey('scout-message-${message.id}'),
        padding: const EdgeInsets.only(bottom: 14),
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (!assistant) {
              return Align(
                alignment: Alignment.centerRight,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: constraints.maxWidth * 0.84,
                  ),
                  child: _bubble(context, assistant: false),
                ),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: TS.yellow,
                        border: Border.all(color: TS.ink),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: const AnimatedScoutMark(size: 28),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(left: 2, bottom: 5),
                            child: Text(
                              'MR SCOUT',
                              style: TS.eyebrowOf(context).copyWith(
                                    fontSize: 10,
                                    letterSpacing: 1.1,
                                  ),
                            ),
                          ),
                          _bubble(context, assistant: true),
                        ],
                      ),
                    ),
                  ],
                ),
                if (message.answer != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: _RecommendationContent(
                      answer: message.answer!,
                      sending: sending,
                      onFollowUp: onFollowUp,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _bubble(BuildContext context, {required bool assistant}) {
    final errorColor = TS.redOf(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 12),
      decoration: BoxDecoration(
        color: assistant
            ? message.isError
                ? errorColor.withValues(alpha: 0.11)
                : TS.surfaceOf(context)
            : TS.yellow,
        border: Border.all(
          color: message.isError ? errorColor : TS.lineSoftOf(context),
          width: assistant ? 1.25 : 1.75,
        ),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(assistant ? 10 : 19),
          topRight: Radius.circular(assistant ? 19 : 10),
          bottomLeft: const Radius.circular(19),
          bottomRight: const Radius.circular(19),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (message.isError) ...[
                Icon(Icons.error_outline_rounded, color: errorColor, size: 21),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  message.text,
                  style: TextStyle(
                    color: assistant ? TS.inkOf(context) : TS.ink,
                    fontSize: 15,
                    height: 1.42,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (message.isError && message.retryPrompt != null) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              key: ValueKey('scout-retry-${message.id}'),
              onPressed:
                  sending ? null : () => onFollowUp.call(message.retryPrompt!),
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Try again'),
              style: OutlinedButton.styleFrom(
                foregroundColor: TS.inkOf(context),
                side: BorderSide(color: errorColor),
                visualDensity: VisualDensity.compact,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RecommendationContent extends StatelessWidget {
  const _RecommendationContent({
    required this.answer,
    required this.sending,
    required this.onFollowUp,
  });

  final ScoutChatAnswer answer;
  final bool sending;
  final ValueChanged<String> onFollowUp;

  @override
  Widget build(BuildContext context) {
    final cartAction = answer.cartAction;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (cartAction != null && cartAction.isUsable) ...[
          _CartActionCard(action: cartAction),
          const SizedBox(height: 14),
        ],
        if (answer.deals.isNotEmpty) ...[
          _RecommendationLabel(
            icon: Icons.local_offer_outlined,
            label: answer.deals.length == 1
                ? 'Recommended deal'
                : '${answer.deals.length} recommended deals',
          ),
          const SizedBox(height: 8),
          _ResponsiveCardRail(
            key: const ValueKey('scout-deal-rail'),
            itemCount: answer.deals.length,
            baseHeight: 306,
            accessibleHeight: 438,
            itemBuilder: (_, index) =>
                _ScoutDealCard(deal: answer.deals[index]),
          ),
        ],
        if (answer.catalogues.isNotEmpty) ...[
          const SizedBox(height: 16),
          _RecommendationLabel(
            icon: Icons.menu_book_outlined,
            label: answer.catalogues.length == 1
                ? 'Useful catalogue'
                : '${answer.catalogues.length} useful catalogues',
          ),
          const SizedBox(height: 8),
          _ResponsiveCardRail(
            key: const ValueKey('scout-catalogue-rail'),
            itemCount: answer.catalogues.length,
            baseHeight: 276,
            accessibleHeight: 410,
            itemBuilder: (_, index) =>
                _ScoutCatalogueCard(catalogue: answer.catalogues[index]),
          ),
        ],
        if (answer.followUps.isNotEmpty) ...[
          const SizedBox(height: 16),
          const _RecommendationLabel(
            icon: Icons.auto_awesome_outlined,
            label: 'Keep scouting',
          ),
          const SizedBox(height: 8),
          if (MediaQuery.textScalerOf(context).scale(1) >= 1.6)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final followUp in answer.followUps)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _WidePromptButton(
                      label: followUp,
                      icon: Icons.arrow_upward_rounded,
                      onPressed:
                          sending ? null : () => onFollowUp.call(followUp),
                    ),
                  ),
              ],
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final followUp in answer.followUps)
                  ActionChip(
                    avatar: const Icon(Icons.arrow_upward, size: 16),
                    label: Text(followUp),
                    onPressed: sending ? null : () => onFollowUp.call(followUp),
                    side: BorderSide(color: TS.lineSoftOf(context), width: 1.5),
                    backgroundColor: TS.surfaceOf(context),
                    labelStyle: TextStyle(
                      color: TS.inkOf(context),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
              ],
            ),
        ],
      ],
    );
  }
}

class _RecommendationLabel extends StatelessWidget {
  const _RecommendationLabel({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: TS.redOf(context), size: 18),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: TS.inkOf(context),
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

typedef _ScoutCardBuilder = Widget Function(BuildContext context, int index);

class _ResponsiveCardRail extends StatelessWidget {
  const _ResponsiveCardRail({
    super.key,
    required this.itemCount,
    required this.baseHeight,
    required this.accessibleHeight,
    required this.itemBuilder,
  });

  final int itemCount;
  final double baseHeight;
  final double accessibleHeight;
  final _ScoutCardBuilder itemBuilder;

  @override
  Widget build(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    return LayoutBuilder(
      builder: (context, constraints) {
        final stackCards = textScale >= 1.6 || constraints.maxWidth < 300;
        if (stackCards) {
          return Column(
            children: [
              for (var index = 0; index < itemCount; index++) ...[
                SizedBox(
                  width: double.infinity,
                  height: accessibleHeight,
                  child: itemBuilder(context, index),
                ),
                if (index != itemCount - 1) const SizedBox(height: 12),
              ],
            ],
          );
        }

        final availableWidth = constraints.maxWidth;
        final cardWidth = itemCount == 1
            ? availableWidth
            : (availableWidth * 0.84).clamp(224.0, 286.0).toDouble();
        final railHeight = baseHeight + ((textScale - 1).clamp(0, 0.5) * 64);
        return SizedBox(
          width: double.infinity,
          height: railHeight,
          child: ListView.separated(
            key: ValueKey('scout-rich-card-list-$itemCount'),
            primary: false,
            padding: const EdgeInsets.symmetric(horizontal: 1),
            scrollDirection: Axis.horizontal,
            itemCount: itemCount,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, index) => SizedBox(
              width: cardWidth,
              child: itemBuilder(context, index),
            ),
          ),
        );
      },
    );
  }
}

class _ScoutDealCard extends StatelessWidget {
  const _ScoutDealCard({required this.deal});

  final ScoutChatDealCard deal;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Card(
        key: ValueKey('scout-deal-card-${deal.id}'),
        clipBehavior: Clip.antiAlias,
        margin: EdgeInsets.zero,
        child: InkWell(
          onTap: () => showInAppBrowser(
            context,
            deal.productUrl,
            title: deal.retailerName,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 112,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    deal.imageUrl == null
                        ? _CardImageFallback(
                            icon: Icons.local_offer_outlined,
                            label: deal.retailerName,
                          )
                        : Image.network(
                            deal.imageUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _CardImageFallback(
                              icon: Icons.local_offer_outlined,
                              label: deal.retailerName,
                            ),
                          ),
                    if (deal.soldOut)
                      Positioned(
                        left: 8,
                        top: 8,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: TS.redOf(context),
                            borderRadius:
                                BorderRadius.circular(TS.controlRadius),
                          ),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            child: Text(
                              'SOLD OUT',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: .5,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        deal.retailerName.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TS.eyebrowOf(context).copyWith(fontSize: 10),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        deal.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          height: 1.18,
                        ),
                      ),
                      const Spacer(),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Text(
                              deal.priceText,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: TS.redOf(context),
                                fontSize: 19,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          if (deal.previousPriceText != null)
                            Text(
                              deal.previousPriceText!,
                              style: TextStyle(
                                color: TS.mutedOf(context),
                                decoration: TextDecoration.lineThrough,
                                fontSize: 12,
                              ),
                            ),
                        ],
                      ),
                      if (deal.savingText != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          deal.savingText!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: TS.greenOf(context),
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                      const SizedBox(height: 7),
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              deal.soldOut ? 'Check product' : 'View deal',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: TS.inkOf(context),
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(
                            Icons.open_in_new,
                            size: 14,
                            color: TS.inkOf(context),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScoutCatalogueCard extends StatelessWidget {
  const _ScoutCatalogueCard({required this.catalogue});

  final ScoutChatCatalogueCard catalogue;

  @override
  Widget build(BuildContext context) {
    final imageUrl = catalogue.imageUrl ??
        (catalogue.pageImageUrls.isEmpty
            ? null
            : catalogue.pageImageUrls.first);
    return SizedBox(
      width: double.infinity,
      child: Card(
        key: ValueKey('scout-catalogue-card-${catalogue.id}'),
        clipBehavior: Clip.antiAlias,
        margin: EdgeInsets.zero,
        child: InkWell(
          onTap: () => showCatalogueReader(context, catalogue.toCatalogue()),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: imageUrl == null
                    ? _CardImageFallback(
                        icon: Icons.menu_book_outlined,
                        label: catalogue.retailerName,
                      )
                    : Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => _CardImageFallback(
                          icon: Icons.menu_book_outlined,
                          label: catalogue.retailerName,
                        ),
                      ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      catalogue.retailerName.toUpperCase(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TS.eyebrowOf(context).copyWith(fontSize: 10),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      catalogue.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      catalogue.pageCount <= 0
                          ? 'Open catalogue'
                          : catalogue.pageCount == 1
                              ? '1 page'
                              : '${catalogue.pageCount} pages',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CardImageFallback extends StatelessWidget {
  const _CardImageFallback({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: TS.surfaceSoftOf(context),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: TS.mutedOf(context), size: 34),
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: TS.mutedOf(context),
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

class _StarterPrompts extends StatelessWidget {
  const _StarterPrompts({
    required this.prompts,
    required this.sending,
    required this.onSelected,
  });

  final List<String> prompts;
  final bool sending;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.textScalerOf(context).scale(1) >= 1.6) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final prompt in prompts)
            Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: _WidePromptButton(
                label: prompt,
                icon: Icons.auto_awesome_outlined,
                onPressed: sending ? null : () => onSelected(prompt),
              ),
            ),
        ],
      );
    }
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final prompt in prompts)
          ActionChip(
            avatar: const Icon(Icons.auto_awesome_outlined, size: 16),
            label: Text(prompt),
            onPressed: sending ? null : () => onSelected(prompt),
            side: BorderSide(color: TS.lineSoftOf(context), width: 1.5),
            backgroundColor: TS.surfaceOf(context),
            labelStyle: TextStyle(
              color: TS.inkOf(context),
              fontWeight: FontWeight.w700,
            ),
          ),
      ],
    );
  }
}

class _WidePromptButton extends StatelessWidget {
  const _WidePromptButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: TS.inkOf(context),
        backgroundColor: TS.surfaceOf(context),
        side: BorderSide(color: TS.lineSoftOf(context), width: 1.5),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              label,
              textAlign: TextAlign.left,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                height: 1.25,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ThinkingRow extends StatelessWidget {
  const _ThinkingRow();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: 'Mr Scout is checking live offers',
      child: Padding(
        key: const ValueKey('mr-scout-loading'),
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: TS.yellow,
                border: Border.all(color: TS.ink),
                borderRadius: BorderRadius.circular(11),
              ),
              child: const AnimatedScoutMark(
                motion: ScoutMarkMotion.scout,
                size: 28,
              ),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: TS.surfaceOf(context),
                  border:
                      Border.all(color: TS.lineSoftOf(context), width: 1.25),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(10),
                    topRight: Radius.circular(19),
                    bottomLeft: Radius.circular(19),
                    bottomRight: Radius.circular(19),
                  ),
                ),
                child: Row(
                  children: [
                    SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: TS.redOf(context),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Checking live offers…',
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatefulWidget {
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.sending,
    required this.onSend,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool sending;
  final ValueChanged<String> onSend;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_refresh);
  }

  @override
  void didUpdateWidget(covariant _Composer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_refresh);
      widget.controller.addListener(_refresh);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final canSend = !widget.sending && widget.controller.text.trim().isNotEmpty;
    final showDisclaimer = MediaQuery.textScalerOf(context).scale(1) < 1.6;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 9, 10, 8),
        decoration: BoxDecoration(
          color: TS.bgOf(context),
          border: Border(
            top: BorderSide(color: TS.lineSoftOf(context), width: 1),
          ),
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0x4D000000)
                  : const Color(0x121C1710),
              offset: const Offset(0, -3),
              blurRadius: 10,
            ),
          ],
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                DecoratedBox(
                  key: const ValueKey('mr-scout-composer'),
                  decoration: BoxDecoration(
                    color: TS.surfaceOf(context),
                    border:
                        Border.all(color: TS.lineSoftOf(context), width: 1.5),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? const Color(0x3D000000)
                            : const Color(0x101C1710),
                        offset: const Offset(0, 3),
                        blurRadius: 9,
                      ),
                    ],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 7, 7, 7),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: TextField(
                            key: const ValueKey('mr-scout-message'),
                            controller: widget.controller,
                            focusNode: widget.focusNode,
                            enabled: !widget.sending,
                            maxLength: 600,
                            maxLines: 5,
                            minLines: 1,
                            textCapitalization: TextCapitalization.sentences,
                            textInputAction: TextInputAction.send,
                            onSubmitted: canSend ? widget.onSend : null,
                            style: TextStyle(
                              color: TS.inkOf(context),
                              height: 1.35,
                              fontWeight: FontWeight.w600,
                            ),
                            decoration: InputDecoration(
                              counterText: '',
                              hintText: 'Message Mr Scout',
                              hintStyle: TextStyle(
                                color: TS.mutedOf(context),
                                fontWeight: FontWeight.w600,
                              ),
                              filled: false,
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              disabledBorder: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 3,
                                vertical: 10,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 7),
                        Tooltip(
                          message: 'Send message',
                          child: IconButton.filled(
                            key: const ValueKey('mr-scout-send'),
                            onPressed: canSend
                                ? () => widget.onSend(widget.controller.text)
                                : null,
                            style: IconButton.styleFrom(
                              backgroundColor: TS.yellow,
                              foregroundColor: TS.ink,
                              disabledBackgroundColor:
                                  TS.surfaceSoftOf(context),
                              disabledForegroundColor: TS.mutedOf(context),
                              minimumSize: const Size(48, 48),
                              shape: const CircleBorder(),
                              side: BorderSide(
                                color: canSend
                                    ? TS.lineOf(context)
                                    : TS.lineSoftOf(context),
                                width: 1.5,
                              ),
                            ),
                            icon: widget.sending
                                ? SizedBox.square(
                                    dimension: 19,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.4,
                                      color: TS.inkOf(context),
                                    ),
                                  )
                                : const Icon(Icons.arrow_upward_rounded),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (showDisclaimer) ...[
                  const SizedBox(height: 6),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text(
                      'Mr Scout can make mistakes. Check store prices and availability.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 10,
                        height: 1.25,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The button that sets Mr Scout loose on a shop's own website.
///
/// It sits under the answer rather than firing automatically: driving a
/// shopper's live store session is something they should start deliberately,
/// and the card says exactly what will happen before they do.
class _CartActionCard extends StatelessWidget {
  const _CartActionCard({required this.action});

  final ScoutCartAction action;

  Future<void> _run(BuildContext context) async {
    final items = action.items
        .map((item) {
          final uri = Uri.tryParse(item.productUrl);
          if (uri == null || !uri.isScheme('https') && !uri.isScheme('http')) {
            return null;
          }
          return AgentItemPlan(
            title: item.title,
            productUri: uri,
            quantity: item.quantity,
            searchTerm: item.searchTerm,
          );
        })
        .whereType<AgentItemPlan>()
        .toList(growable: false);
    if (items.isEmpty) return;
    await showInAppBrowser(
      context,
      items.first.productUri.toString(),
      title: 'Adding to ${action.retailerName}',
      agentItems: items,
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = action.items;
    final item = items.first;
    final totalUnits = items.fold<int>(0, (sum, line) => sum + line.quantity);
    return Container(
      key: const ValueKey('scout-cart-action'),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 13),
      decoration: BoxDecoration(
        border: Border.all(color: TS.lineSoftOf(context)),
        borderRadius: BorderRadius.circular(TS.panelRadius),
        color: TS.surfaceOf(context),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: TS.yellow,
                  border: Border.all(color: TS.ink),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.smart_toy_outlined,
                    color: TS.ink, size: 18),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      items.length == 1
                          ? 'I CAN ADD THIS FOR YOU'
                          : 'I CAN ADD ALL ${items.length} FOR YOU',
                      style: TS.eyebrowOf(context).copyWith(fontSize: 9),
                    ),
                    Text(
                      items.length == 1
                          ? item.title
                          : '${items.length} items · $totalUnits in the cart',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    Text(
                      [
                        action.retailerName,
                        if (items.length == 1 && item.priceText != null)
                          item.priceText!,
                        if (items.length == 1 && item.quantity > 1)
                          'x${item.quantity}',
                      ].join('  ·  '),
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (items.length > 1) ...[
            const SizedBox(height: 9),
            for (final line in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  children: [
                    Text(
                      '${line.quantity}x',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        line.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                    if (line.priceText != null)
                      Text(
                        line.priceText!,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                  ],
                ),
              ),
          ],
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const ValueKey('scout-cart-action-run'),
              onPressed: () => _run(context),
              icon: const Icon(Icons.add_shopping_cart_rounded),
              label: Text(
                items.length == 1
                    ? 'Add to my ${action.retailerName} cart'
                    : 'Add all ${items.length} to my ${action.retailerName} cart',
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Opens ${action.retailerName} in the app, in the session you are '
            'signed into, and presses their add-to-cart. You still check out '
            'yourself — Mr Scout never pays.',
            style: TextStyle(
              color: TS.mutedOf(context),
              fontSize: 10,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}
