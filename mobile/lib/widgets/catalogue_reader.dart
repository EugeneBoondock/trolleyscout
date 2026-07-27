import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../api_models.dart';
import '../catalogue_files.dart';
import '../catalogue_page_cache.dart';
import '../theme.dart';
import 'catalogue_pdf_view.dart';
import 'catalogue_source_button.dart';
import 'in_app_browser.dart';
import 'share_card.dart';

bool shouldUseCataloguePdf(Catalogue catalogue) =>
    catalogue.isDirectPdf && catalogue.pages.length <= 1;

typedef CataloguePagesLoader = Future<List<CataloguePage>> Function(String url);

final CataloguePageCache _cataloguePageCache = CataloguePageCache();

Future<List<CataloguePage>> loadCatalogueReaderPages(String url) =>
    _cataloguePageCache.load(url, fetchCatalogueReaderPages);

Future<List<CataloguePage>> fetchCatalogueReaderPages(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    throw const FormatException('Invalid catalogue page list URL');
  }
  final response = await http.get(uri, headers: const {
    'accept': 'application/json'
  }).timeout(const Duration(seconds: 20));
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw StateError('Catalogue pages returned ${response.statusCode}');
  }
  final payload = jsonDecode(response.body);
  final data = payload is Map ? payload['data'] : null;
  final rawPages = data is Map ? data['pages'] : null;
  if (rawPages is! List) return const [];
  final pages = rawPages
      .whereType<Map>()
      .map((page) => CataloguePage.fromJson(Map<String, dynamic>.from(page)))
      .where((page) => page.pageNumber > 0 && page.imageUrl.isNotEmpty)
      .toList()
    ..sort((left, right) => left.pageNumber.compareTo(right.pageNumber));
  return pages;
}

Future<void> showCatalogueReader(
  BuildContext context,
  Catalogue catalogue,
) =>
    showDialog<void>(
      context: context,
      useSafeArea: false,
      builder: (_) => Dialog.fullscreen(
        backgroundColor: TS.bgOf(context),
        child: CatalogueReader(
          catalogue: catalogue,
          openExternal: (uri) => showInAppBrowser(
            context,
            uri.toString(),
            title: catalogue.retailerName ?? catalogue.name,
          ),
        ),
      ),
    );

class CatalogueReader extends StatefulWidget {
  const CatalogueReader({
    super.key,
    required this.catalogue,
    this.openExternal = launchCatalogueSource,
    this.loadPages = loadCatalogueReaderPages,
  });

  final Catalogue catalogue;
  final CatalogueUriOpener openExternal;
  final CataloguePagesLoader loadPages;

  @override
  State<CatalogueReader> createState() => _CatalogueReaderState();
}

class _CatalogueReaderState extends State<CatalogueReader> {
  late final PageController _pageController;
  final Map<int, TransformationController> _transformationControllers = {};
  late Catalogue _catalogue;
  int _pageIndex = 0;
  bool _loadingPages = false;
  bool _pagesLoadFailed = false;
  bool _focusMode = false;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _catalogue = widget.catalogue;
    if (_catalogue.pagesUrl != null && _catalogue.pages.length <= 1) {
      unawaited(_loadRemotePages());
    }
  }

  @override
  void dispose() {
    if (_focusMode) {
      unawaited(
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge),
      );
    }
    for (final controller in _transformationControllers.values) {
      controller.dispose();
    }
    _pageController.dispose();
    super.dispose();
  }

  TransformationController _transformationControllerFor(int index) =>
      _transformationControllers.putIfAbsent(
        index,
        TransformationController.new,
      );

  void _clearTransformations() {
    for (final controller in _transformationControllers.values) {
      controller.dispose();
    }
    _transformationControllers.clear();
  }

  void _setZoom(double scale) {
    final controller = _transformationControllerFor(_pageIndex);
    final matrix = controller.value.clone()..setIdentity();
    matrix.setEntry(0, 0, scale);
    matrix.setEntry(1, 1, scale);
    controller.value = matrix;
  }

  void _zoomBy(double factor) {
    final controller = _transformationControllerFor(_pageIndex);
    final current = controller.value.getMaxScaleOnAxis();
    _setZoom((current * factor).clamp(1.0, 5.0).toDouble());
  }

  void _setFocusMode(bool enabled) {
    if (_focusMode == enabled) return;
    setState(() => _focusMode = enabled);
    unawaited(
      SystemChrome.setEnabledSystemUIMode(
        enabled ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge,
      ),
    );
  }

  void _showPage(int index) {
    if (index < 0 || index >= _catalogue.pages.length) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  Future<void> _loadRemotePages() async {
    final pagesUrl = _catalogue.pagesUrl;
    if (pagesUrl == null || _loadingPages) return;
    setState(() {
      _loadingPages = true;
      _pagesLoadFailed = false;
    });
    try {
      final pages = await widget.loadPages(pagesUrl);
      if (mounted && pages.isNotEmpty) {
        _clearTransformations();
        setState(() {
          _catalogue = _catalogue.copyWith(pages: pages);
          _pageIndex = 0;
        });
      } else if (mounted) {
        setState(() => _pagesLoadFailed = true);
      }
    } catch (_) {
      if (mounted) setState(() => _pagesLoadFailed = true);
    } finally {
      if (mounted) setState(() => _loadingPages = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalogue = _catalogue;
    final sourceUrl = catalogue.sourceUrl ?? catalogue.url;
    final sourceUri = catalogueSourceUri(sourceUrl);
    final sourceLabel = catalogue.sourceLabel == 'Catalogue Specials'
        ? 'Open catalogue source'
        : 'Open official source';
    final usePdf = shouldUseCataloguePdf(catalogue);
    final orderedPages = [...catalogue.pages]
      ..sort((left, right) => left.pageNumber.compareTo(right.pageNumber));
    final readerPages = !usePdf && orderedPages.isNotEmpty
        ? orderedPages
        : usePdf || catalogue.coverImageUrl == null
            ? const <CataloguePage>[]
            : <CataloguePage>[
                CataloguePage(
                  pageNumber: 1,
                  imageUrl: catalogue.coverImageUrl!,
                ),
              ];
    final remotePagesUnavailable = _pagesLoadFailed &&
        catalogue.pagesUrl != null &&
        orderedPages.length <= 1;
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      appBar: _focusMode
          ? null
          : AppBar(
              automaticallyImplyLeading: false,
              leading: IconButton(
                tooltip: 'Close catalogue',
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.close),
              ),
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    catalogue.retailerName ?? 'Trolley Scout catalogue',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TS.eyebrowOf(context),
                  ),
                  Text(
                    catalogue.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              actions: [
                if (!usePdf && readerPages.isNotEmpty)
                  IconButton(
                    tooltip: 'Enter full screen',
                    onPressed: () => _setFocusMode(true),
                    icon: const Icon(Icons.fullscreen),
                  ),
                PopupMenuButton<_CatalogueReaderAction>(
                  tooltip: 'Catalogue actions',
                  onSelected: (action) {
                    switch (action) {
                      case _CatalogueReaderAction.share:
                        showShareCardSheet(
                          context,
                          ShareCardData.fromCatalogue(catalogue),
                        );
                        break;
                      case _CatalogueReaderAction.source:
                        if (sourceUri != null) {
                          widget.openExternal(sourceUri);
                        }
                        break;
                    }
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      key: Key('catalogue-action-share'),
                      value: _CatalogueReaderAction.share,
                      child: _CatalogueReaderMenuItem(
                        icon: Icons.ios_share_outlined,
                        label: 'Share catalogue',
                      ),
                    ),
                    if (sourceUri != null)
                      PopupMenuItem(
                        key: const Key('catalogue-action-source'),
                        value: _CatalogueReaderAction.source,
                        child: _CatalogueReaderMenuItem(
                          icon: Icons.open_in_new,
                          label: sourceLabel,
                        ),
                      ),
                  ],
                ),
              ],
            ),
      body: SafeArea(
        top: _focusMode,
        child: _loadingPages
            ? _CataloguePagesLoading(
                coverImageUrl: catalogue.coverImageUrl,
              )
            : remotePagesUnavailable
                ? _CatalogueRemotePagesError(
                    coverImageUrl: catalogue.coverImageUrl,
                    sourceUrl: sourceUrl,
                    sourceLabel: sourceLabel,
                    openExternal: widget.openExternal,
                    onRetry: () => unawaited(_loadRemotePages()),
                  )
                : usePdf
                    ? CataloguePdfView(
                        url: catalogueFileUrl(catalogue.url) ?? catalogue.url,
                        label: catalogue.name,
                        fallbackImageUrl: catalogue.coverImageUrl,
                        sourceUrl: sourceUrl,
                        openExternal: widget.openExternal,
                      )
                    : readerPages.isNotEmpty
                        ? _imageReader(readerPages, sourceUrl, sourceLabel)
                        : _CatalogueCoverFallback(
                            catalogue: catalogue,
                            sourceUrl: sourceUrl,
                            sourceLabel: sourceLabel,
                            openExternal: widget.openExternal,
                          ),
      ),
    );
  }

  Widget _imageReader(
    List<CataloguePage> pages,
    String sourceUrl,
    String sourceLabel,
  ) {
    if (_focusMode) {
      return Stack(
        fit: StackFit.expand,
        children: [
          _pageCanvas(pages, sourceUrl, sourceLabel),
          Align(
            alignment: Alignment.topCenter,
            child: LinearProgressIndicator(
              minHeight: 3,
              value: (_pageIndex + 1) / pages.length,
              backgroundColor: TS.lineSoftOf(context),
              color: TS.redOf(context),
            ),
          ),
          Positioned(
            left: 10,
            top: 10,
            child: _ReaderOverlayButton(
              tooltip: 'Close catalogue',
              icon: Icons.close,
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ),
          Positioned(
            right: 10,
            top: 10,
            child: _ReaderOverlayButton(
              tooltip: 'Exit full screen',
              icon: Icons.fullscreen_exit,
              onPressed: () => _setFocusMode(false),
            ),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: _ReaderPageControls(
              currentPage: pages[_pageIndex].pageNumber,
              pageCount: pages.length,
              canGoBack: _pageIndex > 0,
              canGoForward: _pageIndex < pages.length - 1,
              onBack: () => _showPage(_pageIndex - 1),
              onForward: () => _showPage(_pageIndex + 1),
              onZoomOut: () => _zoomBy(0.8),
              onResetZoom: () => _setZoom(1),
              onZoomIn: () => _zoomBy(1.25),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        Semantics(
          label: 'Catalogue reading progress',
          value: 'Page ${_pageIndex + 1} of ${pages.length}',
          child: LinearProgressIndicator(
            minHeight: 3,
            value: (_pageIndex + 1) / pages.length,
            backgroundColor: TS.lineSoftOf(context),
            color: TS.redOf(context),
          ),
        ),
        Expanded(
          child: _pageCanvas(pages, sourceUrl, sourceLabel),
        ),
        Container(
          decoration: BoxDecoration(
            color: TS.surfaceOf(context),
            border: Border(top: BorderSide(color: TS.lineSoftOf(context))),
          ),
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  IconButton(
                    tooltip: 'Previous page',
                    onPressed: _pageIndex == 0
                        ? null
                        : () => _showPage(_pageIndex - 1),
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Expanded(
                    child: Text(
                      'Page ${pages[_pageIndex].pageNumber} of ${pages.length}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Next page',
                    onPressed: _pageIndex >= pages.length - 1
                        ? null
                        : () => _showPage(_pageIndex + 1),
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
              _ReaderZoomControls(
                onZoomOut: () => _zoomBy(0.8),
                onReset: () => _setZoom(1),
                onZoomIn: () => _zoomBy(1.25),
              ),
            ],
          ),
        ),
        if (pages.length > 1)
          SizedBox(
            height: 82,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              scrollDirection: Axis.horizontal,
              itemCount: pages.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final selected = index == _pageIndex;
                return Semantics(
                  button: true,
                  selected: selected,
                  label: 'Go to catalogue page ${pages[index].pageNumber}',
                  child: InkWell(
                    onTap: () => _showPage(index),
                    child: Container(
                      width: 52,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: TS.surfaceOf(context),
                        border: Border.all(
                          color: selected
                              ? TS.redOf(context)
                              : TS.lineSoftOf(context),
                          width: selected ? 3 : 1.5,
                        ),
                        borderRadius: BorderRadius.circular(TS.tileRadius),
                      ),
                      child: _CatalogueNetworkImage(
                        urls: withProxiedFallbacks(pages[index].imageUrls),
                        fit: BoxFit.contain,
                        fallbackIconSize: 20,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }

  Widget _pageCanvas(
    List<CataloguePage> pages,
    String sourceUrl,
    String sourceLabel,
  ) =>
      ColoredBox(
        color: TS.surfaceSoftOf(context),
        child: PageView.builder(
          controller: _pageController,
          itemCount: pages.length,
          onPageChanged: (index) => setState(() => _pageIndex = index),
          itemBuilder: (context, index) => Semantics(
            container: true,
            image: true,
            label:
                'Catalogue page ${pages[index].pageNumber} of ${pages.length}',
            child: InteractiveViewer(
              transformationController: _transformationControllerFor(index),
              minScale: 1,
              maxScale: 5,
              boundaryMargin: const EdgeInsets.all(48),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: SizedBox.expand(
                  child: _CatalogueNetworkImage(
                    urls: withProxiedFallbacks(pages[index].imageUrls),
                    fit: BoxFit.contain,
                    fallbackIconSize: 52,
                    allFailed: _CataloguePageFallback(
                      sourceUrl: sourceUrl,
                      sourceLabel: sourceLabel,
                      openExternal: widget.openExternal,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _ReaderOverlayButton extends StatelessWidget {
  const _ReaderOverlayButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          border: Border.all(color: TS.lineSoftOf(context)),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).shadowColor.withValues(alpha: 0.16),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          icon: Icon(icon),
        ),
      );
}

class _ReaderPageControls extends StatelessWidget {
  const _ReaderPageControls({
    required this.currentPage,
    required this.pageCount,
    required this.canGoBack,
    required this.canGoForward,
    required this.onBack,
    required this.onForward,
    required this.onZoomOut,
    required this.onResetZoom,
    required this.onZoomIn,
  });

  final int currentPage;
  final int pageCount;
  final bool canGoBack;
  final bool canGoForward;
  final VoidCallback onBack;
  final VoidCallback onForward;
  final VoidCallback onZoomOut;
  final VoidCallback onResetZoom;
  final VoidCallback onZoomIn;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          border: Border.all(color: TS.lineSoftOf(context)),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).shadowColor.withValues(alpha: 0.18),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: canGoBack ? onBack : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    'Page $currentPage of $pageCount',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                IconButton(
                  tooltip: 'Next page',
                  onPressed: canGoForward ? onForward : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            Divider(height: 1, color: TS.lineSoftOf(context)),
            _ReaderZoomControls(
              onZoomOut: onZoomOut,
              onReset: onResetZoom,
              onZoomIn: onZoomIn,
            ),
          ],
        ),
      );
}

class _ReaderZoomControls extends StatelessWidget {
  const _ReaderZoomControls({
    required this.onZoomOut,
    required this.onReset,
    required this.onZoomIn,
  });

  final VoidCallback onZoomOut;
  final VoidCallback onReset;
  final VoidCallback onZoomIn;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            tooltip: 'Zoom out',
            onPressed: onZoomOut,
            icon: const Icon(Icons.zoom_out),
          ),
          IconButton(
            tooltip: 'Reset zoom',
            onPressed: onReset,
            icon: const Icon(Icons.center_focus_strong),
          ),
          IconButton(
            tooltip: 'Zoom in',
            onPressed: onZoomIn,
            icon: const Icon(Icons.zoom_in),
          ),
        ],
      );
}

enum _CatalogueReaderAction { share, source }

class _CatalogueReaderMenuItem extends StatelessWidget {
  const _CatalogueReaderMenuItem({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      );
}

class _CatalogueNetworkImage extends StatelessWidget {
  const _CatalogueNetworkImage({
    required this.urls,
    required this.fit,
    required this.fallbackIconSize,
    this.allFailed,
  });

  final List<String> urls;
  final BoxFit fit;
  final double fallbackIconSize;
  final Widget? allFailed;

  @override
  Widget build(BuildContext context) => _imageAt(context, 0);

  Widget _imageAt(BuildContext context, int index) {
    if (index >= urls.length) {
      if (allFailed != null) return allFailed!;
      return ColoredBox(
        color: TS.surfaceSoftOf(context),
        child: Center(
          child: Icon(
            Icons.broken_image_outlined,
            color: TS.mutedOf(context),
            size: fallbackIconSize,
          ),
        ),
      );
    }
    return Image.network(
      urls[index],
      fit: fit,
      excludeFromSemantics: true,
      frameBuilder: (context, child, frame, loadedSynchronously) {
        if (loadedSynchronously || frame != null) return child;
        return ColoredBox(
          color: TS.surfaceSoftOf(context),
          child: Center(
            child: CircularProgressIndicator(color: TS.redOf(context)),
          ),
        );
      },
      errorBuilder: (_, __, ___) => _imageAt(context, index + 1),
    );
  }
}

class _CataloguePageFallback extends StatelessWidget {
  const _CataloguePageFallback({
    required this.sourceUrl,
    required this.sourceLabel,
    required this.openExternal,
  });

  final String sourceUrl;
  final String sourceLabel;
  final CatalogueUriOpener openExternal;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.broken_image_outlined,
                color: TS.mutedOf(context),
                size: 64,
              ),
              const SizedBox(height: 18),
              const Text(
                'Catalogue page unavailable.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              Text(
                'This page image could not be loaded. Open the catalogue source to continue.',
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context)),
              ),
              const SizedBox(height: 18),
              CatalogueSourceButton(
                label: sourceLabel,
                sourceUrl: sourceUrl,
                openExternal: openExternal,
              ),
            ],
          ),
        ),
      );
}

class _CatalogueCoverFallback extends StatelessWidget {
  const _CatalogueCoverFallback({
    required this.catalogue,
    required this.sourceUrl,
    required this.sourceLabel,
    required this.openExternal,
  });

  final Catalogue catalogue;
  final String sourceUrl;
  final String sourceLabel;
  final CatalogueUriOpener openExternal;

  @override
  Widget build(BuildContext context) {
    final cover = catalogue.coverImageUrl;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Semantics(
              image: true,
              label: 'Cover for ${catalogue.name}',
              child: SizedBox(
                width: 260,
                height: 340,
                child: _CatalogueNetworkImage(
                  urls:
                      cover == null ? const [] : withProxiedFallbacks([cover]),
                  fit: BoxFit.contain,
                  fallbackIconSize: 64,
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Catalogue preview unavailable.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Text(
              'This catalogue cannot be shown here right now. Open the catalogue source to continue.',
              textAlign: TextAlign.center,
              style: TextStyle(color: TS.mutedOf(context)),
            ),
            const SizedBox(height: 18),
            CatalogueSourceButton(
              label: sourceLabel,
              sourceUrl: sourceUrl,
              openExternal: openExternal,
            ),
          ],
        ),
      ),
    );
  }
}

class _CatalogueRemotePagesError extends StatelessWidget {
  const _CatalogueRemotePagesError({
    required this.coverImageUrl,
    required this.sourceUrl,
    required this.sourceLabel,
    required this.openExternal,
    required this.onRetry,
  });

  final String? coverImageUrl;
  final String sourceUrl;
  final String sourceLabel;
  final CatalogueUriOpener openExternal;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Stack(
        fit: StackFit.expand,
        children: [
          if (coverImageUrl != null)
            Opacity(
              opacity: 0.12,
              child: _CatalogueNetworkImage(
                urls: withProxiedFallbacks([coverImageUrl!]),
                fit: BoxFit.contain,
                fallbackIconSize: 48,
              ),
            ),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 420),
                padding: const EdgeInsets.all(22),
                decoration: TS.card(context, width: 1.5),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.cloud_off_outlined,
                      color: TS.redOf(context),
                      size: 48,
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Couldn’t load the full catalogue',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      'The cover loaded, but the full page list did not. Retry here or open the official source.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Retry'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    CatalogueSourceButton(
                      label: sourceLabel,
                      sourceUrl: sourceUrl,
                      openExternal: openExternal,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      );
}

class _CataloguePagesLoading extends StatelessWidget {
  const _CataloguePagesLoading({this.coverImageUrl});

  final String? coverImageUrl;

  @override
  Widget build(BuildContext context) => Stack(
        fit: StackFit.expand,
        children: [
          if (coverImageUrl != null)
            Opacity(
              opacity: 0.16,
              child: _CatalogueNetworkImage(
                urls: withProxiedFallbacks([coverImageUrl!]),
                fit: BoxFit.contain,
                fallbackIconSize: 48,
              ),
            ),
          Center(
            child: Container(
              margin: const EdgeInsets.all(24),
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: TS.surfaceOf(context),
                border: Border.all(color: TS.lineSoftOf(context)),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: TS.redOf(context)),
                  const SizedBox(height: 16),
                  const Text(
                    'Loading every catalogue page',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    'The high-quality reader will open in a moment.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: TS.mutedOf(context)),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
}
