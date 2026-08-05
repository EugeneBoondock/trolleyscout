import 'package:flutter/material.dart';

import '../assisted_store_cart.dart';
import '../outbound_link.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme.dart';

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
    ),
  ));
}

class TrolleyScoutBrowser extends StatefulWidget {
  const TrolleyScoutBrowser({
    super.key,
    required this.uri,
    required this.title,
    this.assistedItems = const [],
  });

  final List<AssistedStoreCartItem> assistedItems;
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

  bool get _isAssisted => widget.assistedItems.isNotEmpty;
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
