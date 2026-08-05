import 'dart:async';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:pdfx/pdfx.dart';

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
  PdfController? _controller;
  int _page = 1;
  int _pages = 0;

  @override
  void initState() {
    super.initState();
    final uri = Uri.tryParse(widget.url);
    if (uri != null && (uri.scheme == 'https' || uri.scheme == 'http')) {
      _controller = PdfController(document: _openDocument(uri));
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return _fallback();
    }
    return SizedBox.expand(
      key: const ValueKey('catalogue-pdf-view'),
      child: Stack(
        children: [
          Positioned.fill(
            child: ColoredBox(
              color: TS.bgOf(context),
              child: PdfView(
                controller: controller,
                scrollDirection: Axis.vertical,
                backgroundDecoration: BoxDecoration(color: TS.bgOf(context)),
                onDocumentLoaded: (document) {
                  if (!mounted) return;
                  setState(() {
                    _pages = document.pagesCount;
                    _page = 1;
                  });
                },
                onPageChanged: (page) {
                  if (mounted) setState(() => _page = page);
                },
                builders: PdfViewBuilders<DefaultBuilderOptions>(
                  options: const DefaultBuilderOptions(),
                  documentLoaderBuilder: (_) => Center(
                    child: CircularProgressIndicator(color: TS.redOf(context)),
                  ),
                  pageLoaderBuilder: (_) => Center(
                    child: CircularProgressIndicator(color: TS.redOf(context)),
                  ),
                  errorBuilder: (_, __) => _fallback(),
                ),
              ),
            ),
          ),
          if (_pages > 0)
            Positioned(
              left: 16,
              right: 16,
              bottom: 16,
              child: SafeArea(
                top: false,
                child: Center(child: _pageControls(context, controller)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _pageControls(BuildContext context, PdfController controller) {
    final multiple = _pages > 1;
    return Material(
      color: TS.surfaceOf(context),
      elevation: 8,
      shadowColor: Colors.black38,
      borderRadius: BorderRadius.circular(999),
      child: Semantics(
        liveRegion: true,
        label: multiple ? 'Page $_page of $_pages' : 'One page catalogue',
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (multiple)
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: _page > 1
                      ? () => controller.previousPage(
                            duration: const Duration(milliseconds: 220),
                            curve: Curves.easeOut,
                          )
                      : null,
                  icon: const Icon(Icons.keyboard_arrow_up),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Text(
                  multiple ? 'Page $_page of $_pages' : '1 page',
                  key: const ValueKey('catalogue-pdf-page-count'),
                  style: TextStyle(
                    color: TS.inkOf(context),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              if (multiple)
                IconButton(
                  tooltip: 'Next page',
                  onPressed: _page < _pages
                      ? () => controller.nextPage(
                            duration: const Duration(milliseconds: 220),
                            curve: Curves.easeOut,
                          )
                      : null,
                  icon: const Icon(Icons.keyboard_arrow_down),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _fallback() => _PdfCoverFallback(
        label: widget.label,
        imageUrl: widget.fallbackImageUrl,
        sourceUrl: widget.sourceUrl,
        openExternal: widget.openExternal,
      );

  static Future<PdfDocument> _openDocument(Uri uri) async {
    final response = await http.get(uri).timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Catalogue PDF returned ${response.statusCode}.');
    }
    if (response.bodyBytes.isEmpty) {
      throw StateError('Catalogue PDF was empty.');
    }
    return PdfDocument.openData(response.bodyBytes);
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
                'This PDF could not be opened.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              Text(
                'The cover remains available. You can also open the official source.',
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
