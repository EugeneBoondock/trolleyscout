import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';
import '../widgets/in_app_browser.dart';

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
  List<VoucherCode> _codes = const [];
  bool _loading = true;
  String? _error;
  String _query = '';
  String _retailerId = 'all';
  bool _savedOnly = false;

  @override
  void initState() {
    super.initState();
    _load();
    _loadCodes();
  }

  Future<void> _loadCodes() async {
    try {
      final codes = await widget.api.voucherCodes();
      if (mounted) setState(() => _codes = codes);
    } catch (_) {
      // Codes are additive: the loyalty wall still loads without them.
    }
  }

  Future<void> _rateCode(VoucherCode voucherCode, bool worked) async {
    if (!widget.isAuthenticated) {
      widget.onRequireAuth();
      return;
    }
    uxTap();
    try {
      final updated = await widget.api.rateVoucherCode(voucherCode.id, worked);
      if (!mounted || updated == null) return;
      setState(() => _codes = [
            for (final entry in _codes)
              if (entry.id == updated.id) updated else entry,
          ]);
      if (worked) uxReward();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(worked
            ? 'Thanks, that helps the next shopper.'
            : 'Noted, thanks.'),
      ));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _shareCode() async {
    if (!widget.isAuthenticated) {
      widget.onRequireAuth();
      return;
    }
    final shared = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ShareCodeSheet(
        api: widget.api,
        retailerIds: _vouchers.map((voucher) => voucher.retailerId).toSet().toList()
          ..sort(),
      ),
    );
    if (shared == true) await _loadCodes();
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
        // Belt-and-braces: the server should already exclude expired
        // vouchers, but never let a stale one render as claimable.
        _vouchers = vouchers.where((voucher) => !_isExpired(voucher)).toList();
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
    final wasClaimed = voucher.claimed;
    uxTap();
    // Optimistic: flip the button instantly and revert only on failure.
    setState(() => _vouchers = _setClaimed(_vouchers, voucher.id, !wasClaimed));
    try {
      final changed = wasClaimed
          ? await widget.api.removeVoucherClaim(voucher.id)
          : await widget.api.claimVoucher(voucher.id);
      if (!mounted) return;
      if (!changed) {
        setState(
            () => _vouchers = _setClaimed(_vouchers, voucher.id, wasClaimed));
        return;
      }
      if (!wasClaimed) uxReward();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(
          () => _vouchers = _setClaimed(_vouchers, voucher.id, wasClaimed));
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  static List<Voucher> _setClaimed(
          List<Voucher> vouchers, String id, bool claimed) =>
      vouchers
          .map((item) => item.id == id ? item.copyWith(claimed: claimed) : item)
          .toList();

  // Defensive parse: validTo may be empty or missing entirely. Treated as
  // valid through the end of that calendar day.
  static bool _isExpired(Voucher voucher) {
    final validTo = voucher.validTo?.trim();
    if (validTo == null || validTo.isEmpty) return false;
    final parsed = DateTime.tryParse(validTo);
    if (parsed == null) return false;
    final today = DateTime.now();
    final expiryDay = DateTime(parsed.year, parsed.month, parsed.day);
    final todayDay = DateTime(today.year, today.month, today.day);
    return expiryDay.isBefore(todayDay);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const LoadingPane();
    }
    if (_error != null) {
      return ErrorPane(message: _error!, onRetry: _load);
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
            'Vouchers and codes',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            'Codes to paste at checkout, plus the loyalty prices and clip coupons '
            'you redeem in the shop. Personal single-use codes are never stored.',
            style: TextStyle(color: TS.mutedOf(context)),
          ),
          const SizedBox(height: 18),

          // Checkout codes lead, because that is what a shopper means when
          // they ask for a voucher.
          Row(
            children: [
              Expanded(
                child: Text('CHECKOUT CODES', style: TS.eyebrowOf(context)),
              ),
              TextButton.icon(
                key: const Key('share-voucher-code'),
                onPressed: () => unawaited(_shareCode()),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Share a code'),
              ),
            ],
          ),
          Text(
            'Shared by shoppers and ranked by what actually worked. We cannot test '
            'these at the shop, so try the top one first and say how it went.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          if (_codes.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: TS.card(context),
              child: const Text(
                'No codes yet. If you have one that works, share it so the next '
                'shopper does not pay full price.',
              ),
            )
          else
            for (final voucherCode in _codes)
              _VoucherCodeCard(
                key: Key('voucher-code-${voucherCode.id}'),
                voucherCode: voucherCode,
                onRate: (worked) => _rateCode(voucherCode, worked),
              ),

          const SizedBox(height: 22),
          Text('IN-STORE AND ON-SITE', style: TS.eyebrowOf(context)),
          const SizedBox(height: 4),
          Text(
            'Loyalty prices and clip coupons. Not typed at checkout. These are '
            'scanned at the till or clipped on the product page.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
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
            onChanged: (value) => setState(() => _retailerId = value ?? 'all'),
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
              onRecordView: () => widget.api.recordUsage('voucher_view'),
            ),
        ],
      ),
    );
  }
}

/// One checkout code: copy it, then say whether it worked. The verdict is the
/// only ranking signal there is, so both buttons carry their running count.
class _VoucherCodeCard extends StatelessWidget {
  const _VoucherCodeCard({
    super.key,
    required this.voucherCode,
    required this.onRate,
  });

  final VoucherCode voucherCode;
  final Future<void> Function(bool worked) onRate;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: TS.card(context, width: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: TS.surfaceSoftOf(context),
                    borderRadius: BorderRadius.circular(TS.controlRadius),
                  ),
                  child: Text(
                    voucherCode.code,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                key: Key('copy-code-${voucherCode.id}'),
                style: FilledButton.styleFrom(
                  backgroundColor: TS.yellow,
                  foregroundColor: TS.ink,
                ),
                onPressed: () {
                  uxTap();
                  Clipboard.setData(ClipboardData(text: voucherCode.code));
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: Text(
                        '${voucherCode.code} copied. Paste it at checkout.'),
                  ));
                },
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('Copy'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(voucherCode.benefitText,
              style: const TextStyle(fontWeight: FontWeight.w800)),
          if (voucherCode.minimumSpendText != null)
            Text(voucherCode.minimumSpendText!,
                style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5)),
          const SizedBox(height: 4),
          Text(
            voucherCode.isFromAffiliate
                ? '${voucherCode.confidenceText} · from '
                    '${voucherCode.source.replaceFirst('affiliate:', '')}'
                : voucherCode.confidenceText,
            style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('Did it work?',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5)),
              const SizedBox(width: 8),
              _VoteChip(
                key: Key('code-worked-${voucherCode.id}'),
                icon: Icons.thumb_up_alt_outlined,
                count: voucherCode.workedCount,
                selected: voucherCode.yourVote == 'worked',
                onPressed: () => unawaited(onRate(true)),
              ),
              const SizedBox(width: 6),
              _VoteChip(
                key: Key('code-failed-${voucherCode.id}'),
                icon: Icons.thumb_down_alt_outlined,
                count: voucherCode.failedCount,
                selected: voucherCode.yourVote == 'failed',
                onPressed: () => unawaited(onRate(false)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _VoteChip extends StatelessWidget {
  const _VoteChip({
    super.key,
    required this.icon,
    required this.count,
    required this.selected,
    required this.onPressed,
  });

  final IconData icon;
  final int count;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          side: BorderSide(
            color: selected ? TS.yellow : TS.lineSoftOf(context),
            width: selected ? 2 : 1,
          ),
          visualDensity: VisualDensity.compact,
        ),
        icon: Icon(icon, size: 15),
        label: Text('$count'),
      );
}

/// Where a shopper adds a code they have just used successfully.
class _ShareCodeSheet extends StatefulWidget {
  const _ShareCodeSheet({required this.api, required this.retailerIds});

  final Api api;
  final List<String> retailerIds;

  @override
  State<_ShareCodeSheet> createState() => _ShareCodeSheetState();
}

class _ShareCodeSheetState extends State<_ShareCodeSheet> {
  final _codeController = TextEditingController();
  final _benefitController = TextEditingController();
  final _minimumController = TextEditingController();
  String? _retailerId;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    _benefitController.dispose();
    _minimumController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final retailerId = _retailerId;
    if (retailerId == null || _codeController.text.trim().isEmpty) {
      setState(() => _error = 'Choose a shop and enter the code.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.shareVoucherCode(
        retailerId: retailerId,
        code: _codeController.text,
        benefitText: _benefitController.text,
        minimumSpendText: _minimumController.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = error.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Share a code that worked',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                key: const Key('share-code-shop'),
                initialValue: _retailerId,
                decoration: const InputDecoration(labelText: 'Shop'),
                isExpanded: true,
                items: [
                  for (final retailerId in widget.retailerIds)
                    DropdownMenuItem(
                        value: retailerId, child: Text(_retailerName(retailerId))),
                ],
                onChanged: (value) => setState(() => _retailerId = value),
              ),
              const SizedBox(height: 10),
              TextField(
                key: const Key('share-code-value'),
                controller: _codeController,
                decoration: const InputDecoration(
                    labelText: 'Code', hintText: 'SAVE20'),
                textCapitalization: TextCapitalization.characters,
              ),
              const SizedBox(height: 10),
              TextField(
                key: const Key('share-code-benefit'),
                controller: _benefitController,
                decoration: const InputDecoration(
                    labelText: 'What it gives you',
                    hintText: '20% off your order'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _minimumController,
                decoration: const InputDecoration(
                    labelText: 'Minimum spend (optional)',
                    hintText: 'Spend R500 or more'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, style: TextStyle(color: TS.redOf(context))),
              ],
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const Key('share-code-submit'),
                  onPressed: _saving ? null : () => unawaited(_submit()),
                  child: Text(_saving ? 'Sharing...' : 'Share code'),
                ),
              ),
            ],
          ),
        ),
      );
}

class _VoucherCard extends StatelessWidget {
  const _VoucherCard({
    required this.voucher,
    required this.onToggleClaim,
    this.onRecordView,
  });

  final Voucher voucher;
  final VoidCallback onToggleClaim;
  /// Counts the view for the admin console. Absent in tests and previews.
  final Future<void> Function()? onRecordView;

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
                borderRadius: BorderRadius.circular(TS.controlRadius),
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
                onPressed: () {
                  // Counted for the admin console, never allowed to delay the
                  // shopper getting to the retailer.
                  unawaited(onRecordView?.call() ?? Future<void>.value());
                  showInAppBrowser(
                    context,
                    voucher.redemptionUrl,
                    title: voucher.title,
                  );
                },
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
      child:
          Icon(Icons.confirmation_number_outlined, color: TS.mutedOf(context)),
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
                cacheWidth: 216,
                cacheHeight: 216,
                errorBuilder: (_, __, ___) => fallback,
              ),
      ),
    );
  }
}

String _clean(String value) => value.replaceAll(RegExp(r'\s*—\s*'), ': ');

String _retailerName(String value) => value
    .split('-')
    .map((part) =>
        part.isEmpty ? part : part[0].toUpperCase() + part.substring(1))
    .join(' ')
    .replaceAll('Za', 'ZA');
