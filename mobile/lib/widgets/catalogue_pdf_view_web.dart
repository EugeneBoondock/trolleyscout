import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

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
  static int _nextViewId = 0;
  String? _viewType;
  bool _showCover = false;

  @override
  void initState() {
    super.initState();
    final source = Uri.tryParse(widget.url);
    if (source == null ||
        (source.scheme != 'https' && source.scheme != 'http')) {
      _showCover = true;
      return;
    }

    final type = 'catalogue-pdf-${_nextViewId++}';
    final frame = web.HTMLIFrameElement()
      ..src = source.toString()
      ..title = widget.label
      ..referrerPolicy = 'no-referrer'
      ..setAttribute('sandbox', 'allow-same-origin allow-downloads')
      ..style.border = '0'
      ..style.width = '100%'
      ..style.height = '100%'
      ..style.backgroundColor = 'transparent';
    ui_web.platformViewRegistry.registerViewFactory(type, (_) => frame);
    _viewType = type;
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      key: const ValueKey('catalogue-pdf-view'),
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => setState(() => _showCover = !_showCover),
              icon: Icon(
                  _showCover ? Icons.picture_as_pdf : Icons.image_outlined),
              label: Text(_showCover ? 'Show PDF' : 'Show cover'),
            ),
          ),
          Expanded(
            child: _showCover || _viewType == null
                ? _cover(context)
                : HtmlElementView(viewType: _viewType!),
          ),
        ],
      ),
    );
  }

  Widget _cover(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Semantics(
                image: true,
                label: 'Cover for ${widget.label}',
                child: SizedBox(
                  width: 240,
                  height: 320,
                  child: widget.fallbackImageUrl == null
                      ? _fallbackIcon(context)
                      : Image.network(
                          widget.fallbackImageUrl!,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => _fallbackIcon(context),
                        ),
                ),
              ),
              const SizedBox(height: 18),
              CatalogueSourceButton(
                sourceUrl: widget.sourceUrl,
                openExternal: widget.openExternal,
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
