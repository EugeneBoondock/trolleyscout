import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

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
        child: HtmlElementView(viewType: _viewType),
      ),
    );
  }
}
