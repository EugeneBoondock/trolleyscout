import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../clothing_filters.dart';
import '../currency.dart';
import '../outfit_slots.dart';
import '../theme.dart';
import '../ux.dart';
import '../vton_photo_store.dart';
import '../widgets/common.dart';
import 'deals_screen.dart' show showMarketplaceProductViewer;
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
    this.canBuildOutfits = true,
  });

  final Api api;

  /// Outfit building is a Scout-plan perk: it renders once per garment, so
  /// it costs several fittings for one look.
  final bool canBuildOutfits;

  /// Where the fitting room sends a shopper whose plan does not include it.
  final VoidCallback? onUpgrade;

  /// Test seam — widget tests inject an in-memory store because real file I/O
  /// never completes inside their fake-async zone.
  final VtonPhotoStore? photoStore;

  @override
  State<ClothingScreen> createState() => _ClothingScreenState();
}

class _ClothingScreenState extends State<ClothingScreen> {
  Future<ClothingRail>? _future;
  String _retailerId = 'all';
  ClothingAudience _audience = ClothingAudience.any;
  GarmentType _type = GarmentType.any;
  String _query = '';
  Timer? _searchDebounce;
  final _searchController = TextEditingController();

  /// The outfit being assembled. Empty means the shopper is just browsing.
  final List<ClothingItem> _outfit = [];
  bool _outfitMode = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  /// The rail comes from the clothing scout, which reads fashion storefronts
  /// directly. The deals feed carries almost no clothing, so a fitting room
  /// built on it had nothing to try on.
  Future<ClothingRail> _load() => widget.api.clothingRail(
        retailerId: _retailerId,
        audience: _audience.name,
        garmentType: _type.name,
        query: _query,
        limit: 120,
      );

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  /// Typing searches the whole rail server-side, a beat after the last
  /// keystroke so a shopper is not billed a query per letter.
  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted || value.trim() == _query) return;
      _query = value.trim();
      _reload();
    });
  }

  /// Filtering happens server-side, so changing one reloads the rail. The
  /// block body matters: an arrow closure would hand setState the Future it
  /// assigned, which Flutter rejects.
  void _reload() {
    setState(() {
      _future = _load();
    });
  }

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future.catchError((_) => const ClothingRail());
  }

  void _openFittingRoom(List<ClothingItem> garments) {
    if (garments.isEmpty) return;
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => FittingRoomScreen(
        api: widget.api,
        garmentImageUrls:
            garments.map((item) => item.imageUrl).toList(growable: false),
        garmentTitle: garments.length == 1
            ? garments.first.title
            : '${garments.length}-piece outfit',
        garmentValueCents: garments.fold(
          0,
          (total, item) => total + item.priceCents,
        ),
        onUpgrade: widget.onUpgrade,
        photoStore: widget.photoStore,
      ),
    ));
  }

  /// Opens the garment the way a marketplace product opens: full picture,
  /// price, and a way through to the shop that sells it.
  void _openGarment(ClothingItem item) {
    showMarketplaceProductViewer(context, item.toDeal(), api: widget.api);
  }

  Future<void> _saveGarment(ClothingItem item) async {
    uxTap();
    try {
      await widget.api.saveDeal(item.toDeal());
      if (!mounted) return;
      showNotice(context, 'Saved to your deals.');
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  Future<void> _basketGarment(ClothingItem item) async {
    uxTap();
    try {
      // A basket item hangs off a saved deal, so the garment is saved first
      // and the freshly saved row is the one added.
      final saved = await widget.api.saveDeal(item.toDeal());
      final match = saved.where((deal) => deal.productUrl == item.productUrl);
      final target = match.isNotEmpty ? match.first : saved.firstOrNull;
      if (target == null) {
        if (mounted) showNotice(context, 'That garment could not be basketed.');
        return;
      }
      await widget.api.addBasketItem(target.id);
      if (!mounted) return;
      showNotice(context, 'Added to your basket.');
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  void _toggleOutfitPiece(ClothingItem item) {
    uxTap();
    final index = _outfit.indexWhere((piece) => piece.id == item.id);
    if (index >= 0) {
      setState(() => _outfit.removeAt(index));
      return;
    }
    // Two shirts cannot both be worn, but a shirt and a jacket can. When a
    // piece will not fit, say which place on the body is taken and what does
    // work instead — silently ignoring the tap reads as a broken button.
    final problem = outfitRejection(item, _outfit);
    if (problem != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(problem)));
      return;
    }
    setState(() => _outfit.add(item));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ClothingRail>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
            message: 'The fitting room rail is unavailable right now.',
            detail: snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : null,
            onRetry: _reload,
          );
        }
        final rail = snapshot.data!;
        final deals = rail.items;
        final retailers = [
          const MapEntry('all', 'All stores'),
          for (final retailer in rail.retailers)
            MapEntry(retailer.id, '${retailer.name} (${retailer.count})'),
        ];

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
                                  'Clothing from every store we scout try a '
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
                      searchController: _searchController,
                      onSearch: _onSearchChanged,
                      canBuildOutfits: widget.canBuildOutfits,
                      onOutfitLocked: () {
                        uxTap();
                        showNotice(
                          context,
                          'Building an outfit is a Scout plan perk it fits '
                          'every piece one at a time.',
                        );
                        widget.onUpgrade?.call();
                      },
                      onRetailer: (value) {
                        _retailerId = value;
                        _reload();
                      },
                      onAudience: (value) {
                        _audience = value;
                        _reload();
                      },
                      onType: (value) {
                        _type = value;
                        _reload();
                      },
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
                          message: rail.retailers.isEmpty
                              ? 'The rail is being stocked. Pull to refresh '
                                  'or check back shortly.'
                              : 'Nothing matches those filters yet. Try a '
                                  'different store, audience or garment.',
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(16, 4, 16,
                          _outfitMode && _outfit.isNotEmpty ? 128 : 16),
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
                            onOpen: () => _openGarment(deal),
                            onSave: () => _saveGarment(deal),
                            onBasket: () => _basketGarment(deal),
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
                  pieces: outfitInLayerOrder(_outfit),
                  onRemove: _toggleOutfitPiece,
                  // Dressed from the skin outwards: each render paints onto
                  // the previous result, so the order is the outfit.
                  onWear: () => _openFittingRoom(outfitInLayerOrder(_outfit)),
                ),
              ),
          ],
        );
      },
    );
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
    required this.searchController,
    required this.onSearch,
    required this.canBuildOutfits,
    required this.onOutfitLocked,
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
  final TextEditingController searchController;
  final ValueChanged<String> onSearch;
  final bool canBuildOutfits;
  final VoidCallback onOutfitLocked;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: TextField(
            key: const Key('clothing-search'),
            controller: searchController,
            onChanged: onSearch,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search clothes, brands, stores',
              prefixIcon: const Icon(Icons.search, size: 20),
              isDense: true,
              suffixIcon: searchController.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        searchController.clear();
                        onSearch('');
                      },
                    ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: DropdownButtonFormField<String>(
                    key: const Key('clothing-retailer-filter'),
                    initialValue: retailerId,
                    isDense: true,
                    // Store names carry their garment counts, so the label
                    // must be free to ellipsize rather than overflow.
                    isExpanded: true,
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
                    onTap:
                        canBuildOutfits ? onToggleOutfitMode : onOutfitLocked,
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
                        borderRadius: BorderRadius.circular(TS.controlRadius),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            canBuildOutfits
                                ? Icons.auto_awesome_rounded
                                : Icons.lock_outline_rounded,
                            size: 17,
                            color: outfitMode ? TS.yellow : TS.inkOf(context),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Outfit',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                              color:
                                  outfitMode ? Colors.white : TS.inkOf(context),
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

  final List<ClothingItem> pieces;
  final ValueChanged<ClothingItem> onRemove;
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
                                child: Image.network(
                                  piece.imageUrl,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) =>
                                      _GarmentPlaceholder(),
                                ),
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
    required this.onOpen,
    required this.onSave,
    required this.onBasket,
  });

  final ClothingItem deal;
  final VoidCallback onTryOn;
  final VoidCallback onToggleOutfit;
  final bool outfitMode;
  final bool inOutfit;
  final VoidCallback onOpen;
  final VoidCallback onSave;
  final VoidCallback onBasket;

  @override
  Widget build(BuildContext context) {
    final hasImage = deal.imageUrl.isNotEmpty;
    // The scout already worked out what shape this garment is, so the card
    // trusts that rather than re-reading the title on every build.
    final tryOnable = hasImage && deal.canTryOn;
    return PressableScale(
      child: GestureDetector(
        // Tapping the garment opens it, exactly as a shopper expects of a
        // picture in a shop — except while an outfit is being assembled,
        // when a tap means "add this piece".
        onTap: outfitMode && tryOnable ? onToggleOutfit : onOpen,
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
                              deal.imageUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stack) =>
                                  _GarmentPlaceholder(),
                            )
                          : _GarmentPlaceholder(),
                    ),
                    if (!outfitMode)
                      Positioned(
                        right: 6,
                        top: 6,
                        child: Column(
                          children: [
                            _CardAction(
                              icon: Icons.bookmark_border_rounded,
                              tooltip: 'Save ${deal.title}',
                              onTap: onSave,
                            ),
                            const SizedBox(height: 6),
                            _CardAction(
                              icon: Icons.add_shopping_cart_rounded,
                              tooltip: 'Add ${deal.title} to basket',
                              onTap: onBasket,
                            ),
                          ],
                        ),
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
                        Text(
                          Currency.of('ZAR').format(deal.priceCents),
                          style: TextStyle(
                            color: TS.redOf(context),
                            fontWeight: FontWeight.w900,
                            fontSize: 13,
                          ),
                        ),
                        if (deal.previousPriceCents != null) ...[
                          const SizedBox(width: 5),
                          Flexible(
                            child: Text(
                              Currency.of('ZAR')
                                  .format(deal.previousPriceCents!),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: TS.faintOf(context),
                                fontSize: 11,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    Text(
                      deal.retailerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 12),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      height: 36,
                      child: tryOnable
                          ? FilledButton.tonal(
                              onPressed: outfitMode ? onToggleOutfit : onTryOn,
                              style: FilledButton.styleFrom(
                                backgroundColor: inOutfit ? TS.ink : TS.yellow,
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
                                          ? (inOutfit
                                              ? 'Added'
                                              : 'Add to outfit')
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

/// A small round action that sits on the garment photo without hiding it.
class _CardAction extends StatelessWidget {
  const _CardAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: tooltip,
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          borderRadius: BorderRadius.circular(99),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: TS.surfaceOf(context).withValues(alpha: 0.92),
              shape: BoxShape.circle,
              border: Border.all(color: TS.lineSoftOf(context)),
            ),
            child: Icon(icon, size: 17, color: TS.inkOf(context)),
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
