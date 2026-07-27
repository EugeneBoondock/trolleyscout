import 'api_models.dart';

enum DashboardStoryFrameKind { catalogue, deal }

class DashboardStoryFrame {
  const DashboardStoryFrame({
    required this.id,
    required this.kind,
    required this.imageUrl,
    required this.imageUrls,
    required this.title,
    required this.sourceUrl,
    this.subtitle,
    this.pageNumber,
    this.catalogue,
    this.deal,
  });

  final String id;
  final DashboardStoryFrameKind kind;
  final String imageUrl;
  final List<String> imageUrls;
  final String title;
  final String sourceUrl;
  final String? subtitle;
  final int? pageNumber;
  final Catalogue? catalogue;
  final Deal? deal;
}

class DashboardStory {
  const DashboardStory({
    required this.id,
    required this.retailerName,
    required this.frames,
    this.logoUrl,
  });

  final String id;
  final String retailerName;
  final String? logoUrl;
  final List<DashboardStoryFrame> frames;
}

class _MutableStory {
  _MutableStory({required this.id, required this.retailerName});

  final String id;
  final String retailerName;
  final catalogues = <DashboardStoryFrame>[];
  final deals = <DashboardStoryFrame>[];
}

List<DashboardStory> buildDashboardStories({
  required List<Catalogue> catalogues,
  required List<Deal> deals,
  required List<Retailer> retailers,
  int maxStories = 16,
  int maxFramesPerStory = 40,
}) {
  final retailerById = {
    for (final retailer in retailers) retailer.id: retailer
  };
  final retailerByName = {
    for (final retailer in retailers)
      retailer.name.trim().toLowerCase(): retailer
  };
  final groups = <String, _MutableStory>{};
  final order = <String>[];

  _MutableStory? storyFor(String id, String name) {
    final existing = groups[id];
    if (existing != null) return existing;
    if (groups.length >= maxStories) return null;
    return groups.putIfAbsent(id, () {
      order.add(id);
      return _MutableStory(id: id, retailerName: name);
    });
  }

  for (final catalogue in catalogues) {
    final retailerName = catalogue.retailerName?.trim().isNotEmpty == true
        ? catalogue.retailerName!.trim()
        : 'Store';
    final retailer = retailerByName[retailerName.toLowerCase()];
    final id = retailer?.id ?? 'name:${_slug(retailerName)}';
    final story = storyFor(id, retailerName);
    if (story == null || story.catalogues.length >= maxFramesPerStory) {
      continue;
    }
    final pages = [...catalogue.pages]
      ..removeWhere((page) => page.imageUrl.trim().isEmpty)
      ..sort((left, right) => left.pageNumber.compareTo(right.pageNumber));

    if (pages.isNotEmpty) {
      for (final page
          in pages.take(maxFramesPerStory - story.catalogues.length)) {
        story.catalogues.add(DashboardStoryFrame(
          id: '${catalogue.url}:page:${page.pageNumber}',
          kind: DashboardStoryFrameKind.catalogue,
          imageUrl: page.imageUrl,
          imageUrls: page.imageUrls,
          title: catalogue.name,
          sourceUrl: catalogue.sourceUrl ?? catalogue.url,
          subtitle: 'Page ${page.pageNumber} of ${pages.length}',
          pageNumber: page.pageNumber,
          catalogue: catalogue,
        ));
      }
    } else if (catalogue.coverImageUrl != null) {
      story.catalogues.add(DashboardStoryFrame(
        id: '${catalogue.url}:cover',
        kind: DashboardStoryFrameKind.catalogue,
        imageUrl: catalogue.coverImageUrl!,
        imageUrls: [catalogue.coverImageUrl!],
        title: catalogue.name,
        sourceUrl: catalogue.sourceUrl ?? catalogue.url,
        subtitle: 'Catalogue cover',
        pageNumber: 1,
        catalogue: catalogue,
      ));
    }
  }

  for (final deal in deals) {
    if (!deal.hasImage) continue;
    final id = deal.retailerId.trim().isEmpty
        ? 'name:${_slug(deal.retailerName)}'
        : deal.retailerId;
    final story = storyFor(id, deal.retailerName);
    if (story == null ||
        story.catalogues.length + story.deals.length >= maxFramesPerStory) {
      continue;
    }
    story.deals.add(DashboardStoryFrame(
      id: 'deal:${deal.id}:${deal.productUrl ?? deal.sourceUrl}',
      kind: DashboardStoryFrameKind.deal,
      imageUrl: deal.gallery.first,
      imageUrls: deal.gallery,
      title: deal.title,
      sourceUrl: deal.productUrl ?? deal.sourceUrl,
      subtitle: deal.priceText,
      deal: deal,
    ));
  }

  return order
      .map((id) {
        final group = groups[id]!;
        final retailer = retailerById[id];
        return DashboardStory(
          id: id,
          retailerName: retailer?.name ?? group.retailerName,
          logoUrl: retailer?.logoUrl,
          frames: [...group.catalogues, ...group.deals]
              .take(maxFramesPerStory)
              .toList(growable: false),
        );
      })
      .where((story) => story.frames.isNotEmpty)
      .take(maxStories)
      .toList(growable: false);
}

String _slug(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
    .replaceAll(RegExp(r'^-+|-+$'), '');
