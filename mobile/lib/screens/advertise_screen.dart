import 'package:flutter/material.dart';

import '../api.dart';
import '../payfast_checkout.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';

/// "Advertise with us" — any signed-in member (a shop, a brand, a shopper) can
/// submit an ad, watch it move through review, and, once approved, pay for it
/// via PayFast. Approved-and-paid ads appear as Sponsored cards across the app.
class AdvertiseScreen extends StatefulWidget {
  const AdvertiseScreen({super.key, required this.api});

  final Api api;

  @override
  State<AdvertiseScreen> createState() => _AdvertiseScreenState();
}

class _AdvertiseScreenState extends State<AdvertiseScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _targetUrl = TextEditingController();
  final _imageUrl = TextEditingController();

  AdRateCard _rateCard = AdRateCard.fallback;
  List<AdSubmission> _ads = const [];
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  String _placement = 'feed';
  late int _reach = _rateCard.reachOptions.first;
  String? _province; // null = all South Africa
  String? _payingId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    _targetUrl.dispose();
    _imageUrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.myAds();
      if (!mounted) return;
      setState(() {
        _ads = result.ads;
        _rateCard = result.rateCard;
        if (!_rateCard.reachOptions.contains(_reach)) {
          _reach = _rateCard.reachOptions.first;
        }
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  int get _estimateCents =>
      _rateCard.priceCents(reach: _reach, placementId: _placement);

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    uxTap();
    setState(() => _submitting = true);
    try {
      await widget.api.submitAd(AdDraft(
        title: _title.text.trim(),
        bodyText: _body.text.trim(),
        targetUrl: _targetUrl.text.trim(),
        imageUrl: _imageUrl.text.trim().isEmpty ? null : _imageUrl.text.trim(),
        placement: _placement,
        reach: _reach,
        province: _province,
      ));
      if (!mounted) return;
      _title.clear();
      _body.clear();
      _targetUrl.clear();
      _imageUrl.clear();
      uxSuccess();
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
          content: Text(
              'Ad submitted for review. We\'ll approve it, then you can pay to go live.'),
        ));
      await _load();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _pay(AdSubmission ad) async {
    if (_payingId != null) return;
    setState(() => _payingId = ad.id);
    try {
      final checkout = await widget.api.adCheckout(ad.id);
      if (!mounted) return;
      final paid = await openPayFastCheckout(context, checkout);
      if (!mounted) return;
      if (paid) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(const SnackBar(
            content: Text('Payment received. Your ad will be live shortly.'),
          ));
      }
      await _load();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _payingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingPane();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const ScreenHeader(
          eyebrow: 'Advertise',
          title: 'Reach money-savvy shoppers',
          description:
              'Put your store or product in front of South Africans hunting for '
              'deals. Submit an ad, we review it, then you pay only for the reach '
              'you choose. Ads show as clearly-labelled Sponsored cards.',
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!,
                style: TextStyle(
                    color: TS.redOf(context), fontWeight: FontWeight.w700)),
          ),
        _buildForm(),
        const SizedBox(height: 24),
        Text('YOUR ADS', style: TS.eyebrowOf(context)),
        const SizedBox(height: 8),
        if (_ads.isEmpty)
          Text('No ads yet. Submit your first one above.',
              style: TextStyle(color: TS.mutedOf(context)))
        else
          for (final ad in _ads) _AdRow(
            ad: ad,
            paying: _payingId == ad.id,
            onPay: ad.awaitingPayment ? () => _pay(ad) : null,
          ),
      ],
    );
  }

  Widget _buildForm() {
    return Container(
      decoration: TS.card(context),
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _title,
              maxLength: 80,
              decoration: const InputDecoration(labelText: 'Ad title'),
              validator: (value) => (value ?? '').trim().length < 3
                  ? 'Give your ad a short title.'
                  : null,
            ),
            TextFormField(
              controller: _body,
              maxLength: 240,
              maxLines: 2,
              decoration:
                  const InputDecoration(labelText: 'Ad text (one or two lines)'),
              validator: (value) => (value ?? '').trim().length < 3
                  ? 'Write a line of ad text.'
                  : null,
            ),
            const SizedBox(height: 6),
            TextFormField(
              controller: _targetUrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Link to open (https://…)',
              ),
              validator: (value) {
                final url = (value ?? '').trim();
                final uri = Uri.tryParse(url);
                return uri != null && uri.isAbsolute && uri.hasScheme
                    ? null
                    : 'Enter a full link starting with https://';
              },
            ),
            const SizedBox(height: 6),
            TextFormField(
              controller: _imageUrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Image link (optional)',
              ),
            ),
            const SizedBox(height: 16),
            Text('WHERE IT SHOWS', style: TS.eyebrowOf(context)),
            const SizedBox(height: 6),
            SegmentedButton<String>(
              segments: [
                for (final placement in _rateCard.placements)
                  ButtonSegment(value: placement.id, label: Text(placement.label)),
              ],
              selected: {_placement},
              onSelectionChanged: (value) => setState(() {
                _placement = value.first;
                uxTap();
              }),
            ),
            const SizedBox(height: 16),
            Text('HOW MANY PEOPLE', style: TS.eyebrowOf(context)),
            const SizedBox(height: 6),
            DropdownButtonFormField<int>(
              initialValue: _reach,
              decoration: const InputDecoration(labelText: 'Reach'),
              items: [
                for (final option in _rateCard.reachOptions)
                  DropdownMenuItem(
                      value: option,
                      child: Text('${_formatThousands(option)} people')),
              ],
              onChanged: (value) => setState(() {
                _reach = value ?? _rateCard.reachOptions.first;
                uxTap();
              }),
            ),
            const SizedBox(height: 12),
            Text('WHERE (OPTIONAL)', style: TS.eyebrowOf(context)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String?>(
              initialValue: _province,
              decoration: const InputDecoration(labelText: 'Target province'),
              items: [
                const DropdownMenuItem(
                    value: null, child: Text('All of South Africa')),
                for (final province in _rateCard.provinces)
                  DropdownMenuItem(value: province, child: Text(province)),
              ],
              onChanged: (value) => setState(() => _province = value),
            ),
            const SizedBox(height: 16),
            Container(
              decoration: BoxDecoration(
                color: TS.surfaceSoftOf(context),
                border: Border.all(color: TS.lineOf(context), width: 2),
              ),
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('YOU PAY', style: TS.eyebrowOf(context)),
                        Text('once, after approval',
                            style: TextStyle(
                                color: TS.mutedOf(context), fontSize: 12)),
                      ],
                    ),
                  ),
                  Text(formatRandFromCents(_estimateCents),
                      style: const TextStyle(
                          fontSize: 26, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: TS.yellow,
                foregroundColor: TS.ink,
                shape: const RoundedRectangleBorder(),
              ),
              onPressed: _submitting ? null : _submit,
              icon: const Icon(Icons.campaign_outlined),
              label: Text(_submitting ? 'Submitting…' : 'Submit for review'),
            ),
          ],
        ),
      ),
    );
  }
}

String _formatThousands(int value) {
  final text = value.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < text.length; i++) {
    if (i > 0 && (text.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(text[i]);
  }
  return buffer.toString();
}

class _AdRow extends StatelessWidget {
  const _AdRow({required this.ad, required this.paying, this.onPay});

  final AdSubmission ad;
  final bool paying;
  final VoidCallback? onPay;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: TS.card(context, width: 2),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(ad.title,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w900)),
              ),
              _StatusBadge(status: ad.status),
            ],
          ),
          const SizedBox(height: 4),
          Text(ad.bodyText,
              style: TextStyle(color: TS.mutedOf(context), fontSize: 13)),
          const SizedBox(height: 6),
          Text(
            '${formatRandFromCents(ad.amountCents)} · '
            '${_placementLabel(ad.placement)} · '
            '${_formatThousands(ad.reach)} people'
            '${ad.province != null ? ' · ${ad.province}' : ''}',
            style: TextStyle(
                color: TS.faintOf(context),
                fontSize: 12,
                fontWeight: FontWeight.w700),
          ),
          if (ad.status == 'rejected' && ad.reviewNote != null) ...[
            const SizedBox(height: 6),
            Text('Reviewer: ${ad.reviewNote}',
                style: TextStyle(color: TS.redOf(context), fontSize: 12)),
          ],
          if (onPay != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: TS.green,
                  foregroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(),
                ),
                onPressed: paying ? null : onPay,
                icon: const Icon(Icons.lock_outline, size: 18),
                label: Text(paying
                    ? 'Opening checkout…'
                    : 'Pay ${formatRandFromCents(ad.amountCents)} to go live'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

String _placementLabel(String placement) =>
    placement == 'near_me' ? 'Near me' : 'Deals feed';

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'active' => ('LIVE', TS.greenOf(context)),
      'approved' => ('AWAITING PAYMENT', TS.redOf(context)),
      'rejected' => ('REJECTED', TS.mutedOf(context)),
      'expired' => ('EXPIRED', TS.mutedOf(context)),
      _ => ('IN REVIEW', TS.mutedOf(context)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      color: color,
      child: Text(label,
          style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.6)),
    );
  }
}
