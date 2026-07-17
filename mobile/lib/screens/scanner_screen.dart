import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key, required this.api});

  final Api api;

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _source = TextEditingController();
  final _price = TextEditingController();
  final _saving = TextEditingController();
  final _terms = TextEditingController();
  final _validFrom = TextEditingController();
  final _validTo = TextEditingController();
  String _retailerId = 'pick-n-pay';
  bool _busy = false;
  OfferValidationResult? _result;

  @override
  void dispose() {
    for (final controller in [
      _title,
      _source,
      _price,
      _saving,
      _terms,
      _validFrom,
      _validTo
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  OfferDraft _draft() => OfferDraft(
        retailerId: _retailerId,
        title: _title.text.trim(),
        sourceUrl: _source.text.trim(),
        capturedAt: DateTime.now().toUtc().toIso8601String().substring(0, 10),
        priceText: _price.text.trim(),
        savingText: _saving.text.trim(),
        termsText: _terms.text.trim(),
        validFrom: _validFrom.text.trim(),
        validTo: _validTo.text.trim(),
      );

  Future<void> _validate() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final result = await widget.api.validateOffer(_draft());
      if (mounted) setState(() => _result = result);
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await widget.api.createOffer(_draft());
      if (mounted) showNotice(context, 'Verified offer saved.');
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const ScreenHeader(
            eyebrow: 'Source checks',
            title: 'Offer scanner',
            description:
                'Check retailer source, dates, price copy, and terms before an offer is saved.',
          ),
          PaperCard(
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _retailerId,
                  decoration: const InputDecoration(labelText: 'Retailer'),
                  items: const [
                    DropdownMenuItem(
                        value: 'pick-n-pay', child: Text('Pick n Pay')),
                    DropdownMenuItem(
                        value: 'checkers', child: Text('Checkers')),
                    DropdownMenuItem(
                        value: 'shoprite', child: Text('Shoprite')),
                    DropdownMenuItem(
                        value: 'woolworths', child: Text('Woolworths')),
                    DropdownMenuItem(value: 'spar', child: Text('SPAR')),
                    DropdownMenuItem(value: 'boxer', child: Text('Boxer')),
                    DropdownMenuItem(value: 'clicks', child: Text('Clicks')),
                    DropdownMenuItem(
                        value: 'dis-chem', child: Text('Dis-Chem')),
                  ],
                  onChanged: (value) =>
                      setState(() => _retailerId = value ?? _retailerId),
                ),
                const SizedBox(height: 12),
                _field(_title, 'Offer title'),
                const SizedBox(height: 12),
                _field(_source, 'Official source URL',
                    keyboardType: TextInputType.url),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: _field(_price, 'Price copy')),
                    const SizedBox(width: 10),
                    Expanded(
                        child: _field(_saving, 'Saving copy', required: false)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                        child: _field(_validFrom, 'Valid from',
                            hint: 'YYYY-MM-DD')),
                    const SizedBox(width: 10),
                    Expanded(
                        child:
                            _field(_validTo, 'Valid to', hint: 'YYYY-MM-DD')),
                  ],
                ),
                const SizedBox(height: 12),
                _field(_terms, 'Terms from source', maxLines: 3),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _validate,
                    icon: const Icon(Icons.verified_outlined),
                    label: Text(_busy ? 'Checking' : 'Check offer'),
                  ),
                ),
              ],
            ),
          ),
          if (_result != null) ...[
            const SizedBox(height: 14),
            PaperCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _result!.accepted
                        ? 'Offer passed checks'
                        : 'Offer needs edits',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.merge(TS.display),
                  ),
                  for (final issue in _result!.issues)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        issue.severity == 'error'
                            ? Icons.error_outline
                            : Icons.warning_amber,
                        color: issue.severity == 'error'
                            ? TS.redOf(context)
                            : TS.yellow,
                      ),
                      title: Text(issue.message),
                      subtitle: Text(issue.field),
                    ),
                  if (_result!.accepted)
                    FilledButton.icon(
                      onPressed: _busy ? null : _save,
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('Save verified offer'),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  TextFormField _field(
    TextEditingController controller,
    String label, {
    String? hint,
    bool required = true,
    int maxLines = 1,
    TextInputType? keyboardType,
  }) =>
      TextFormField(
        controller: controller,
        decoration: InputDecoration(labelText: label, hintText: hint),
        keyboardType: keyboardType,
        maxLines: maxLines,
        validator: required && controller == _source
            ? (value) {
                final uri = Uri.tryParse((value ?? '').trim());
                return uri != null && uri.hasScheme && uri.host.isNotEmpty
                    ? null
                    : 'Enter an official URL.';
              }
            : required
                ? (value) => (value ?? '').trim().isEmpty ? 'Required.' : null
                : null,
      );
}
