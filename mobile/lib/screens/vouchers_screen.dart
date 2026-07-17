import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/scout_mark.dart';

class VouchersScreen extends StatefulWidget {
  const VouchersScreen({
    super.key,
    required this.api,
    required this.isAuthenticated,
    required this.onRequireAuth,
  });

  final Api api;
  final bool isAuthenticated;
  final VoidCallback onRequireAuth;

  @override
  State<VouchersScreen> createState() => _VouchersScreenState();
}

class _VouchersScreenState extends State<VouchersScreen> {
  List<Voucher> _vouchers = const [];
  bool _loading = true;
  String? _error;
  String _query = '';
  String _retailerId = 'all';
  bool _savedOnly = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final vouchers = await widget.api.vouchers();
      if (!mounted) return;
      setState(() {
        _vouchers = vouchers;
        _loading = false;
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
        _error = 'Could not load vouchers.';
      });
    }
  }

  Future<void> _toggleClaim(Voucher voucher) async {
    if (!widget.isAuthenticated) {
      widget.onRequireAuth();
      return;
    }
    try {
      final changed = voucher.claimed
          ? await widget.api.removeVoucherClaim(voucher.id)
          : await widget.api.claimVoucher(voucher.id);
      if (!mounted || !changed) return;
      setState(() {
        _vouchers = _vouchers
            .map((item) => item.id == voucher.id
                ? item.copyWith(claimed: !voucher.claimed)
                : item)
            .toList();
      });
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: AnimatedScoutMark(
          key: ValueKey('voucher-loading-scout-mark'),
          motion: ScoutMarkMotion.spin,
          size: 48,
        ),
      );
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 12),
            FilledButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    final retailerIds =
        _vouchers.map((voucher) => voucher.retailerId).toSet().toList()..sort();
    final filtered = _vouchers.where((voucher) {
      final search = [
        voucher.title,
        voucher.benefitText,
        voucher.retailerId,
        voucher.code ?? '',
      ].join(' ').toLowerCase();
      return (_query.isEmpty || search.contains(_query)) &&
          (_retailerId == 'all' || voucher.retailerId == _retailerId) &&
          (!_savedOnly || voucher.claimed);
    }).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('VOUCHER SCOUT', style: TS.eyebrowOf(context)),
          const SizedBox(height: 4),
          const Text(
            'Current retailer vouchers',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            'Public codes, product coupons, and loyalty offers from official retailer sources. '
            'Personal single-use codes are never stored.',
            style: TextStyle(color: TS.mutedOf(context)),
          ),
          const SizedBox(height: 14),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Search vouchers',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (value) =>
                setState(() => _query = value.trim().toLowerCase()),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _retailerId,
            decoration: const InputDecoration(labelText: 'Retailer'),
            items: [
              const DropdownMenuItem(
                  value: 'all', child: Text('All retailers')),
              for (final retailerId in retailerIds)
                DropdownMenuItem(
                    value: retailerId, child: Text(_retailerName(retailerId))),
            ],
            onChanged: (value) =>
                setState(() => _retailerId = value ?? 'all'),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Saved only'),
            value: _savedOnly,
            onChanged: (value) => setState(() => _savedOnly = value),
          ),
          if (filtered.isEmpty)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: TS.card(context),
              child: const Text('No vouchers match those filters.'),
            ),
          for (final voucher in filtered)
            _VoucherCard(
              voucher: voucher,
              onToggleClaim: () => _toggleClaim(voucher),
            ),
        ],
      ),
    );
  }
}

class _VoucherCard extends StatelessWidget {
  const _VoucherCard({
    required this.voucher,
    required this.onToggleClaim,
  });

  final Voucher voucher;
  final VoidCallback onToggleClaim;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: TS.card(context, width: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _VoucherImage(url: voucher.imageUrl),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_retailerName(voucher.retailerId).toUpperCase(),
                        style: TS.eyebrowOf(context)),
                    const SizedBox(height: 3),
                    Text(
                      _clean(voucher.title),
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w900),
                    ),
                    Text(
                      _clean(voucher.benefitText),
                      style: TextStyle(
                        color: TS.redOf(context),
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (voucher.code != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                border: Border.all(color: TS.lineOf(context), width: 2),
                color: TS.bgOf(context),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: SelectableText(
                      voucher.code!,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Copy voucher code',
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: voucher.code!));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Voucher code copied.')),
                      );
                    },
                    icon: const Icon(Icons.copy),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            [
              if (voucher.validTo != null)
                'Valid until ${voucher.validTo!.substring(0, 10)}'
              else
                'Recently verified',
              if (voucher.accountRequired) 'Retailer account required',
            ].join(' · '),
            style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (voucher.claimed)
                OutlinedButton.icon(
                  onPressed: onToggleClaim,
                  icon: const Icon(Icons.bookmark_remove_outlined),
                  label: const Text('Remove saved'),
                )
              else
                FilledButton.icon(
                  onPressed: onToggleClaim,
                  icon: const Icon(Icons.bookmark_add_outlined),
                  label: const Text('Save voucher'),
                ),
              OutlinedButton.icon(
                onPressed: () => launchUrl(
                  Uri.parse(voucher.redemptionUrl),
                  mode: LaunchMode.externalApplication,
                ),
                icon: const Icon(Icons.open_in_new, size: 17),
                label: const Text('Redeem at retailer'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _VoucherImage extends StatelessWidget {
  const _VoucherImage({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final fallback = ColoredBox(
      color: TS.surfaceOf(context),
      child: Icon(Icons.confirmation_number_outlined,
          color: TS.mutedOf(context)),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(7),
      child: SizedBox(
        width: 72,
        height: 72,
        child: url == null
            ? fallback
            : Image.network(
                url!,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => fallback,
              ),
      ),
    );
  }
}

String _clean(String value) =>
    value.replaceAll(RegExp(r'\s*\u2014\s*'), ': ');

String _retailerName(String value) => value
    .split('-')
    .map((part) =>
        part.isEmpty ? part : part[0].toUpperCase() + part.substring(1))
    .join(' ')
    .replaceAll('Za', 'ZA');
