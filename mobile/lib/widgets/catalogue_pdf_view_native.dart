import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme.dart';
import 'catalogue_source_button.dart';

class CataloguePdfView extends StatefulWidget {
  const CataloguePdfView({
    super.key,
    required this.url,
    required this.label,
    this.fallbackImageUrl,
    this.sourceUrl,
    this.openExternal = launchCatalogueSource,
  });

  final String url;
  final String label;
  final String? fallbackImageUrl;
  final String? sourceUrl;
  final CatalogueUriOpener openExternal;

  @override
  State<CataloguePdfView> createState() => _CataloguePdfViewState();
}

class _CataloguePdfViewState extends State<CataloguePdfView> {
  WebViewController? _controller;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prepareViewer());
  }

  Future<void> _prepareViewer() async {
    final source = Uri.tryParse(widget.url);
    if (source == null ||
        (source.scheme != 'https' && source.scheme != 'http') ||
        !mounted) {
      if (mounted) setState(() => _failed = true);
      return;
    }

    final backgroundColor = TS.surfaceOf(context);
    try {
      final viewer = Uri.https('docs.google.com', '/gview', {
        'embedded': '1',
        'url': source.toString(),
      });
      final controller = WebViewController();
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setBackgroundColor(backgroundColor);
      await controller.setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) {
          final uri = Uri.tryParse(request.url);
          return uri?.host == 'docs.google.com'
              ? NavigationDecision.navigate
              : NavigationDecision.prevent;
        },
        onWebResourceError: (error) {
          if (error.isForMainFrame == true && mounted) {
            setState(() => _failed = true);
          }
        },
      ));
      await controller.loadRequest(viewer);
      if (mounted) setState(() => _controller = controller);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      key: const ValueKey('catalogue-pdf-view'),
      child: _failed
          ? _PdfCoverFallback(
              label: widget.label,
              imageUrl: widget.fallbackImageUrl,
              sourceUrl: widget.sourceUrl,
              openExternal: widget.openExternal,
            )
          : _controller == null
              ? Center(
                  child: CircularProgressIndicator(color: TS.redOf(context)),
                )
              : WebViewWidget(controller: _controller!),
    );
  }
}

class _PdfCoverFallback extends StatelessWidget {
  const _PdfCoverFallback({
    required this.label,
    required this.sourceUrl,
    required this.openExternal,
    this.imageUrl,
  });

  final String label;
  final String? imageUrl;
  final String? sourceUrl;
  final CatalogueUriOpener openExternal;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Semantics(
                image: true,
                label: 'Cover for $label',
                child: SizedBox(
                  width: 240,
                  height: 320,
                  child: imageUrl == null
                      ? _fallbackIcon(context)
                      : Image.network(
                          imageUrl!,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => _fallbackIcon(context),
                        ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'This PDF could not be embedded.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              Text(
                'The catalogue cover remains available in Trolley Scout.',
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context)),
              ),
              const SizedBox(height: 18),
              CatalogueSourceButton(
                sourceUrl: sourceUrl,
                openExternal: openExternal,
              ),
            ],
          ),
        ),
      );

  Widget _fallbackIcon(BuildContext context) => ColoredBox(
        color: TS.surfaceSoftOf(context),
        child: Center(
          child: Icon(
            Icons.picture_as_pdf_outlined,
            size: 64,
            color: TS.redOf(context),
          ),
        ),
      );
}
