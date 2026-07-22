import 'package:flutter/material.dart';

import '../api_models.dart';
import '../catalogue_files.dart';
import '../theme.dart';
import 'catalogue_pdf_view.dart';
import 'catalogue_source_button.dart';
import 'in_app_browser.dart';

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
  });

  final Catalogue catalogue;
  final CatalogueUriOpener openExternal;

  @override
  State<CatalogueReader> createState() => _CatalogueReaderState();
}

class _CatalogueReaderState extends State<CatalogueReader> {
  late final PageController _pageController;
  int _pageIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _showPage(int index) {
    if (index < 0 || index >= widget.catalogue.pages.length) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final catalogue = widget.catalogue;
    final sourceUrl = catalogue.sourceUrl ?? catalogue.url;
    final sourceUri = catalogueSourceUri(sourceUrl);
    final readerPages = catalogue.pages.isNotEmpty
        ? catalogue.pages
        : catalogue.coverImageUrl == null
            ? const <CataloguePage>[]
            : <CataloguePage>[
                CataloguePage(
                  pageNumber: 1,
                  imageUrl: catalogue.coverImageUrl!,
                ),
              ];
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      appBar: AppBar(
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
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
          ],
        ),
        actions: [
          if (sourceUri != null)
            IconButton(
              tooltip: 'Open official source',
              onPressed: () => widget.openExternal(sourceUri),
              icon: const Icon(Icons.open_in_new),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: readerPages.isNotEmpty
            ? _imageReader(readerPages, sourceUrl)
            : catalogue.isDirectPdf
                ? CataloguePdfView(
                    url: catalogueFileUrl(catalogue.url) ?? catalogue.url,
                    label: catalogue.name,
                    fallbackImageUrl: catalogue.coverImageUrl,
                    sourceUrl: sourceUrl,
                    openExternal: widget.openExternal,
                  )
                : _CatalogueCoverFallback(
                    catalogue: catalogue,
                    sourceUrl: sourceUrl,
                    openExternal: widget.openExternal,
                  ),
      ),
    );
  }

  Widget _imageReader(List<CataloguePage> pages, String sourceUrl) {
    return Column(
      children: [
        Expanded(
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
                minScale: 1,
                maxScale: 5,
                boundaryMargin: const EdgeInsets.all(48),
                child: SizedBox.expand(
                  child: _CatalogueNetworkImage(
                    urls: withProxiedFallbacks(pages[index].imageUrls),
                    fit: BoxFit.contain,
                    fallbackIconSize: 52,
                    allFailed: _CataloguePageFallback(
                      sourceUrl: sourceUrl,
                      openExternal: widget.openExternal,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: TS.surfaceOf(context),
            border: Border(top: BorderSide(color: TS.lineSoftOf(context))),
          ),
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Previous page',
                onPressed:
                    _pageIndex == 0 ? null : () => _showPage(_pageIndex - 1),
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
        ),
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
                    decoration: BoxDecoration(
                      color: TS.surfaceOf(context),
                      border: Border.all(
                        color: selected
                            ? TS.redOf(context)
                            : TS.lineSoftOf(context),
                        width: selected ? 3 : 1.5,
                      ),
                    ),
                    child: _CatalogueNetworkImage(
                      urls: withProxiedFallbacks(pages[index].imageUrls),
                      fit: BoxFit.cover,
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
    required this.openExternal,
  });

  final String sourceUrl;
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
                'This page image could not be loaded. Open the retailer’s official source to continue.',
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
}

class _CatalogueCoverFallback extends StatelessWidget {
  const _CatalogueCoverFallback({
    required this.catalogue,
    required this.sourceUrl,
    required this.openExternal,
  });

  final Catalogue catalogue;
  final String sourceUrl;
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
                  urls: cover == null ? const [] : withProxiedFallbacks([cover]),
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
              'This catalogue cannot be shown here right now. Open the retailer’s official source to continue.',
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
  }
}
