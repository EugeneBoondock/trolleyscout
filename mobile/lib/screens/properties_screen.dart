import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../recent_searches_store.dart';
import '../saved_properties_store.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';
import '../widgets/scout_mark.dart';
import '../widgets/skeleton.dart';

/// Properties Scout — a Household-tier tool that searches the SA property
/// portals (Property24, Private Property) for homes to buy or rent. Everyone
/// sees this page; logged-out shoppers are asked to sign in, and members without
/// the Household plan (and no admin grant) see an upgrade card.
class PropertiesScreen extends StatefulWidget {
  const PropertiesScreen({
    super.key,
    required this.api,
    required this.account,
    required this.isAuthenticated,
    required this.onWantsAuth,
    required this.onUpgrade,
  });

  final Api api;
  final MemberAccount? account;
  final bool isAuthenticated;
  final VoidCallback onWantsAuth;
  final VoidCallback onUpgrade;

  @override
  State<PropertiesScreen> createState() => _PropertiesScreenState();
}

class _PropertiesScreenState extends State<PropertiesScreen> {
  final _searchController = TextEditingController();
  final _minPriceController = TextEditingController();
  final _maxPriceController = TextEditingController();
  final _store = SavedPropertiesStore();
  final _recentStore = RecentPropertySearchesStore();
  List<String> _recent = const [];

  String _listingType = 'sale';
  int? _minBeds;
  String _sort = 'relevance';
  String _view = 'search'; // 'search' | 'saved'

  List<PropertyListing> _listings = const [];
  List<PropertyListing> _saved = const [];
  Set<String> _savedKeys = const {};
  bool _loading = false;
  bool _locating = false;
  bool _searched = false;
  bool _filtersExpanded = true;
  bool _lastWasNearMe = false;
  String? _error;
  String? _resultLocation;

  @override
  void initState() {
    super.initState();
    _loadSaved();
    _loadRecent();
  }

  Future<void> _loadRecent() async {
    final items = await _recentStore.load();
    if (!mounted) return;
    setState(() => _recent = items);
  }

  /// Runs a search for a tapped suggestion chip — fills the field and searches.
  void _runSuggestion(String query) {
    _searchController.text = query;
    _search();
  }

  Future<void> _loadSaved() async {
    final items = await _store.load();
    if (!mounted) return;
    setState(() {
      _saved = items;
      _savedKeys = items.map(SavedPropertiesStore.keyOf).toSet();
    });
  }

  Future<void> _toggleSave(PropertyListing listing) async {
    final key = SavedPropertiesStore.keyOf(listing);
    final wasSaved = _savedKeys.contains(key);
    uxTap();
    final items = await _store.toggle(listing);
    if (!mounted) return;
    setState(() {
      _saved = items;
      _savedKeys = items.map(SavedPropertiesStore.keyOf).toSet();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(wasSaved ? 'Removed from saved' : 'Saved'),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  Future<void> _share(PropertyListing listing) async {
    await Clipboard.setData(ClipboardData(text: listing.listingUrl));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Link copied — paste to share'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    super.dispose();
  }

  int? _amount(TextEditingController controller) {
    final digits = controller.text.replaceAll(RegExp(r'[^0-9]'), '');
    return digits.isEmpty ? null : int.tryParse(digits);
  }

  Future<void> _search({double? lat, double? lon}) async {
    final query = _searchController.text.trim();
    final hasCoords = lat != null && lon != null;
    _lastWasNearMe = hasCoords;
    if (!hasCoords && query.length < 2) {
      setState(() => _error = 'Enter a city, suburb, or area to search.');
      return;
    }
    FocusScope.of(context).unfocus();
    uxTap();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.searchProperties(
        query: hasCoords ? '' : query,
        listingType: _listingType,
        lat: lat,
        lon: lon,
        minBeds: _minBeds,
        minPrice: _amount(_minPriceController),
        maxPrice: _amount(_maxPriceController),
        sort: _sort,
      );
      if (!mounted) return;
      if (result.listings.isNotEmpty) uxSuccess();
      // Remember successful searches for the recognition-over-recall chips. Save
      // the canonical resolved place (e.g. "Edenvale") so re-tapping it re-resolves.
      if (!hasCoords && result.listings.isNotEmpty) {
        final label = result.locationText?.trim().isNotEmpty == true
            ? result.locationText!.trim()
            : query;
        _recentStore.add(label).then((items) {
          if (mounted) setState(() => _recent = items);
        });
      }
      setState(() {
        _listings = result.listings;
        _resultLocation = result.locationText;
        _loading = false;
        _searched = true;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Properties Scout is unavailable right now. Try again.';
      });
    }
  }

  /// Re-runs whatever the shopper last tried — near-me re-reads the location,
  /// a text search re-reads the field — so an error is one tap from recovery.
  void _retryLast() {
    if (_lastWasNearMe) {
      _nearMe();
    } else {
      _search();
    }
  }

  /// Uses the device location to search homes near the shopper's nearest town.
  Future<void> _nearMe() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _locating = true;
      _error = null;
    });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (!mounted) return;
        setState(() {
          _locating = false;
          _error = 'Allow location access to find homes near you.';
        });
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      if (!mounted) return;
      setState(() => _locating = false);
      await _search(lat: pos.latitude, lon: pos.longitude);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _locating = false;
        _error = 'Could not read your location. Try again.';
      });
    }
  }

  Future<void> _open(PropertyListing listing) async {
    // Uri.parse('') succeeds as a scheme-less URI, so guard on scheme too.
    final uri = Uri.tryParse(listing.listingUrl);
    if (uri == null || !uri.hasScheme) return;
    uxTap();
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open that listing.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isAuthenticated) {
      return _GateCard(
        icon: Icons.lock_open_outlined,
        title: 'Sign in for Properties Scout',
        message: 'Log in to search homes to buy or rent across South Africa. '
            'Properties Scout is included with the Household plan.',
        actionLabel: 'Log in',
        onAction: widget.onWantsAuth,
      );
    }

    if (widget.account?.propertiesAccess != true) {
      return _UpsellCard(onUpgrade: widget.onUpgrade);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final availableForExpandedFilters = constraints.maxHeight - 220;
        final expandedFilterHeight = availableForExpandedFilters < 160
            ? 160.0
            : availableForExpandedFilters;

        return Column(
          children: [
            _ViewSwitch(
              view: _view,
              savedCount: _saved.length,
              onChanged: (value) => setState(() => _view = value),
            ),
            if (_view == 'search')
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: _filtersExpanded
                      ? expandedFilterHeight
                      : constraints.maxHeight,
                ),
                child: SingleChildScrollView(
                  child: _SearchBar(
                    controller: _searchController,
                    minPriceController: _minPriceController,
                    maxPriceController: _maxPriceController,
                    listingType: _listingType,
                    minBeds: _minBeds,
                    sort: _sort,
                    loading: _loading,
                    locating: _locating,
                    filtersExpanded: _filtersExpanded,
                    onListingType: (value) =>
                        setState(() => _listingType = value),
                    onMinBeds: (value) => setState(() => _minBeds = value),
                    onSort: (value) => setState(() => _sort = value),
                    onToggleFilters: () =>
                        setState(() => _filtersExpanded = !_filtersExpanded),
                    onSearch: () => _search(),
                    onNearMe: _nearMe,
                  ),
                ),
              ),
            Expanded(child: _view == 'search' ? _buildBody() : _buildSaved()),
          ],
        );
      },
    );
  }

  Widget _buildSaved() {
    if (_saved.isEmpty) {
      return const _Message(
        mascot: true,
        icon: Icons.favorite_border,
        text: 'No saved homes yet — tap the heart on any home to keep it here. '
            'Your saved homes follow your account across devices.',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      itemCount: _saved.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8, left: 2),
            child: Text(
              '${_saved.length} saved ${_saved.length == 1 ? 'home' : 'homes'}',
              style: TextStyle(
                  color: TS.mutedOf(context), fontWeight: FontWeight.w700),
            ),
          );
        }
        final listing = _saved[index - 1];
        return _PropertyCard(
          listing: listing,
          onOpen: _open,
          saved: _savedKeys.contains(SavedPropertiesStore.keyOf(listing)),
          onToggleSave: () => _toggleSave(listing),
          onShare: () => _share(listing),
        );
      },
    );
  }

  Widget _buildBody() {
    if (_loading) {
      // Property-shaped skeletons keep the layout stable and read as
      // "photos are seconds away", never a dead spinner.
      return const SkeletonPane(rows: 3, rowHeight: 260, media: true);
    }
    if (_error != null) {
      // Errors always offer a way forward (retry the last search), never a
      // dead end. _retryLast re-runs near-me or the text search as appropriate.
      return ErrorPane(message: _error!, onRetry: _retryLast);
    }
    if (!_searched) {
      // A place to start, not a blank page: recent searches (recognition over
      // recall) plus a few popular metros to tap.
      return _StartSuggestions(
        recent: _recent,
        popular: kPopularPropertyLocations,
        onPick: _runSuggestion,
      );
    }
    if (_listings.isEmpty) {
      final where = _resultLocation != null ? ' near ${_resultLocation!}' : '';
      return _Message(
        icon: Icons.search_off,
        text:
            'No ${_listingType == 'rent' ? 'rentals' : 'listings'} found$where. '
            'Try another location or widen your filters.',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      itemCount: _listings.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          final where = _resultLocation ?? 'your area';
          return Padding(
            padding: const EdgeInsets.only(bottom: 8, left: 2),
            child: Text(
              '${_listings.length} ${_listingType == 'rent' ? 'to rent' : 'for sale'} near $where',
              style: TextStyle(
                  color: TS.mutedOf(context), fontWeight: FontWeight.w700),
            ),
          );
        }
        final listing = _listings[index - 1];
        return _PropertyCard(
          listing: listing,
          onOpen: _open,
          saved: _savedKeys.contains(SavedPropertiesStore.keyOf(listing)),
          onToggleSave: () => _toggleSave(listing),
          onShare: () => _share(listing),
        );
      },
    );
  }
}

class _SearchBar extends StatelessWidget {
  const _SearchBar({
    required this.controller,
    required this.minPriceController,
    required this.maxPriceController,
    required this.listingType,
    required this.minBeds,
    required this.sort,
    required this.loading,
    required this.locating,
    required this.filtersExpanded,
    required this.onListingType,
    required this.onMinBeds,
    required this.onSort,
    required this.onToggleFilters,
    required this.onSearch,
    required this.onNearMe,
  });

  final TextEditingController controller;
  final TextEditingController minPriceController;
  final TextEditingController maxPriceController;
  final String listingType;
  final int? minBeds;
  final String sort;
  final bool loading;
  final bool locating;
  final bool filtersExpanded;
  final ValueChanged<String> onListingType;
  final ValueChanged<int?> onMinBeds;
  final ValueChanged<String> onSort;
  final VoidCallback onToggleFilters;
  final VoidCallback onSearch;
  final VoidCallback onNearMe;

  @override
  Widget build(BuildContext context) {
    final toggleLabel =
        filtersExpanded ? 'Hide search filters' : 'Show search filters';

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: TS.bgOf(context),
        border: Border(bottom: BorderSide(color: TS.lineOf(context), width: 2)),
      ),
      child: _MotionAwareSize(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SegmentedButton<String>(
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: TS.yellow,
                    selectedForegroundColor: TS.ink,
                  ),
                  segments: const [
                    ButtonSegment(value: 'sale', label: Text('Buy')),
                    ButtonSegment(value: 'rent', label: Text('Rent')),
                  ],
                  selected: {listingType},
                  onSelectionChanged: (set) => onListingType(set.first),
                ),
                const Spacer(),
                SizedBox.square(
                  dimension: 48,
                  child: IconButton(
                    tooltip: toggleLabel,
                    style: IconButton.styleFrom(
                      foregroundColor: TS.inkOf(context),
                      side: BorderSide(color: TS.lineOf(context), width: 2),
                      shape: const RoundedRectangleBorder(),
                      minimumSize: const Size.square(48),
                      padding: EdgeInsets.zero,
                    ),
                    onPressed: onToggleFilters,
                    icon: Icon(filtersExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down),
                  ),
                ),
              ],
            ),
            if (filtersExpanded) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: controller,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => onSearch(),
                      decoration: InputDecoration(
                        isDense: true,
                        prefixIcon: const Icon(Icons.search, size: 20),
                        hintText: 'City, suburb or area',
                        border: OutlineInputBorder(
                            borderSide:
                                BorderSide(color: TS.lineSoftOf(context))),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: TS.red,
                      foregroundColor: Colors.white,
                      shape: const RoundedRectangleBorder(),
                      padding: const EdgeInsets.symmetric(
                          vertical: 16, horizontal: 18),
                    ),
                    onPressed: loading ? null : onSearch,
                    child: const Text('Search'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: TS.inkOf(context),
                    side: BorderSide(color: TS.lineOf(context), width: 2),
                    shape: const RoundedRectangleBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: (loading || locating) ? null : onNearMe,
                  icon: locating
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.near_me_outlined, size: 18),
                  label: Text(locating ? 'Locating…' : 'Search near me'),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _LabeledDropdown<int?>(
                      label: 'Min beds',
                      value: minBeds,
                      items: const [
                        DropdownMenuItem(value: null, child: Text('Any')),
                        DropdownMenuItem(value: 1, child: Text('1+')),
                        DropdownMenuItem(value: 2, child: Text('2+')),
                        DropdownMenuItem(value: 3, child: Text('3+')),
                        DropdownMenuItem(value: 4, child: Text('4+')),
                        DropdownMenuItem(value: 5, child: Text('5+')),
                      ],
                      onChanged: onMinBeds,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: _LabeledDropdown<String>(
                      label: 'Sort',
                      value: sort,
                      items: const [
                        DropdownMenuItem(
                            value: 'relevance', child: Text('Most relevant')),
                        DropdownMenuItem(
                            value: 'price_low',
                            child: Text('Price: low to high')),
                        DropdownMenuItem(
                            value: 'price_high',
                            child: Text('Price: high to low')),
                        DropdownMenuItem(
                            value: 'beds', child: Text('Most bedrooms')),
                      ],
                      onChanged: (value) => onSort(value ?? 'relevance'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                      child: _PriceField(
                          controller: minPriceController,
                          hint: 'Min price (R)')),
                  const SizedBox(width: 8),
                  Expanded(
                      child: _PriceField(
                          controller: maxPriceController,
                          hint: 'Max price (R)')),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MotionAwareSize extends StatelessWidget {
  const _MotionAwareSize({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return child;
    return AnimatedSize(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: child,
    );
  }
}

class _PriceField extends StatelessWidget {
  const _PriceField({required this.controller, required this.hint});

  final TextEditingController controller;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      decoration: InputDecoration(
        isDense: true,
        hintText: hint,
        border: OutlineInputBorder(
            borderSide: BorderSide(color: TS.lineSoftOf(context))),
      ),
    );
  }
}

class _LabeledDropdown<T> extends StatelessWidget {
  const _LabeledDropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(
        isDense: true,
        labelText: label,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        border: OutlineInputBorder(
            borderSide: BorderSide(color: TS.lineSoftOf(context))),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isDense: true,
          isExpanded: true,
          items: items,
          onChanged: onChanged,
        ),
      ),
    );
  }
}

class _PropertyCard extends StatelessWidget {
  const _PropertyCard({
    required this.listing,
    required this.onOpen,
    required this.saved,
    required this.onToggleSave,
    required this.onShare,
  });

  final PropertyListing listing;
  final void Function(PropertyListing) onOpen;
  final bool saved;
  final VoidCallback onToggleSave;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final isRent = listing.listingType == 'rent';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: PressableScale(
        child: InkWell(
        onTap: () => onOpen(listing),
        child: Container(
          decoration: TS.card(context),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 16 / 10,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _PropertyGallery(
                      images: listing.gallery,
                      onTap: () => onOpen(listing),
                    ),
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        color: isRent ? const Color(0xFFBFE3D0) : TS.yellow,
                        child: Text(
                          isRent ? 'TO RENT' : 'FOR SALE',
                          style: const TextStyle(
                              color: TS.ink,
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.4),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        color: Colors.black.withValues(alpha: 0.78),
                        child: Text(
                          listing.portalName.toUpperCase(),
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.4),
                        ),
                      ),
                    ),
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Row(
                        children: [
                          _CircleAction(
                            icon:
                                saved ? Icons.favorite : Icons.favorite_border,
                            tooltip:
                                saved ? 'Remove from saved' : 'Save this home',
                            background: saved
                                ? TS.red
                                : Colors.white.withValues(alpha: 0.92),
                            foreground: saved ? Colors.white : TS.ink,
                            onTap: onToggleSave,
                          ),
                          const SizedBox(width: 6),
                          _CircleAction(
                            icon: Icons.ios_share,
                            tooltip: 'Share this home',
                            background: Colors.white.withValues(alpha: 0.92),
                            foreground: TS.ink,
                            onTap: onShare,
                          ),
                        ],
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
                      listing.priceText ?? 'Price on application',
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(listing.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (listing.location != null) ...[
                      const SizedBox(height: 2),
                      Text(listing.location!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: TS.mutedOf(context))),
                    ],
                    _FeatureRow(listing: listing),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

/// The bed / bath / garage icon row that every property portal (Property24,
/// Private Property, Airbnb) shows on a card. Matching that shared convention —
/// Jakob's Law — lets shoppers read our cards at a glance without relearning a
/// bespoke layout. Missing figures are omitted; each carries a screen-reader
/// label. Bathrooms may be a half (an en-suite), so they are trimmed, not floored.
class _FeatureRow extends StatelessWidget {
  const _FeatureRow({required this.listing});

  final PropertyListing listing;

  @override
  Widget build(BuildContext context) {
    final items = <Widget>[
      if (listing.bedrooms != null)
        _feature(context, Icons.bed_outlined, '${listing.bedrooms}',
            listing.bedrooms == 1 ? 'bedroom' : 'bedrooms'),
      if (listing.bathrooms != null)
        _feature(context, Icons.bathtub_outlined, _trimCount(listing.bathrooms!),
            listing.bathrooms == 1 ? 'bathroom' : 'bathrooms'),
      if (listing.garages != null)
        _feature(context, Icons.garage_outlined, '${listing.garages}',
            listing.garages == 1 ? 'garage' : 'garages'),
    ];
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(spacing: 14, runSpacing: 4, children: items),
    );
  }

  Widget _feature(
      BuildContext context, IconData icon, String value, String semantic) {
    return Semantics(
      label: '$value $semantic',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: TS.faintOf(context)),
          const SizedBox(width: 4),
          Text(value,
              style: TextStyle(
                  color: TS.mutedOf(context),
                  fontWeight: FontWeight.w800,
                  fontSize: 13)),
        ],
      ),
    );
  }

  static String _trimCount(num value) =>
      value == value.roundToDouble() ? '${value.toInt()}' : '$value';
}

/// A round translucent overlay button (save / share) that consumes its own tap
/// so it never triggers the card's open action.
class _CircleAction extends StatelessWidget {
  const _CircleAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    required this.background,
    required this.foreground,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Tooltip(
          message: tooltip,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Icon(icon, size: 18, color: foreground),
          ),
        ),
      ),
    );
  }
}

/// Swipeable photo gallery for a listing card: a PageView with a photo counter
/// and dots. Falls back to a placeholder when the portal gave no usable image.
class _PropertyGallery extends StatefulWidget {
  const _PropertyGallery({required this.images, required this.onTap});

  final List<String> images;
  final VoidCallback onTap;

  @override
  State<_PropertyGallery> createState() => _PropertyGalleryState();
}

class _PropertyGalleryState extends State<_PropertyGallery> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _fallback(BuildContext context) => ColoredBox(
        color: TS.surfaceSoftOf(context),
        child: Icon(Icons.apartment_outlined,
            size: 48, color: TS.faintOf(context)),
      );

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    if (images.isEmpty) {
      return GestureDetector(onTap: widget.onTap, child: _fallback(context));
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          controller: _controller,
          itemCount: images.length,
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (context, i) => GestureDetector(
            onTap: widget.onTap,
            child: Image.network(
              images[i],
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _fallback(context),
              loadingBuilder: (context, child, progress) =>
                  progress == null ? child : _fallback(context),
            ),
          ),
        ),
        if (images.length > 1)
          Positioned(
            right: 8,
            bottom: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${_index + 1}/${images.length}',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w800),
              ),
            ),
          ),
        if (images.length > 1)
          Positioned(
            bottom: 9,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                images.length > 8 ? 8 : images.length,
                (i) => Container(
                  width: 5,
                  height: 5,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i == _index
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.5),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Segmented Search / Saved switch shown above the results.
class _ViewSwitch extends StatelessWidget {
  const _ViewSwitch({
    required this.view,
    required this.savedCount,
    required this.onChanged,
  });

  final String view;
  final int savedCount;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: TS.bgOf(context),
        border: Border(bottom: BorderSide(color: TS.lineOf(context), width: 2)),
      ),
      child: SegmentedButton<String>(
        style: SegmentedButton.styleFrom(
          selectedBackgroundColor: TS.inkOf(context),
          selectedForegroundColor: TS.bgOf(context),
        ),
        segments: [
          const ButtonSegment(
            value: 'search',
            label: Text('Search'),
            icon: Icon(Icons.search, size: 18),
          ),
          ButtonSegment(
            value: 'saved',
            label: Text(savedCount > 0 ? 'Saved ($savedCount)' : 'Saved'),
            icon: const Icon(Icons.favorite_border, size: 18),
          ),
        ],
        selected: {view},
        onSelectionChanged: (set) => onChanged(set.first),
      ),
    );
  }
}

class _UpsellCard extends StatelessWidget {
  const _UpsellCard({required this.onUpgrade});

  final VoidCallback onUpgrade;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Container(
          decoration: TS.card(context),
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: TS.yellow,
                  border: Border.all(color: TS.lineOf(context), width: 2),
                ),
                child: const Icon(Icons.lock, color: TS.ink, size: 28),
              ),
              const SizedBox(height: 14),
              Text('Properties Scout',
                  style: TS.display.copyWith(fontSize: 22)),
              const SizedBox(height: 6),
              Text(
                'Search homes to buy or rent across South Africa — Property24 and '
                'Private Property in one place, with your own filters. Included '
                'with the Household plan.',
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context)),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    shape: const RoundedRectangleBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: onUpgrade,
                  child: const Text('Upgrade to Household'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GateCard extends StatelessWidget {
  const _GateCard({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Container(
          decoration: TS.card(context, color: TS.surfaceSoftOf(context)),
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 40, color: TS.redOf(context)),
              const SizedBox(height: 12),
              Text(title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Text(message,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: TS.mutedOf(context))),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    shape: const RoundedRectangleBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: onAction,
                  child: Text(actionLabel),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The "start here" state for Properties Scout: recent searches first (tap to
/// re-run — recognition over recall), then a few popular metros. Somewhere to
/// begin instead of a blank page.
class _StartSuggestions extends StatelessWidget {
  const _StartSuggestions({
    required this.recent,
    required this.popular,
    required this.onPick,
  });

  final List<String> recent;
  final List<String> popular;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.apartment_outlined,
                  size: 20, color: TS.faintOf(context)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Search any city, suburb or area to see homes for sale or to rent.',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
              ),
            ],
          ),
          if (recent.isNotEmpty) ...[
            const SizedBox(height: 22),
            _label(context, 'Recent searches'),
            const SizedBox(height: 8),
            _chips(context, recent, Icons.history),
          ],
          const SizedBox(height: 22),
          _label(context, 'Popular areas'),
          const SizedBox(height: 8),
          _chips(context, popular, Icons.trending_up),
        ],
      ),
    );
  }

  Widget _label(BuildContext context, String text) => Text(
        text.toUpperCase(),
        style: TextStyle(
          color: TS.faintOf(context),
          fontWeight: FontWeight.w800,
          fontSize: 12,
          letterSpacing: 0.4,
        ),
      );

  Widget _chips(BuildContext context, List<String> items, IconData icon) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final item in items)
          ActionChip(
            avatar: Icon(icon, size: 16, color: TS.inkOf(context)),
            label: Text(item),
            onPressed: () => onPick(item),
            side: BorderSide(color: TS.lineOf(context), width: 1.5),
            shape: const RoundedRectangleBorder(),
          ),
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text, this.mascot = false});

  final IconData icon;
  final String text;

  /// When true, the friendly Scout mark greets the shopper instead of a flat
  /// icon — a little personality for the moments they'll see most (Video 8).
  final bool mascot;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (mascot)
              const AnimatedScoutMark(motion: ScoutMarkMotion.scout, size: 60)
            else
              Icon(icon, size: 44, color: TS.faintOf(context)),
            const SizedBox(height: 12),
            Text(text,
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context))),
          ],
        ),
      ),
    );
  }
}
