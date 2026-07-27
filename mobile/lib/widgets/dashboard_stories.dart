import 'package:flutter/material.dart';

import '../dashboard_stories.dart';
import '../theme.dart';
import 'catalogue_reader.dart';
import 'in_app_browser.dart';

class DashboardStories extends StatelessWidget {
  const DashboardStories({
    super.key,
    required this.stories,
    this.loadPages = loadCatalogueReaderPages,
  });

  final List<DashboardStory> stories;
  final CataloguePagesLoader loadPages;

  @override
  Widget build(BuildContext context) {
    if (stories.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Store stories',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 2),
        Text(
          'Catalogue pages first, then the latest deals.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 92,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: stories.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) => _StoryReelItem(
                story: stories[index],
                onTap: () {
                  showDialog<void>(
                    context: context,
                    useSafeArea: false,
                    builder: (_) => Dialog.fullscreen(
                      backgroundColor: TS.bgOf(context),
                      child: _StoryViewer(
                        stories: stories,
                        initialStoryIndex: index,
                        loadPages: loadPages,
                      ),
                    ),
                  );
                }),
          ),
        ),
      ],
    );
  }
}

class _StoryReelItem extends StatelessWidget {
  const _StoryReelItem({required this.story, required this.onTap});

  final DashboardStory story;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'View ${story.retailerName} story',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(36),
        child: SizedBox(
          width: 68,
          child: Column(
            children: [
              Container(
                width: 62,
                height: 62,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: TS.yellow,
                  border: Border.all(color: TS.redOf(context), width: 3),
                ),
                child: ClipOval(
                  child: ColoredBox(
                    color: TS.surfaceOf(context),
                    child: story.logoUrl == null
                        ? Icon(Icons.storefront,
                            color: TS.greenOf(context), size: 26)
                        : Image.network(
                            story.logoUrl!,
                            cacheWidth: 128,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Icon(
                              Icons.storefront,
                              color: TS.greenOf(context),
                              size: 26,
                            ),
                          ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                story.retailerName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 10.5, fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StoryViewer extends StatefulWidget {
  const _StoryViewer({
    required this.stories,
    required this.initialStoryIndex,
    required this.loadPages,
  });

  final List<DashboardStory> stories;
  final int initialStoryIndex;
  final CataloguePagesLoader loadPages;

  @override
  State<_StoryViewer> createState() => _StoryViewerState();
}

class _StoryViewerState extends State<_StoryViewer> {
  late final List<DashboardStory> _stories =
      List<DashboardStory>.of(widget.stories);
  late int _storyIndex = widget.initialStoryIndex;
  int _frameIndex = 0;
  final _loadingCatalogueKeys = <String>{};
  final _failedCatalogueKeys = <String>{};

  DashboardStory get _story => _stories[_storyIndex];
  DashboardStoryFrame get _frame => _story.frames[_frameIndex];

  @override
  void initState() {
    super.initState();
    _scheduleCurrentCatalogueLoad();
  }

  void _scheduleCurrentCatalogueLoad() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadCurrentCatalogue();
    });
  }

  void _previous() {
    if (_frameIndex > 0) {
      setState(() => _frameIndex -= 1);
      _scheduleCurrentCatalogueLoad();
      return;
    }
    if (_storyIndex > 0) {
      setState(() {
        _storyIndex -= 1;
        _frameIndex = _story.frames.length - 1;
      });
      _scheduleCurrentCatalogueLoad();
    }
  }

  void _next() {
    if (_frameIndex < _story.frames.length - 1) {
      setState(() => _frameIndex += 1);
      _scheduleCurrentCatalogueLoad();
      return;
    }
    if (_storyIndex < _stories.length - 1) {
      setState(() {
        _storyIndex += 1;
        _frameIndex = 0;
      });
      _scheduleCurrentCatalogueLoad();
    } else {
      Navigator.of(context).maybePop();
    }
  }

  Future<void> _loadCurrentCatalogue() async {
    final frame = _frame;
    final catalogue = frame.catalogue;
    final pagesUrl = catalogue?.pagesUrl;
    if (catalogue == null ||
        catalogue.pages.length > 1 ||
        pagesUrl == null ||
        pagesUrl.isEmpty) {
      return;
    }
    final key = catalogue.id ?? pagesUrl;
    if (_loadingCatalogueKeys.contains(key) ||
        _failedCatalogueKeys.contains(key)) {
      return;
    }

    _loadingCatalogueKeys.add(key);
    try {
      final pages = await widget.loadPages(pagesUrl);
      if (!mounted || pages.isEmpty) {
        if (pages.isEmpty) _failedCatalogueKeys.add(key);
        return;
      }
      final storyIndex = _stories.indexWhere((story) => story.id == _story.id);
      if (storyIndex < 0) return;
      final current = _stories[storyIndex];
      final hydratedCatalogue = catalogue.copyWith(pages: pages);
      final nextFrames = <DashboardStoryFrame>[];
      var inserted = false;

      for (final item in current.frames) {
        final itemCatalogue = item.catalogue;
        final itemKey = itemCatalogue?.id ?? itemCatalogue?.pagesUrl;
        if (itemCatalogue == null || itemKey != key) {
          nextFrames.add(item);
          continue;
        }
        if (inserted) continue;
        inserted = true;
        nextFrames.addAll(pages.map((page) => DashboardStoryFrame(
              id: '$key:page:${page.pageNumber}',
              kind: DashboardStoryFrameKind.catalogue,
              imageUrl: page.imageUrl,
              imageUrls: page.imageUrls,
              title: catalogue.name,
              sourceUrl: catalogue.sourceUrl ?? catalogue.url,
              subtitle: 'Page ${page.pageNumber} of ${pages.length}',
              pageNumber: page.pageNumber,
              catalogue: hydratedCatalogue,
            )));
      }

      if (!inserted) return;
      setState(() {
        _stories[storyIndex] = DashboardStory(
          id: current.id,
          retailerName: current.retailerName,
          logoUrl: current.logoUrl,
          frames: nextFrames,
        );
        if (_frameIndex >= _story.frames.length) {
          _frameIndex = _story.frames.length - 1;
        }
      });
    } catch (_) {
      _failedCatalogueKeys.add(key);
    } finally {
      _loadingCatalogueKeys.remove(key);
    }
  }

  Future<void> _openFrame() async {
    final catalogue = _frame.catalogue;
    if (catalogue != null) {
      await showCatalogueReader(context, catalogue);
      return;
    }
    if (_frame.sourceUrl.isNotEmpty) {
      await showInAppBrowser(
        context,
        _frame.sourceUrl,
        title: _frame.title,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
          child: Column(
            children: [
              Row(
                children: [
                  for (var index = 0;
                      index < _story.frames.length;
                      index++) ...[
                    Expanded(
                      child: AnimatedContainer(
                        key: Key('story-progress-$index'),
                        duration: const Duration(milliseconds: 180),
                        height: 4,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(99),
                          color: index == _frameIndex
                              ? TS.redOf(context)
                              : index < _frameIndex
                                  ? TS.greenOf(context)
                                  : TS.lineSoftOf(context),
                        ),
                      ),
                    ),
                    if (index < _story.frames.length - 1)
                      const SizedBox(width: 4),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _StoryBrand(story: _story),
                  const Spacer(),
                  Text(
                    '${_frameIndex + 1} of ${_story.frames.length}',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close story',
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Expanded(
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: ColoredBox(
                          color: TS.surfaceSoftOf(context),
                          child: _StoryImage(frame: _frame),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 8,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: IconButton.filledTonal(
                          tooltip: 'Previous story item',
                          onPressed: _storyIndex == 0 && _frameIndex == 0
                              ? null
                              : _previous,
                          icon: const Icon(Icons.chevron_left),
                        ),
                      ),
                    ),
                    Positioned(
                      right: 8,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: IconButton.filledTonal(
                          tooltip: 'Next story item',
                          onPressed: _next,
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _frame.kind == DashboardStoryFrameKind.catalogue
                              ? 'CATALOGUE'
                              : 'DEAL',
                          style: TS.eyebrowOf(context),
                        ),
                        Text(
                          _frame.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        if (_frame.subtitle != null)
                          Text(
                            _frame.subtitle!,
                            style: TextStyle(
                              color: _frame.kind == DashboardStoryFrameKind.deal
                                  ? TS.redOf(context)
                                  : TS.mutedOf(context),
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilledButton(
                    onPressed: _openFrame,
                    child: Text(
                      _frame.kind == DashboardStoryFrameKind.catalogue
                          ? 'Read catalogue'
                          : 'View deal',
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StoryBrand extends StatelessWidget {
  const _StoryBrand({required this.story});

  final DashboardStory story;

  @override
  Widget build(BuildContext context) {
    final fallback =
        Icon(Icons.storefront, color: TS.greenOf(context), size: 20);
    return Row(
      children: [
        ClipOval(
          child: SizedBox(
            width: 36,
            height: 36,
            child: ColoredBox(
              color: TS.surfaceOf(context),
              child: story.logoUrl == null
                  ? fallback
                  : Image.network(
                      story.logoUrl!,
                      cacheWidth: 96,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => fallback,
                    ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          story.retailerName,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ],
    );
  }
}

class _StoryImage extends StatelessWidget {
  const _StoryImage({required this.frame});

  final DashboardStoryFrame frame;

  @override
  Widget build(BuildContext context) {
    if (frame.imageUrls.isEmpty || frame.imageUrl.isEmpty) {
      return Center(
        child: Icon(
          frame.kind == DashboardStoryFrameKind.catalogue
              ? Icons.menu_book_outlined
              : Icons.local_offer_outlined,
          color: TS.mutedOf(context),
          size: 58,
        ),
      );
    }
    return Image.network(
      frame.imageUrl,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Center(
        child: Icon(
          Icons.broken_image_outlined,
          color: TS.mutedOf(context),
          size: 58,
        ),
      ),
    );
  }
}
