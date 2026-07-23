import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme.dart';

Uri? safeInAppBrowserUri(String? value) {
  final uri = value == null ? null : Uri.tryParse(value.trim());
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
    builder: (_) => TrolleyScoutBrowser(uri: uri, title: title),
  ));
}

class TrolleyScoutBrowser extends StatefulWidget {
  const TrolleyScoutBrowser({
    super.key,
    required this.uri,
    required this.title,
  });

  final Uri uri;
  final String title;

  @override
  State<TrolleyScoutBrowser> createState() => _TrolleyScoutBrowserState();
}

class _TrolleyScoutBrowserState extends State<TrolleyScoutBrowser> {
  late final WebViewController _controller;
  var _progress = 0;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (progress) {
          if (mounted) setState(() => _progress = progress);
        },
        onNavigationRequest: (request) =>
            safeInAppBrowserUri(request.url) == null
                ? NavigationDecision.prevent
                : NavigationDecision.navigate,
      ))
      ..loadRequest(widget.uri);
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
        child: WebViewWidget(controller: _controller),
      ),
    );
  }
}
