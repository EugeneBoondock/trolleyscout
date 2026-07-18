import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';

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

  String _listingType = 'sale';
  int? _minBeds;
  String _sort = 'relevance';

  List<PropertyListing> _listings = const [];
  bool _loading = false;
  bool _searched = false;
  String? _error;

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

  Future<void> _search() async {
    final query = _searchController.text.trim();
    if (query.length < 2) {
      setState(() => _error = 'Enter a city, suburb, or area to search.');
      return;
    }
    FocusScope.of(context).unfocus();
    HapticFeedback.selectionClick();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.searchProperties(
        query: query,
        listingType: _listingType,
        minBeds: _minBeds,
        minPrice: _amount(_minPriceController),
        maxPrice: _amount(_maxPriceController),
        sort: _sort,
      );
      if (!mounted) return;
      setState(() {
        _listings = result.listings;
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

  Future<void> _open(PropertyListing listing) async {
    // Uri.parse('') succeeds as a scheme-less URI, so guard on scheme too.
    final uri = Uri.tryParse(listing.listingUrl);
    if (uri == null || !uri.hasScheme) return;
    HapticFeedback.selectionClick();
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
        message:
            'Log in to search homes to buy or rent across South Africa. '
            'Properties Scout is included with the Household plan.',
        actionLabel: 'Log in',
        onAction: widget.onWantsAuth,
      );
    }

    if (widget.account?.propertiesAccess != true) {
      return _UpsellCard(onUpgrade: widget.onUpgrade);
    }

    return Column(
      children: [
        _SearchBar(
          controller: _searchController,
          minPriceController: _minPriceController,
          maxPriceController: _maxPriceController,
          listingType: _listingType,
          minBeds: _minBeds,
          sort: _sort,
          loading: _loading,
          onListingType: (value) => setState(() => _listingType = value),
          onMinBeds: (value) => setState(() => _minBeds = value),
          onSort: (value) => setState(() => _sort = value),
          onSearch: _search,
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _Message(icon: Icons.error_outline, text: _error!);
    }
    if (!_searched) {
      return const _Message(
        icon: Icons.apartment_outlined,
        text: 'Search a location above to see homes for sale or to rent.',
      );
    }
    if (_listings.isEmpty) {
      return _Message(
        icon: Icons.search_off,
        text: 'No ${_listingType == 'rent' ? 'rentals' : 'listings'} found. '
            'Try another location or widen your filters.',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
      itemCount: _listings.length,
      itemBuilder: (context, index) =>
          _PropertyCard(listing: _listings[index], onOpen: _open),
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
    required this.onListingType,
    required this.onMinBeds,
    required this.onSort,
    required this.onSearch,
  });

  final TextEditingController controller;
  final TextEditingController minPriceController;
  final TextEditingController maxPriceController;
  final String listingType;
  final int? minBeds;
  final String sort;
  final bool loading;
  final ValueChanged<String> onListingType;
  final ValueChanged<int?> onMinBeds;
  final ValueChanged<String> onSort;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: TS.bgOf(context),
        border: Border(bottom: BorderSide(color: TS.lineOf(context), width: 2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
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
                        borderSide: BorderSide(color: TS.lineSoftOf(context))),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: TS.red,
                  foregroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(),
                  padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 18),
                ),
                onPressed: loading ? null : onSearch,
                child: const Text('Search'),
              ),
            ],
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
                    DropdownMenuItem(value: 'relevance', child: Text('Most relevant')),
                    DropdownMenuItem(value: 'price_low', child: Text('Price: low to high')),
                    DropdownMenuItem(value: 'price_high', child: Text('Price: high to low')),
                    DropdownMenuItem(value: 'beds', child: Text('Most bedrooms')),
                  ],
                  onChanged: (value) => onSort(value ?? 'relevance'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _PriceField(controller: minPriceController, hint: 'Min price (R)')),
              const SizedBox(width: 8),
              Expanded(child: _PriceField(controller: maxPriceController, hint: 'Max price (R)')),
            ],
          ),
        ],
      ),
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
  const _PropertyCard({required this.listing, required this.onOpen});

  final PropertyListing listing;
  final void Function(PropertyListing) onOpen;

  @override
  Widget build(BuildContext context) {
    final facts = <String>[
      if (listing.bedrooms != null) '${listing.bedrooms} bed',
      if (listing.bathrooms != null) '${_trim(listing.bathrooms!)} bath',
      if (listing.garages != null) '${listing.garages} garage',
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
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
                    if (listing.hasImage)
                      Image.network(
                        listing.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => _imageFallback(context),
                        loadingBuilder: (context, child, progress) =>
                            progress == null ? child : _imageFallback(context),
                      )
                    else
                      _imageFallback(context),
                    Positioned(
                      left: 8,
                      bottom: 8,
                      child: Container(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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
                    if (facts.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(facts.join(' · '),
                          style: TextStyle(
                              color: TS.faintOf(context),
                              fontWeight: FontWeight.w700,
                              fontSize: 13)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _trim(num value) =>
      value == value.roundToDouble() ? '${value.toInt()}' : '$value';

  Widget _imageFallback(BuildContext context) => ColoredBox(
        color: TS.surfaceSoftOf(context),
        child: Icon(Icons.apartment_outlined, size: 48, color: TS.faintOf(context)),
      );
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

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
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
