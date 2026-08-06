import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'store_agent_scripts.dart';

/// What Mr Scout is doing right now. The shopper watches these go by, so they
/// are named for what they mean to a person, not for the code path.
enum AgentPhase {
  idle,
  checkingSession,
  needsSignIn,
  opening,
  reading,
  clearingOverlays,
  choosingVariant,
  adding,
  confirming,
  finished,
  failed,
  cancelled,
}

extension AgentPhaseLabel on AgentPhase {
  String get label => switch (this) {
        AgentPhase.idle => 'Ready',
        AgentPhase.checkingSession => 'Checking your store session',
        AgentPhase.needsSignIn => 'Waiting for you to sign in',
        AgentPhase.opening => 'Opening the product page',
        AgentPhase.reading => 'Reading the page',
        AgentPhase.clearingOverlays => 'Closing store pop-ups',
        AgentPhase.choosingVariant => 'Choosing the option',
        AgentPhase.adding => 'Adding to cart',
        AgentPhase.confirming => 'Confirming the cart updated',
        AgentPhase.finished => 'All done',
        AgentPhase.failed => 'Stopped',
        AgentPhase.cancelled => 'Cancelled',
      };
}

/// One line in the live activity list.
@immutable
class AgentLogEntry {
  const AgentLogEntry({
    required this.message,
    required this.phase,
    this.isError = false,
  });

  final String message;
  final AgentPhase phase;
  final bool isError;
}

/// One thing the shopper asked for.
@immutable
class AgentItemPlan {
  const AgentItemPlan({
    required this.title,
    required this.productUri,
    this.quantity = 1,
    this.variant,
  });

  final String title;
  final Uri productUri;
  final int quantity;

  /// A size or colour the shopper named. Empty means "whatever is in stock".
  final String? variant;
}

/// What the agent could see on the page, in one snapshot.
@immutable
class AgentPageState {
  const AgentPageState({
    this.ready = false,
    this.url,
    this.signedIn = false,
    this.accountLabel,
    this.onLoginPage = false,
    this.cartCount,
    this.outOfStock = false,
    this.needsVariant = false,
    this.addControlCount = 0,
    this.blockedAddControl = false,
    this.overlayCount = 0,
  });

  factory AgentPageState.fromJson(Map<String, dynamic> json) => AgentPageState(
        ready: json['ready'] == true,
        url: json['url']?.toString(),
        signedIn: json['signedIn'] == true,
        accountLabel: json['accountLabel']?.toString(),
        onLoginPage: json['onLoginPage'] == true,
        cartCount: json['cartCount'] is num
            ? (json['cartCount'] as num).toInt()
            : null,
        outOfStock: json['outOfStock'] == true,
        needsVariant: json['needsVariant'] == true,
        addControlCount: json['addControlCount'] is num
            ? (json['addControlCount'] as num).toInt()
            : 0,
        blockedAddControl: json['blockedAddControl'] == true,
        overlayCount: json['overlayCount'] is num
            ? (json['overlayCount'] as num).toInt()
            : 0,
      );

  final bool ready;
  final String? url;
  final bool signedIn;
  final String? accountLabel;
  final bool onLoginPage;
  final int? cartCount;
  final bool outOfStock;
  final bool needsVariant;
  final int addControlCount;
  final bool blockedAddControl;
  final int overlayCount;
}

/// How one item ended up.
enum AgentItemOutcome {
  added,
  outOfStock,
  variantUnavailable,
  noControl,
  failed
}

@immutable
class AgentItemResult {
  const AgentItemResult({
    required this.item,
    required this.outcome,
    required this.addedQuantity,
    this.note,
  });

  final AgentItemPlan item;
  final AgentItemOutcome outcome;
  final int addedQuantity;
  final String? note;
}

/// The page the agent drives. An interface rather than the WebView itself so
/// the whole state machine can be tested against scripted pages.
abstract class AgentBrowser {
  Future<void> load(Uri uri);

  /// Runs a script and returns whatever the bridge handed back.
  Future<Object?> evaluate(String script);
}

/// Drives a store's own website the way the shopper would: their session,
/// their cart, their prices. Nothing is bought — the agent stops at the cart.
class StoreAgentRunner extends ChangeNotifier {
  StoreAgentRunner({
    required AgentBrowser browser,
    required List<AgentItemPlan> items,
    Future<void> Function(Duration)? wait,
    this.pollAttempts = 25,
    this.maxVariantAttempts = 4,
    this.accountPath = '',
    this.pollInterval = const Duration(milliseconds: 400),
  })  : _browser = browser,
        _items = List.unmodifiable(items),
        _wait = wait ?? Future<void>.delayed;

  final AgentBrowser _browser;
  final List<AgentItemPlan> _items;
  final Future<void> Function(Duration) _wait;
  final int pollAttempts;

  /// How many options to try before giving up on a product whose sizes only
  /// reveal their stock once chosen.
  final int maxVariantAttempts;

  /// An account-only path on this shop, used to tell a signed-in session from
  /// a signed-out one when the header has no words to read.
  final String accountPath;
  final Duration pollInterval;

  final List<AgentLogEntry> _log = [];
  final List<AgentItemResult> _results = [];
  AgentPhase _phase = AgentPhase.idle;
  int _itemIndex = 0;
  bool _cancelled = false;
  Completer<bool>? _signInGate;

  List<AgentLogEntry> get log => List.unmodifiable(_log);
  List<AgentItemResult> get results => List.unmodifiable(_results);
  AgentPhase get phase => _phase;
  List<AgentItemPlan> get items => _items;
  int get itemIndex => _itemIndex;
  AgentItemPlan? get currentItem =>
      _itemIndex < _items.length ? _items[_itemIndex] : null;
  bool get awaitingSignIn => _phase == AgentPhase.needsSignIn;
  bool get isRunning =>
      _phase != AgentPhase.idle &&
      _phase != AgentPhase.finished &&
      _phase != AgentPhase.failed &&
      _phase != AgentPhase.cancelled;
  int get addedCount =>
      _results.fold(0, (total, result) => total + result.addedQuantity);

  void _emit(AgentPhase phase, String message, {bool isError = false}) {
    _phase = phase;
    _log.add(AgentLogEntry(message: message, phase: phase, isError: isError));
    notifyListeners();
  }

  /// The shopper finished signing in inside the same browser and tapped
  /// continue.
  void continueAfterSignIn() {
    final gate = _signInGate;
    if (gate != null && !gate.isCompleted) gate.complete(true);
  }

  void cancel() {
    _cancelled = true;
    final gate = _signInGate;
    if (gate != null && !gate.isCompleted) gate.complete(false);
    notifyListeners();
  }

  Future<void> run() async {
    if (_items.isEmpty) {
      _emit(AgentPhase.finished, 'Nothing to add.');
      return;
    }
    try {
      for (var index = 0; index < _items.length; index++) {
        if (_cancelled) break;
        _itemIndex = index;
        final item = _items[index];
        final result = await _runItem(item);
        _results.add(result);
        notifyListeners();
      }
    } catch (error) {
      _emit(AgentPhase.failed, 'The store stopped responding. $error',
          isError: true);
      await _clearHighlight();
      return;
    }
    await _clearHighlight();
    if (_cancelled) {
      _emit(AgentPhase.cancelled, 'Stopped. Nothing else was touched.');
      return;
    }
    final added = addedCount;
    final missed = _results.where((r) => r.outcome != AgentItemOutcome.added);
    _emit(
      missed.isEmpty ? AgentPhase.finished : AgentPhase.failed,
      missed.isEmpty
          ? 'Added $added ${added == 1 ? 'item' : 'items'} to your cart. Check out in the store when you are ready.'
          : 'Added $added of ${_items.length}. ${missed.length} needs your eyes.',
      isError: missed.isNotEmpty,
    );
  }

  Future<AgentItemResult> _runItem(AgentItemPlan item) async {
    _emit(AgentPhase.opening, 'Opening ${item.title}');
    await _browser.load(item.productUri);

    final opened = await _waitForReadyPage();
    if (opened == null) {
      return AgentItemResult(
        item: item,
        outcome: AgentItemOutcome.failed,
        addedQuantity: 0,
        note: 'The page never finished loading.',
      );
    }
    var state = opened;

    if (state.overlayCount > 0) {
      _emit(AgentPhase.clearingOverlays, 'Closing a store pop-up');
      await _evaluateJson(agentDismissOverlaysScript());
      state = await _readState() ?? state;
    }

    _emit(AgentPhase.checkingSession, 'Checking your ${_host(item)} session');
    if (!state.signedIn || state.onLoginPage) {
      final signedIn = await _askForSignIn(item);
      if (!signedIn) {
        return AgentItemResult(
          item: item,
          outcome: AgentItemOutcome.failed,
          addedQuantity: 0,
          note: 'Sign-in was not completed.',
        );
      }
      state = await _readState() ?? state;
    } else {
      final who = state.accountLabel;
      _emit(
        AgentPhase.checkingSession,
        who == null
            ? 'Signed in at ${_host(item)}'
            : 'Signed in at ${_host(item)} as $who',
      );
    }

    if (state.outOfStock) {
      _emit(AgentPhase.reading, '${item.title} is out of stock', isError: true);
      return AgentItemResult(
        item: item,
        outcome: AgentItemOutcome.outOfStock,
        addedQuantity: 0,
        note: 'The store lists this as out of stock.',
      );
    }

    if (state.needsVariant) {
      final wanted = item.variant?.trim() ?? '';
      _emit(
        AgentPhase.choosingVariant,
        wanted.isEmpty
            ? 'Choosing an option that is in stock'
            : 'Selecting $wanted',
      );
      final chosen = await _chooseBuyableVariant(wanted);
      if (chosen.note != null) {
        _emit(AgentPhase.choosingVariant, chosen.note!, isError: true);
        return AgentItemResult(
          item: item,
          outcome: AgentItemOutcome.variantUnavailable,
          addedQuantity: 0,
          note: chosen.note,
        );
      }
      _emit(AgentPhase.choosingVariant, 'Chose ${chosen.label ?? wanted}');
      state = chosen.state ?? state;
    }

    var added = 0;
    for (var unit = 0; unit < item.quantity; unit++) {
      if (_cancelled) break;
      final before = state.cartCount ?? await _cartCount();
      _emit(
        AgentPhase.adding,
        item.quantity == 1
            ? 'Adding ${item.title}'
            : 'Adding ${item.title} (${unit + 1} of ${item.quantity})',
      );
      final click = await _evaluateJson(agentAddToCartScript());
      final status = click?['status']?.toString();
      if (status != 'clicked') {
        final note = switch (status) {
          'blocked' => 'The add button is disabled on this page.',
          'no-control' => 'I could not find an add-to-cart button here.',
          _ => 'The store did not accept that action.',
        };
        _emit(AgentPhase.adding, note, isError: true);
        return AgentItemResult(
          item: item,
          outcome:
              added > 0 ? AgentItemOutcome.added : AgentItemOutcome.noControl,
          addedQuantity: added,
          note: note,
        );
      }

      _emit(AgentPhase.confirming, 'Waiting for the cart to update');
      final confirmed = await _waitForCartChange(before);
      if (!confirmed) {
        // A shop that hides its badge is not proof of failure; say so plainly
        // rather than claiming a success we did not see.
        _emit(
          AgentPhase.confirming,
          'Pressed add, but this store does not show a cart count to confirm it.',
        );
      }
      added += 1;
      state = await _readState() ?? state;
    }

    if (added > 0) {
      _emit(AgentPhase.confirming, 'Cart updated for ${item.title}');
    }
    return AgentItemResult(
      item: item,
      outcome: added > 0 ? AgentItemOutcome.added : AgentItemOutcome.failed,
      addedQuantity: added,
    );
  }

  /// Picks an option the shop will actually sell.
  ///
  /// Shops list every size as pickable and only reveal the truth once one is
  /// chosen: PEP shows "Size 6" as available, then swaps its buy box for an
  /// out-of-stock notice. Choosing is therefore the only way to test, so when
  /// the shopper did not name a size the agent tries the next one instead of
  /// reporting a missing button on a product that is plainly on sale.
  Future<_VariantChoice> _chooseBuyableVariant(String wanted) async {
    final tried = <String>[];
    for (var attempt = 0; attempt < maxVariantAttempts; attempt++) {
      if (_cancelled) return const _VariantChoice(note: 'Stopped.');
      final chosen = await _evaluateJson(
        agentSelectVariantScript(wanted, tried: tried),
      );
      final status = chosen?['status']?.toString();
      if (status != 'selected') {
        return _VariantChoice(
          note: status == 'unavailable'
              ? wanted.isEmpty
                  ? 'Every option is sold out.'
                  : '$wanted is not available.'
              : 'The store wants an option chosen and I could not read the list.',
        );
      }
      final label = chosen?['label']?.toString();
      if (label != null) tried.add(label);

      // The buy box re-renders around the chosen option, so give it a moment
      // before judging what it says.
      await _wait(pollInterval);
      final state = await _readState();
      final buyable = state != null &&
          !state.outOfStock &&
          (state.addControlCount > 0 || state.blockedAddControl);
      if (buyable) return _VariantChoice(label: label, state: state);

      // The shopper named this one, so there is nothing else to try.
      if (wanted.isNotEmpty) {
        return _VariantChoice(
          note: '$wanted is sold out on this product.',
        );
      }
      _emit(
        AgentPhase.choosingVariant,
        '$label is sold out. Trying another option.',
      );
    }
    return const _VariantChoice(
      note: 'Every option I tried was sold out.',
    );
  }

  Future<bool> _askForSignIn(AgentItemPlan item) async {
    _emit(
      AgentPhase.needsSignIn,
      'You are not signed in at ${_host(item)}. Sign in below and I will carry on — I never see your password.',
    );
    final gate = Completer<bool>();
    _signInGate = gate;
    final proceed = await gate.future;
    _signInGate = null;
    if (!proceed) return false;
    final state = await _readState();
    if (state?.signedIn != true) {
      _emit(AgentPhase.needsSignIn,
          'Still signed out at ${_host(item)}. I will stop here rather than guess.',
          isError: true);
      return false;
    }
    _emit(AgentPhase.checkingSession, 'Signed in. Carrying on.');
    return true;
  }

  /// Waits for a page the agent can actually act on.
  ///
  /// `readyState === 'complete'` is not that page: on a React storefront it
  /// fires while the buy box is still empty, and an agent that trusts it
  /// reports "no add-to-cart button" on a product that has one. The page counts
  /// as usable once it shows a buy box, says it is sold out, or asks for a
  /// login — and the last readable state is returned if nothing ever settles,
  /// so the caller can report what it saw.
  Future<AgentPageState?> _waitForReadyPage() async {
    AgentPageState? last;
    for (var attempt = 0; attempt < pollAttempts; attempt++) {
      if (_cancelled) return null;
      final state = await _readState();
      if (state != null) last = state;
      final usable = state != null &&
          state.ready &&
          (state.addControlCount > 0 ||
              state.blockedAddControl ||
              state.outOfStock ||
              state.onLoginPage);
      if (usable) {
        _emit(AgentPhase.reading, 'Page ready');
        return state;
      }
      await _wait(pollInterval);
    }
    return last;
  }

  /// True when the badge moved. A store with no badge returns false, which the
  /// caller reports honestly rather than treating as failure.
  Future<bool> _waitForCartChange(int? before) async {
    if (before == null) return false;
    for (var attempt = 0; attempt < pollAttempts; attempt++) {
      if (_cancelled) return false;
      await _wait(pollInterval);
      final now = await _cartCount();
      if (now != null && now > before) return true;
    }
    return false;
  }

  Future<int?> _cartCount() async {
    final json = await _evaluateJson(agentCartCountScript());
    final count = json?['count'];
    return count is num ? count.toInt() : null;
  }

  Future<AgentPageState?> _readState() async {
    final json =
        await _evaluateJson(agentPageStateScript(accountPath: accountPath));
    return json == null ? null : AgentPageState.fromJson(json);
  }

  Future<void> _clearHighlight() async {
    try {
      await _browser.evaluate(agentClearHighlightScript());
    } catch (_) {
      // The page may already be gone; the highlight goes with it.
    }
  }

  Future<Map<String, dynamic>?> _evaluateJson(String script) async {
    try {
      return decodeAgentJson(await _browser.evaluate(script));
    } catch (_) {
      return null;
    }
  }

  String _host(AgentItemPlan item) =>
      item.productUri.host.replaceFirst(RegExp(r'^www\.'), '');
}

/// WebView bridges hand JSON back as a string, and Android wraps that string in
/// another layer of quoting. Peel until it is a map.
Map<String, dynamic>? decodeAgentJson(Object? value) {
  dynamic decoded = value;
  for (var attempt = 0; attempt < 3 && decoded is String; attempt++) {
    try {
      decoded = jsonDecode(decoded);
    } catch (_) {
      return null;
    }
  }
  return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
}

/// The outcome of picking an option: the label that stuck, the page as it
/// looked afterwards, or the reason nothing worked.
class _VariantChoice {
  const _VariantChoice({this.label, this.state, this.note});

  final String? label;
  final AgentPageState? state;
  final String? note;
}
