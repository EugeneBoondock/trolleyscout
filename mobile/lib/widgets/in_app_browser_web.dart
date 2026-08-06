import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';

import '../assisted_store_cart.dart';
import '../outbound_link.dart';
import 'package:web/web.dart' as web;

import '../store_agent.dart';
import '../store_sessions.dart';
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

  /// Browser security keeps a cross-origin iframe out of reach, so the agent
  /// does not run on the web build; the shop is opened for the shopper to work
  /// in themselves.
  final List<AgentItemPlan> agentItems;
  final SupportedStore? watchSessionFor;

  final List<AssistedStoreCartItem> assistedItems;
  final Uri uri;
  final String title;

  @override
  State<TrolleyScoutBrowser> createState() => _TrolleyScoutBrowserState();
}

class _TrolleyScoutBrowserState extends State<TrolleyScoutBrowser> {
  static int _nextViewId = 0;
  late final String _viewType;

  @override
  void initState() {
    super.initState();
    _viewType = 'trolley-scout-browser-${_nextViewId++}';
    final frame = web.HTMLIFrameElement()
      ..src = widget.uri.toString()
      ..title = widget.title
      ..referrerPolicy = 'strict-origin-when-cross-origin'
      ..setAttribute(
        'sandbox',
        'allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox '
            'allow-same-origin allow-scripts',
      )
      ..style.border = '0'
      ..style.width = '100%'
      ..style.height = '100%'
      ..style.backgroundColor = 'transparent';
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (_) => frame);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      appBar: AppBar(
        titleSpacing: 0,
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
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(child: HtmlElementView(viewType: _viewType)),
            if (widget.assistedItems.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                color: TS.surfaceOf(context),
                child: Text(
                  'Open each listed product in this browser session and use the retailer basket control. Browser security keeps store controls user-operated on the web.',
                  style: TextStyle(
                    color: TS.mutedOf(context),
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
