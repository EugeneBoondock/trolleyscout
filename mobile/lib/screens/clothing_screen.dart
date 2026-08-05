import 'package:flutter/material.dart';

import '../api.dart';
import '../deal_categories.dart';
import '../deal_filters.dart';
import '../theme.dart';
import '../vton_photo_store.dart';
import '../widgets/common.dart';
import 'fitting_room_screen.dart';

/// The Clothing rail: every clothing deal the scouts found, each with a way
/// into the virtual fitting room.
class ClothingScreen extends StatefulWidget {
  const ClothingScreen({
    super.key,
    required this.api,
    this.onUpgrade,
    this.photoStore,
  });

  final Api api;

  /// Where the fitting room sends a shopper whose plan does not include it.
  final VoidCallback? onUpgrade;

  /// Test seam — widget tests inject an in-memory store because real file I/O
  /// never completes inside their fake-async zone.
  final VtonPhotoStore? photoStore;

  @override
  State<ClothingScreen> createState() => _ClothingScreenState();
}

class _ClothingScreenState extends State<ClothingScreen> {
  Future<List<Deal>>? _future;
  final DealClassificationCache _classificationCache =
      DealClassificationCache();

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Deal>> _load({bool forceLive = false}) async {
    final result = await widget.api.discovery(forceLive: forceLive);
    return filterDeals(
      result.deals,
      category: DealCategory.clothing,
      classificationCache: _classificationCache,
    );
  }

  Future<void> _refresh() async {
    final future = _load(forceLive: true);
    setState(() => _future = future);
    await future.catchError((_) => const <Deal>[]);
  }

  void _openFittingRoom(Deal deal) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => FittingRoomScreen(
        api: widget.api,
        garmentImageUrl: deal.gallery.first,
        garmentTitle: deal.title,
        onUpgrade: widget.onUpgrade,
        photoStore: widget.photoStore,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Deal>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
            message: 'Clothing deals are unavailable right now.',
            detail: snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : null,
            onRetry: () => setState(() => _future = _load()),
          );
        }
        final deals = snapshot.data!;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              const SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: ScreenHeader(
                    eyebrow: 'Clothing',
                    title: 'Dress for less',
                    description:
                        'Clothing and footwear deals from every store we '
                        'scout — and a fitting room to try them on first.',
                  ),
                ),
              ),
              if (deals.isEmpty)
                const SliverPadding(
                  padding: EdgeInsets.all(16),
                  sliver: SliverToBoxAdapter(
                    child: EmptyCard(
                      icon: Icons.checkroom_outlined,
                      message: 'No clothing deals on the rail right now. '
                          'Pull to refresh or check back soon.',
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverGrid.builder(
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 260,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      mainAxisExtent: 300,
                    ),
                    itemCount: deals.length,
                    itemBuilder: (context, index) => _ClothingDealCard(
                      deal: deals[index],
                      onTryOn: () => _openFittingRoom(deals[index]),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ClothingDealCard extends StatelessWidget {
  const _ClothingDealCard({required this.deal, required this.onTryOn});

  final Deal deal;
  final VoidCallback onTryOn;

  @override
  Widget build(BuildContext context) {
    final hasImage = deal.hasImage;
    return PressableScale(
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: TS.cardFill(context),
        foregroundDecoration: TS.cardStroke(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SizedBox(
                width: double.infinity,
                child: hasImage
                    ? Image.network(
                        deal.gallery.first,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stack) =>
                            _GarmentPlaceholder(),
                      )
                    : _GarmentPlaceholder(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    deal.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (deal.priceText != null) ...[
                        Text(
                          deal.priceText!,
                          style: TextStyle(
                            color: TS.redOf(context),
                            fontWeight: FontWeight.w900,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],
                      Expanded(
                        child: Text(
                          deal.retailerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: TS.mutedOf(context), fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                  if (hasImage) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      height: 36,
                      child: FilledButton.tonal(
                        onPressed: onTryOn,
                        style: FilledButton.styleFrom(
                          backgroundColor: TS.yellow,
                          foregroundColor: TS.ink,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.checkroom, size: 16),
                            SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                'Try it on',
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontWeight: FontWeight.w800),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GarmentPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        color: TS.surfaceSoftOf(context),
        alignment: Alignment.center,
        child: Icon(Icons.checkroom_outlined,
            size: 40, color: TS.mutedOf(context)),
      );
}
