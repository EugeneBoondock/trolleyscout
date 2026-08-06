import 'dart:async';

import 'package:flutter/material.dart';

import '../assisted_store_cart.dart';
import '../outbound_link.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../store_agent.dart';
import '../store_agent_scripts.dart';
import '../store_carts.dart';
import '../store_sessions.dart';
import '../theme.dart';
import 'agent_activity_panel.dart';

/// Bridges the agent's state machine to the WebView the shopper is watching.
///
/// The WebView keeps its own cookie jar, so every script runs inside whatever
/// store session the shopper already signed into — the app never handles a
/// credential to make that work.
class _WebViewAgentBrowser implements AgentBrowser {
  _WebViewAgentBrowser(this._controller);

  final WebViewController _controller;

  @override
  Future<void> load(Uri uri) => _controller.loadRequest(uri);

  @override
  Future<Object?> evaluate(String script) =>
      _controller.runJavaScriptReturningResult(script);
}

Uri? safeInAppBrowserUri(String? value) {
  // Tagged here rather than at each call site, so every hop out to a shop
  // carries it and no new screen can forget to.
  final tagged = withReferralSource(value);
  final uri = tagged == null ? null : Uri.tryParse(tagged.trim());
  if (uri == null ||
      (uri.scheme != 'https' && uri.scheme != 'http') ||
      uri.host.isEmpty) {
    return null;
  }
  return uri;
}

Future<void> showInAppBrowser(
  BuildContext context,
  String? value, {
  String title = 'Trolley Scout browser',
  List<AssistedStoreCartItem> assistedItems = const [],
  List<AgentItemPlan> agentItems = const [],
  SupportedStore? watchSessionFor,
}) async {
  final uri = safeInAppBrowserUri(value);
  if (uri == null) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
          const SnackBar(content: Text('This link is unavailable.')));
    return;
  }

  await Navigator.of(context).push(MaterialPageRoute<void>(
    builder: (_) => TrolleyScoutBrowser(
      uri: uri,
      title: title,
      assistedItems: assistedItems,
      agentItems: agentItems,
      watchSessionFor: watchSessionFor,
    ),
  ));
}

class TrolleyScoutBrowser extends StatefulWidget {
  const TrolleyScoutBrowser({
    super.key,
    required this.uri,
    required this.title,
    this.assistedItems = const [],
    this.agentItems = const [],
    this.watchSessionFor,
  });

  /// Set when this browser was opened to sign into a shop: the page is watched
  /// until it reports a signed-in session, which is then remembered.
  final SupportedStore? watchSessionFor;

  final List<AssistedStoreCartItem> assistedItems;

  /// When set, Mr Scout drives the page itself instead of handing the shopper
  /// a one-tap helper.
  final List<AgentItemPlan> agentItems;
  final Uri uri;
  final String title;

  @override
  State<TrolleyScoutBrowser> createState() => _TrolleyScoutBrowserState();
}

class _TrolleyScoutBrowserState extends State<TrolleyScoutBrowser> {
  late final WebViewController _controller;
  var _assistedIndex = 0;
  var _assistedMessage =
      'Open the product page, then let Mr Scout find its basket button.';
  var _assistedRemaining = 0;
  var _busy = false;
  late Uri _currentUri;
  var _progress = 0;
  StoreAgentRunner? _agent;
  Timer? _sessionWatch;
  final Set<String> _recordedItems = {};
  var _sessionConfirmed = false;

  bool get _isAgentRun => widget.agentItems.isNotEmpty;
  bool get _isAssisted => widget.assistedItems.isNotEmpty && !_isAgentRun;
  AssistedStoreCartItem get _assistedItem =>
      widget.assistedItems[_assistedIndex];
  bool get _isLastAssistedItem =>
      _assistedIndex == widget.assistedItems.length - 1;

  @override
  void initState() {
    super.initState();
    _currentUri = widget.uri;
    if (_isAssisted) _assistedRemaining = _assistedItem.quantity;
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (progress) {
          if (mounted) setState(() => _progress = progress);
        },
        onPageFinished: (url) {
          if (!mounted || !_isAssisted) return;
          setState(() {
            _currentUri = Uri.tryParse(url) ?? _currentUri;
            _progress = 100;
            if (_assistedRemaining > 0) {
              _assistedMessage =
                  'Page ready. Add one item at a time so the store can confirm each change.';
            }
          });
        },
        onUrlChange: (change) {
          final uri = Uri.tryParse(change.url ?? '');
          if (mounted && uri != null) setState(() => _currentUri = uri);
        },
        onNavigationRequest: (request) =>
            safeInAppBrowserUri(request.url) == null
                ? NavigationDecision.prevent
                : NavigationDecision.navigate,
      ))
      ..loadRequest(widget.uri);
    if (_isAgentRun) _startAgent();
    if (widget.watchSessionFor != null) _watchForSignIn();
  }

  /// Polls the store's own page until it reports a signed-in session. The app
  /// never sees the password — it only learns, from the shop's own page, that
  /// a session now exists.
  void _watchForSignIn() {
    final store = widget.watchSessionFor;
    if (store == null) return;
    _sessionWatch = Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (!mounted) {
        timer.cancel();
        return;
      }
      try {
        final state = AgentPageState.fromJson(
          decodeAgentJson(await _controller.runJavaScriptReturningResult(
                agentPageStateScript(accountPath: store.accountPath),
              )) ??
              const {},
        );
        if (!state.signedIn) return;
        timer.cancel();
        await StoreSessionStore.instance
            .remember(store.id, accountLabel: state.accountLabel);
        if (!mounted) return;
        setState(() => _sessionConfirmed = true);
      } catch (_) {
        // A page that blocks scripts simply stays unconfirmed.
      }
    });
  }

  void _startAgent() {
    final runner = StoreAgentRunner(
      accountPath: storeForHost(widget.uri.host)?.accountPath ?? '',
      browser: _WebViewAgentBrowser(_controller),
      items: widget.agentItems,
    );
    _agent = runner;
    runner.addListener(_rememberSessionFromAgent);
    // Started after the first frame so the panel is mounted and shows the very
    // first step rather than jumping in mid-run.
    WidgetsBinding.instance.addPostFrameCallback((_) => runner.run());
  }

  /// Keeps the sessions screen and the store-cart list in step with what the
  /// agent has actually seen and done.
  void _rememberSessionFromAgent() {
    final runner = _agent;
    if (runner == null) return;
    final signedIn = runner.log.any((entry) =>
        entry.phase == AgentPhase.checkingSession &&
        entry.message.startsWith('Signed in at'));
    if (signedIn) {
      final store = storeForHost(_currentUri.host);
      if (store != null) StoreSessionStore.instance.remember(store.id);
    }
    _recordAddedItems(runner);
  }

  /// Writes each confirmed add into the multi-store cart list, once.
  void _recordAddedItems(StoreAgentRunner runner) {
    for (final result in runner.results) {
      if (result.outcome != AgentItemOutcome.added) continue;
      if (result.addedQuantity <= 0) continue;
      if (!_recordedItems.add(result.item.productUri.toString())) continue;
      final host = result.item.productUri.host;
      final store = storeForHost(host);
      StoreCartStore.instance.record(
        store?.id ?? host.replaceFirst(RegExp(r'^www\.'), ''),
        store?.name ?? host.replaceFirst(RegExp(r'^www\.'), ''),
        StoreCartLine(
          title: result.item.title,
          productUrl: result.item.productUri.toString(),
          quantity: result.addedQuantity,
          addedAt: DateTime.now(),
        ),
      );
    }
  }

  @override
  void dispose() {
    _sessionWatch?.cancel();
    final runner = _agent;
    if (runner != null) {
      runner.removeListener(_rememberSessionFromAgent);
      runner.cancel();
      runner.dispose();
    }
    super.dispose();
  }

  Future<void> _addOne() async {
    if (_busy || _assistedRemaining <= 0) return;
    if (!isSameRetailerSite(_currentUri, _assistedItem.productUri)) {
      setState(() {
        _assistedMessage =
            'Return to this retailer\'s product page before using assisted controls.';
      });
      return;
    }
    setState(() {
      _busy = true;
      _assistedMessage = 'Looking for a clear basket button on this page...';
    });
    try {
      final raw = await _controller.runJavaScriptReturningResult(
        assistedAddOneScript(),
      );
      final result = parseAssistedStoreCartResult(raw);
      if (!mounted) return;
      setState(() {
        switch (result.status) {
          case AssistedStoreCartStatus.clicked:
            _assistedRemaining -= 1;
            _assistedMessage = _assistedRemaining == 0
                ? 'Requested quantity added. Continue when the store finishes updating.'
                : 'One added. Add $_assistedRemaining more to match your list.';
          case AssistedStoreCartStatus.ambiguous:
            _assistedMessage =
                'I found more than one possible basket control. Add it manually, then confirm below.';
          case AssistedStoreCartStatus.noControl:
            _assistedMessage =
                'This store did not expose a clear basket control. Add it manually, then confirm below.';
          case AssistedStoreCartStatus.noBasketLink:
          case AssistedStoreCartStatus.invalid:
            _assistedMessage =
                'The store page could not confirm that action. Add it manually, then confirm below.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _assistedMessage =
            'The store blocked assisted controls. Add it manually, then confirm below.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openStoreCart() async {
    await _controller.loadRequest(checkoutUriFor(_currentUri));
  }

  void _markAddedManually() {
    if (_assistedRemaining <= 0) return;
    setState(() {
      _assistedRemaining = 0;
      _assistedMessage = 'Marked as added. Your retailer session stays open.';
    });
  }

  Future<void> _nextAssistedItem() async {
    if (_busy || _assistedRemaining > 0 || _isLastAssistedItem) return;
    setState(() {
      _assistedIndex += 1;
      _assistedRemaining = _assistedItem.quantity;
      _assistedMessage = 'Opening the next product in this retailer session...';
      _progress = 0;
    });
    final nextUri = safeInAppBrowserUri(_assistedItem.productUri.toString());
    if (nextUri != null) await _controller.loadRequest(nextUri);
  }

  Future<void> _reviewBasket() async {
    if (_busy || _assistedRemaining > 0) return;
    if (!isSameRetailerSite(_currentUri, _assistedItem.productUri)) {
      setState(() {
        _assistedMessage = 'Return to this retailer before opening its basket.';
      });
      return;
    }
    setState(() {
      _busy = true;
      _assistedMessage = 'Looking for the retailer basket...';
    });
    try {
      final raw = await _controller.runJavaScriptReturningResult(
        assistedOpenBasketScript(),
      );
      final result = parseAssistedStoreCartResult(raw);
      if (!mounted) return;
      setState(() {
        _assistedMessage = result.status == AssistedStoreCartStatus.clicked
            ? 'Basket opened. Review quantities, availability, and the store\'s checkout requirements.'
            : 'I could not find a basket link on this page. Open the store basket manually to review it.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _assistedMessage =
            'The store blocked basket detection. Open its basket manually to review it.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      appBar: AppBar(
        titleSpacing: 0,
        // An explicit close (X) icon, not the default back-arrow leading
        // button — the actions row already has its own "Back in browser"
        // arrow that means something different (webview history), so this
        // needs to read as "done", Chrome-Custom-Tabs style.
        leading: IconButton(
          tooltip: 'Close',
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.close),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
            Text(widget.uri.host,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: TS.mutedOf(context))),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Back in browser',
            onPressed: () async {
              if (await _controller.canGoBack()) await _controller.goBack();
            },
            icon: const Icon(Icons.arrow_back_ios_new, size: 18),
          ),
          IconButton(
            tooltip: 'Forward in browser',
            onPressed: () async {
              if (await _controller.canGoForward()) {
                await _controller.goForward();
              }
            },
            icon: const Icon(Icons.arrow_forward_ios, size: 18),
          ),
          IconButton(
            tooltip: 'Reload page',
            onPressed: _controller.reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
        bottom: _progress < 100
            ? PreferredSize(
                preferredSize: const Size.fromHeight(3),
                child: LinearProgressIndicator(
                  minHeight: 3,
                  value: _progress / 100,
                  color: TS.redOf(context),
                ),
              )
            : null,
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(child: WebViewWidget(controller: _controller)),
            if (widget.watchSessionFor case final store?)
              _SessionWatchBanner(
                confirmed: _sessionConfirmed,
                onDone: () => Navigator.of(context).maybePop(),
                store: store,
              ),
            if (_agent case final runner?)
              AgentActivityPanel(
                runner: runner,
                onSignIn: runner.continueAfterSignIn,
                onOpenCart: _openStoreCart,
                onClose: () => Navigator.of(context).maybePop(),
              ),
            if (_isAssisted) _buildAssistedPanel(context),
          ],
        ),
      ),
    );
  }

  Widget _buildAssistedPanel(BuildContext context) {
    final item = _assistedItem;
    final readyForNext = _assistedRemaining == 0;
    return Material(
      color: TS.surfaceOf(context),
      child: Container(
        key: const ValueKey('assisted-store-cart-panel'),
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(14, 11, 14, 12),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: TS.lineSoftOf(context))),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
                  child: const Icon(
                    Icons.smart_toy_outlined,
                    color: TS.ink,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'MR SCOUT BASKET HELPER  ${_assistedIndex + 1}/${widget.assistedItems.length}',
                        style: TS.eyebrowOf(context).copyWith(fontSize: 9),
                      ),
                      Text(
                        item.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ],
                  ),
                ),
                if (_assistedRemaining > 0)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: TS.surfaceSoftOf(context),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      '$_assistedRemaining left',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 7),
            Text(
              _assistedMessage,
              style: TextStyle(
                color: TS.mutedOf(context),
                fontSize: 12,
                height: 1.3,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 9),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    key: const ValueKey('assisted-store-cart-primary'),
                    onPressed: _busy
                        ? null
                        : !readyForNext
                            ? _addOne
                            : !_isLastAssistedItem
                                ? _nextAssistedItem
                                : _reviewBasket,
                    icon: _busy
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            !readyForNext
                                ? Icons.add_shopping_cart_rounded
                                : !_isLastAssistedItem
                                    ? Icons.navigate_next_rounded
                                    : Icons.shopping_basket_outlined,
                          ),
                    label: Text(
                      !readyForNext
                          ? 'Add 1 to basket'
                          : !_isLastAssistedItem
                              ? 'Next item'
                              : 'Review basket',
                    ),
                  ),
                ),
                if (!readyForNext) ...[
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _busy ? null : _markAddedManually,
                    child: const Text('I added it'),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 5),
            Text(
              'Your basket stays in this browser session. The store may require sign-in, delivery details, or stock confirmation.',
              style: TextStyle(
                color: TS.mutedOf(context),
                fontSize: 10,
                height: 1.25,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shown while the shopper signs into a shop, so they know the app is waiting
/// for the store's own page to confirm a session — and that it stops there.
class _SessionWatchBanner extends StatelessWidget {
  const _SessionWatchBanner({
    required this.confirmed,
    required this.onDone,
    required this.store,
  });

  final bool confirmed;
  final VoidCallback onDone;
  final SupportedStore store;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: TS.surfaceOf(context),
      child: Container(
        key: const ValueKey('store-session-banner'),
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(14, 11, 14, 12),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: TS.lineSoftOf(context))),
        ),
        child: Row(
          children: [
            Icon(
              confirmed ? Icons.verified_user_outlined : Icons.lock_outline,
              color: confirmed ? TS.greenOf(context) : TS.mutedOf(context),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    confirmed
                        ? 'Signed in to ${store.name}'
                        : 'Sign in to ${store.name}',
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  Text(
                    confirmed
                        ? 'Mr Scout can now fill this shop\'s cart for you.'
                        : 'Use the store\'s own form. Your password stays with the store.',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 11,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
            if (confirmed)
              FilledButton(
                key: const ValueKey('store-session-done'),
                onPressed: onDone,
                child: const Text('Done'),
              ),
          ],
        ),
      ),
    );
  }
}
