import 'package:flutter/material.dart';

import '../api.dart';
import '../clothing_filters.dart';
import '../deal_filters.dart';
import '../theme.dart';
import '../ux.dart';
import '../vton_photo_store.dart';
import '../widgets/common.dart';
import 'fitting_room_screen.dart';
import 'saved_fits_screen.dart';

/// The Fitting room: every wearable deal the scouts found, filterable by
/// store, who it is for and what it is — with a try-on for anything the model
/// can actually dress someone in, and an outfit builder for the rest.
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
  String _retailerId = 'all';
  ClothingAudience _audience = ClothingAudience.any;
  GarmentType _type = GarmentType.any;

  /// The outfit being assembled. Empty means the shopper is just browsing.
  final List<Deal> _outfit = [];
  bool _outfitMode = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Deal>> _load({bool forceLive = false}) async {
    // The rail opens from the cached feed the rest of the app already uses;
    // only a pull-to-refresh pays for a live sweep. Waiting on a full live
    // discovery made the page feel broken on open.
    final result = await widget.api.discovery(
      forceLive: forceLive,
      summary: !forceLive,
    );
    // Clothing category first, then the wearable test: mirrors, hangers and
    // irons live beside clothes but nobody puts them on.
    return result.deals
        .where((deal) => isWearableClothing(
              deal,
              classification: _classificationCache.classify(deal),
            ))
        .toList(growable: false);
  }

  Future<void> _refresh() async {
    final future = _load(forceLive: true);
    setState(() => _future = future);
    await future.catchError((_) => const <Deal>[]);
  }

  void _openFittingRoom(List<Deal> garments) {
    if (garments.isEmpty) return;
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => FittingRoomScreen(
        api: widget.api,
        garmentImageUrls:
            garments.map((deal) => deal.gallery.first).toList(growable: false),
        garmentTitle: garments.length == 1
            ? garments.first.title
            : '${garments.length}-piece outfit',
        onUpgrade: widget.onUpgrade,
        photoStore: widget.photoStore,
      ),
    ));
  }

  void _toggleOutfitPiece(Deal deal) {
    uxTap();
    setState(() {
      final index = _outfit.indexWhere((piece) => piece.id == deal.id);
      if (index >= 0) {
        _outfit.removeAt(index);
      } else if (_outfit.length < 4) {
        _outfit.add(deal);
      }
    });
  }

  List<Deal> _visible(List<Deal> deals) => filterClothingDeals(
        deals,
        retailerId: _retailerId,
        audience: _audience,
        type: _type,
      );

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
        final all = snapshot.data!;
        final deals = _visible(all);
        final retailers = _retailerOptions(all);

        return Stack(
          children: [
            RefreshIndicator(
              onRefresh: _refresh,
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                    sliver: SliverToBoxAdapter(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Expanded(
                            child: ScreenHeader(
                              eyebrow: 'Fitting room',
                              title: 'See it on you first',
                              description:
                                  'Clothing from every store we scout — try a '
                                  'piece on, or build a whole outfit before '
                                  'you spend.',
                            ),
                          ),
                          IconButton(
                            key: const Key('open-saved-fits'),
                            tooltip: 'Your saved fits',
                            onPressed: () {
                              uxTap();
                              Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => const SavedFitsScreen(),
                                ),
                              );
                            },
                            icon: const Icon(Icons.bookmark_border_rounded),
                          ),
                        ],
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: _FilterBar(
                      retailers: retailers,
                      retailerId: _retailerId,
                      audience: _audience,
                      type: _type,
                      outfitMode: _outfitMode,
                      onRetailer: (value) =>
                          setState(() => _retailerId = value),
                      onAudience: (value) => setState(() => _audience = value),
                      onType: (value) => setState(() => _type = value),
                      onToggleOutfitMode: () => setState(() {
                        uxTap();
                        _outfitMode = !_outfitMode;
                        if (!_outfitMode) _outfit.clear();
                      }),
                    ),
                  ),
                  if (deals.isEmpty)
                    SliverPadding(
                      padding: const EdgeInsets.all(16),
                      sliver: SliverToBoxAdapter(
                        child: EmptyCard(
                          icon: Icons.checkroom_outlined,
                          message: all.isEmpty
                              ? 'No clothing deals on the rail right now. '
                                  'Pull to refresh or check back soon.'
                              : 'Nothing matches those filters yet. Try a '
                                  'different store, audience or garment.',
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(
                          16, 4, 16, _outfitMode && _outfit.isNotEmpty ? 128 : 16),
                      sliver: SliverGrid.builder(
                        gridDelegate:
                            const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 260,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          mainAxisExtent: 312,
                        ),
                        itemCount: deals.length,
                        itemBuilder: (context, index) {
                          final deal = deals[index];
                          final inOutfit =
                              _outfit.any((piece) => piece.id == deal.id);
                          return _ClothingDealCard(
                            deal: deal,
                            outfitMode: _outfitMode,
                            inOutfit: inOutfit,
                            onTryOn: () => _openFittingRoom([deal]),
                            onToggleOutfit: () => _toggleOutfitPiece(deal),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
            if (_outfitMode && _outfit.isNotEmpty)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: _OutfitTray(
                  pieces: _outfit,
                  onRemove: _toggleOutfitPiece,
                  onWear: () => _openFittingRoom(_outfit),
                ),
              ),
          ],
        );
      },
    );
  }

  List<MapEntry<String, String>> _retailerOptions(List<Deal> deals) {
    final names = <String, String>{};
    for (final deal in deals) {
      if (deal.retailerId.isNotEmpty && deal.retailerName.isNotEmpty) {
        names.putIfAbsent(deal.retailerId, () => deal.retailerName);
      }
    }
    final entries = names.entries.toList()
      ..sort((left, right) => left.value.compareTo(right.value));
    return [const MapEntry('all', 'All stores'), ...entries];
  }
}

/// Store, audience and garment filters on one calm surface — chips the thumb
/// can reach, nothing hidden behind a menu.
class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.retailers,
    required this.retailerId,
    required this.audience,
    required this.type,
    required this.outfitMode,
    required this.onRetailer,
    required this.onAudience,
    required this.onType,
    required this.onToggleOutfitMode,
  });

  final List<MapEntry<String, String>> retailers;
  final String retailerId;
  final ClothingAudience audience;
  final GarmentType type;
  final bool outfitMode;
  final ValueChanged<String> onRetailer;
  final ValueChanged<ClothingAudience> onAudience;
  final ValueChanged<GarmentType> onType;
  final VoidCallback onToggleOutfitMode;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: DropdownButtonFormField<String>(
                    key: const Key('clothing-retailer-filter'),
                    initialValue: retailerId,
                    isDense: true,
                    decoration: const InputDecoration(
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      prefixIcon: Icon(Icons.storefront_outlined, size: 18),
                    ),
                    items: [
                      for (final entry in retailers)
                        DropdownMenuItem(
                          value: entry.key,
                          child: Text(
                            entry.value,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                    ],
                    onChanged: (value) {
                      if (value != null) onRetailer(value);
                    },
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Semantics(
                button: true,
                label: outfitMode
                    ? 'Stop building an outfit'
                    : 'Build an outfit from several pieces',
                child: PressableScale(
                  child: GestureDetector(
                    onTap: onToggleOutfitMode,
                    child: Container(
                      key: const Key('outfit-mode-toggle'),
                      height: 44,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: outfitMode ? TS.ink : TS.surfaceOf(context),
                        border: Border.all(
                          color: outfitMode ? TS.ink : TS.lineOf(context),
                          width: 1.5,
                        ),
                        borderRadius:
                            BorderRadius.circular(TS.controlRadius),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.auto_awesome_rounded,
                            size: 17,
                            color: outfitMode
                                ? TS.yellow
                                : TS.inkOf(context),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Outfit',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                              color: outfitMode
                                  ? Colors.white
                                  : TS.inkOf(context),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            children: [
              _chip(context, 'Everyone', audience == ClothingAudience.any,
                  () => onAudience(ClothingAudience.any)),
              for (final option in clothingAudienceOptions)
                _chip(context, option.label, audience == option.id,
                    () => onAudience(option.id)),
              Container(
                width: 1,
                height: 20,
                margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                color: TS.lineSoftOf(context),
              ),
              _chip(context, 'All items', type == GarmentType.any,
                  () => onType(GarmentType.any)),
              for (final option in garmentTypeOptions)
                _chip(context, '${option.icon} ${option.label}',
                    type == option.id, () => onType(option.id)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _chip(
    BuildContext context,
    String label,
    bool active,
    VoidCallback onTap,
  ) =>
      Padding(
        padding: const EdgeInsets.only(right: 6),
        child: GestureDetector(
          onTap: () {
            uxTap();
            onTap();
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            curve: Curves.easeOut,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: active ? TS.inkOf(context) : TS.surfaceOf(context),
              border: Border.all(
                color: active ? TS.inkOf(context) : TS.lineOf(context),
                width: 1.5,
              ),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: active ? TS.bgOf(context) : TS.inkOf(context),
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      );
}

/// The outfit being assembled, docked at the bottom: thumbnails of each
/// piece, one tap to drop a piece, one button to wear the lot.
class _OutfitTray extends StatelessWidget {
  const _OutfitTray({
    required this.pieces,
    required this.onRemove,
    required this.onWear,
  });

  final List<Deal> pieces;
  final ValueChanged<Deal> onRemove;
  final VoidCallback onWear;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      tween: Tween(begin: 1, end: 0),
      builder: (context, value, child) => Transform.translate(
        offset: Offset(0, value * 120),
        child: child,
      ),
      child: Container(
        key: const Key('outfit-tray'),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 16),
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          border: Border(
            top: BorderSide(color: TS.lineOf(context), width: 2),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.10),
              blurRadius: 18,
              offset: const Offset(0, -6),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: pieces.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final piece = pieces[index];
                      return Semantics(
                        button: true,
                        label: 'Remove ${piece.title} from the outfit',
                        child: GestureDetector(
                          onTap: () => onRemove(piece),
                          child: Stack(
                            children: [
                              Container(
                                width: 52,
                                height: 52,
                                clipBehavior: Clip.antiAlias,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                      color: TS.lineOf(context), width: 1.5),
                                ),
                                child: piece.hasImage
                                    ? Image.network(
                                        piece.gallery.first,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, __, ___) =>
                                            _GarmentPlaceholder(),
                                      )
                                    : _GarmentPlaceholder(),
                              ),
                              Positioned(
                                right: 0,
                                top: 0,
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: BoxDecoration(
                                    color: TS.redOf(context),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close,
                                      size: 11, color: Colors.white),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                key: const Key('wear-outfit'),
                onPressed: onWear,
                style: FilledButton.styleFrom(
                  backgroundColor: TS.ink,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 14),
                ),
                icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                label: Text(
                  'Wear ${pieces.length}',
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ClothingDealCard extends StatelessWidget {
  const _ClothingDealCard({
    required this.deal,
    required this.onTryOn,
    required this.onToggleOutfit,
    required this.outfitMode,
    required this.inOutfit,
  });

  final Deal deal;
  final VoidCallback onTryOn;
  final VoidCallback onToggleOutfit;
  final bool outfitMode;
  final bool inOutfit;

  @override
  Widget build(BuildContext context) {
    final hasImage = deal.hasImage;
    final tryOnable = hasImage && canTryOnDeal(deal);
    return PressableScale(
      child: GestureDetector(
        onTap: outfitMode && tryOnable ? onToggleOutfit : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          clipBehavior: Clip.antiAlias,
          decoration: TS.cardFill(context),
          foregroundDecoration: inOutfit
              ? BoxDecoration(
                  border: Border.all(color: TS.redOf(context), width: 3),
                  borderRadius: BorderRadius.circular(TS.cardRadius),
                )
              : TS.cardStroke(context),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      height: double.infinity,
                      child: hasImage
                          ? Image.network(
                              deal.gallery.first,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stack) =>
                                  _GarmentPlaceholder(),
                            )
                          : _GarmentPlaceholder(),
                    ),
                    if (inOutfit)
                      Positioned(
                        left: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: TS.redOf(context),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.check_rounded,
                                  size: 12, color: Colors.white),
                              SizedBox(width: 3),
                              Text('In outfit',
                                  style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900)),
                            ],
                          ),
                        ),
                      ),
                  ],
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
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      height: 36,
                      child: tryOnable
                          ? FilledButton.tonal(
                              onPressed:
                                  outfitMode ? onToggleOutfit : onTryOn,
                              style: FilledButton.styleFrom(
                                backgroundColor:
                                    inOutfit ? TS.ink : TS.yellow,
                                foregroundColor:
                                    inOutfit ? Colors.white : TS.ink,
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 8),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    outfitMode
                                        ? (inOutfit
                                            ? Icons.check_rounded
                                            : Icons.add_rounded)
                                        : Icons.checkroom,
                                    size: 16,
                                  ),
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: Text(
                                      outfitMode
                                          ? (inOutfit ? 'Added' : 'Add to outfit')
                                          : 'Try it on',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : Center(
                              child: Text(
                                'View in store',
                                style: TextStyle(
                                  color: TS.mutedOf(context),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
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
