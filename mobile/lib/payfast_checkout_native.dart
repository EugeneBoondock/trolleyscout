import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'api.dart';
import 'payfast_checkout_html.dart';

Future<bool> openPayFastCheckout(
  BuildContext context,
  SubscriptionCheckout checkout,
) async {
  final html = buildNativePayFastCheckoutDocument(checkout);
  if (html == null) return false;

  if (!Platform.isAndroid && !Platform.isIOS) {
    final url = checkout.redirectUrl;
    if (url == null) return false;
    return launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  return await showModalBottomSheet<bool>(
        context: context,
        isDismissible: false,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => FractionallySizedBox(
          heightFactor: 0.92,
          child: _PayFastCheckoutSheet(html: html),
        ),
      ) ??
      false;
}

String? buildNativePayFastCheckoutDocument(SubscriptionCheckout checkout) {
  final redirectUrl = checkout.redirectUrl;
  if (redirectUrl != null && checkout.redirectFields.isNotEmpty) {
    return buildPayFastRedirectHtml(redirectUrl, checkout.redirectFields);
  }

  final engineUrl = checkout.engineUrl;
  final onsiteUuid = checkout.onsiteUuid;
  if (engineUrl != null && onsiteUuid != null) {
    return buildPayFastOnsiteHtml(engineUrl, onsiteUuid);
  }

  return null;
}

class _PayFastCheckoutSheet extends StatefulWidget {
  const _PayFastCheckoutSheet({required this.html});

  final String html;

  @override
  State<_PayFastCheckoutSheet> createState() => _PayFastCheckoutSheetState();
}

class _PayFastCheckoutSheetState extends State<_PayFastCheckoutSheet> {
  late final WebViewController _controller;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xfff4eedd))
      ..addJavaScriptChannel(
        'TrolleyScout',
        onMessageReceived: (message) {
          if (!mounted) return;
          Navigator.of(context).pop(message.message == 'completed');
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) => setState(() => _progress = progress),
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri?.host == 'trolleyscout.co.za' &&
                uri?.path.toLowerCase() == '/subscription' &&
                uri?.queryParameters.containsKey('payfast') == true) {
              Navigator.of(context)
                  .pop(uri?.queryParameters['payfast'] == 'success');
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadHtmlString(
        widget.html,
        baseUrl: payFastCheckoutBaseUrl.toString(),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: Column(
        children: [
          ListTile(
            title: const Text('Secure PayFast checkout',
                style: TextStyle(fontWeight: FontWeight.w900)),
            subtitle: const Text('Payment is handled securely by PayFast.'),
            trailing: IconButton(
              tooltip: 'Close checkout',
              onPressed: () => Navigator.of(context).pop(false),
              icon: const Icon(Icons.close),
            ),
          ),
          if (_progress < 100) LinearProgressIndicator(value: _progress / 100),
          Expanded(child: WebViewWidget(controller: _controller)),
        ],
      ),
    );
  }
}
