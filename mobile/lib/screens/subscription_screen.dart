import 'package:flutter/material.dart';

import '../api.dart';
import '../currency.dart';
import '../payfast_checkout.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'developer_access_screen.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({
    super.key,
    required this.api,
    this.openCheckout,
  });

  final Api api;
  final Future<bool> Function(BuildContext, SubscriptionCheckout)? openCheckout;

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  late Future<SubscriptionData> _future = widget.api.subscription();
  String _billingCycle = 'monthly';
  String? _busyPlan;

  // How the shopper was quoted. The server prices the plan table for their
  // country, so nothing here has to estimate a conversion.
  Currency _planCurrency(MemberPlan plan) => Currency.of(plan.localCurrency);

  // Whole units of the quoted currency. An older server sends rand cents only,
  // and every rand price is a whole rand, so rounding loses nothing.
  int _monthlyUnits(MemberPlan plan) =>
      plan.localMonthly ?? (plan.monthlyCents / 100).round();

  int _annualUnits(MemberPlan plan) =>
      plan.localAnnual ?? (plan.annualCents / 100).round();

  String _planPrice(MemberPlan plan) => _planCurrency(plan).formatShort(
      (_billingCycle == 'monthly' ? _monthlyUnits(plan) : _annualUnits(plan)) *
          100);

  void _reload() => setState(() {
        _future = widget.api.subscription();
      });

  Future<void> _choose(MemberPlan plan, String? currentPlanId) async {
    if (!plan.isPaid && currentPlanId != null && currentPlanId != 'free') {
      final confirmed = await confirmAction(
        context,
        title: 'Switch to Free?',
        message:
            'Your paid plan will remain active until the end of its current billing period.',
        confirmLabel: 'Schedule change',
      );
      if (!confirmed || !mounted) return;
    }
    setState(() => _busyPlan = plan.id);
    try {
      final checkout = await widget.api.checkout(plan.id, _billingCycle);
      if (!mounted) return;
      if (checkout.status == 'active' || checkout.status == 'scheduled') {
        _reload();
        showNotice(context, checkout.message);
        return;
      }
      final hasCheckout = checkout.redirectUrl != null ||
          (checkout.engineUrl != null && checkout.onsiteUuid != null);
      if (!hasCheckout) {
        showNotice(
            context,
            checkout.message.isEmpty
                ? 'Checkout is unavailable. Try again later.'
                : checkout.message);
        return;
      }
      final opened = await (widget.openCheckout ?? openPayFastCheckout)(
        context,
        checkout,
      );
      if (!mounted) return;
      if (opened) {
        _reload();
        showNotice(
          context,
          'Checkout opened. Your plan updates after PayFast confirms payment.',
        );
      } else {
        showNotice(context, 'Checkout closed. No plan change was made.');
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _busyPlan = null);
    }
  }

  Future<void> _startBusinessPlan(
    MemberPlan plan,
    SubscriptionData data,
  ) async {
    final application = data.businessApplications.isEmpty
        ? null
        : data.businessApplications.first;
    if (application == null || application.status == 'rejected') {
      final submitted = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (context) => _BusinessApplicationSheet(
          api: widget.api,
          account: data.account,
        ),
      );
      if (submitted != true || !mounted) return;
      _reload();
    }
    await _choose(plan, data.account?.planId);
  }

  Future<void> _openDeveloperAccess() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (context) => DeveloperAccessScreen(api: widget.api),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<SubscriptionData>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Could not load subscription plans.', onRetry: _reload);
        }
        final data = snapshot.data!;
        final hasDeveloperAccess = data.account?.isAdmin == true ||
            (data.account?.planId == 'developers' &&
                data.account?.planStatus == 'active');
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Membership',
              title: 'Choose your plan',
              description:
                  'Core price tools, deals, and catalogues stay free. Paid plans add more alerts, larger lists, Properties Scout, and business or developer tools.',
            ),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'monthly', label: Text('Monthly')),
                ButtonSegment(value: 'annual', label: Text('Annual')),
              ],
              selected: {_billingCycle},
              onSelectionChanged: (value) =>
                  setState(() => _billingCycle = value.first),
            ),
            const SizedBox(height: 16),
            for (final plan in data.plans)
              PaperCard(
                margin: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(plan.badge.toUpperCase(),
                        style: TS.eyebrowOf(context)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                            child: Text(plan.name,
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineSmall
                                    ?.merge(TS.display))),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              plan.isPaid
                                  ? '${_planPrice(plan)}/${_billingCycle == 'monthly' ? 'mo' : 'yr'}'
                                  : 'Free',
                              style: TextStyle(
                                  color: TS.redOf(context),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 18),
                            ),
                            // Annual sticker-shock softener: the honest monthly
                            // equivalent, so a year's price reads as "≈ Rx/mo".
                            if (plan.isPaid && _billingCycle == 'annual')
                              Text(
                                '≈ ${_planCurrency(plan).format((_annualUnits(plan) * 100 / 12).round())}/mo',
                                style: TextStyle(
                                    color: TS.mutedOf(context),
                                    fontWeight: FontWeight.w700,
                                    fontSize: 11),
                              ),
                            // A price quoted in another currency still leaves
                            // the account in rand, so say what the statement
                            // will actually read.
                            if (plan.isPaid && !plan.isQuotedInRand)
                              Text(
                                'Charged ${formatRand(_billingCycle == 'monthly' ? plan.monthlyCents : plan.annualCents)}',
                                style: TextStyle(
                                    color: TS.mutedOf(context),
                                    fontWeight: FontWeight.w700,
                                    fontSize: 11),
                              ),
                          ],
                        ),
                      ],
                    ),
                    // Honest anchor: the real saving of paying yearly vs monthly.
                    if (plan.isPaid &&
                        _billingCycle == 'annual' &&
                        _monthlyUnits(plan) * 12 > _annualUnits(plan)) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        color: TS.greenOf(context).withValues(alpha: 0.16),
                        child: Text(
                          'Save ${_planCurrency(plan).formatShort((_monthlyUnits(plan) * 12 - _annualUnits(plan)) * 100)} a year vs monthly',
                          style: TextStyle(
                              color: TS.greenOf(context),
                              fontWeight: FontWeight.w800,
                              fontSize: 12),
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(plan.description),
                    const SizedBox(height: 8),
                    for (final feature in plan.features)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.check_circle,
                                color: TS.greenOf(context), size: 18),
                            const SizedBox(width: 6),
                            Expanded(child: Text(feature)),
                          ],
                        ),
                      ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: (data.account?.planId == plan.id &&
                                    !(plan.id == 'developers' &&
                                        hasDeveloperAccess)) ||
                                _busyPlan != null
                            ? null
                            : () =>
                                plan.id == 'developers' && hasDeveloperAccess
                                    ? _openDeveloperAccess()
                                    : plan.id == 'organization' ||
                                            plan.id == 'developers'
                                        ? _startBusinessPlan(plan, data)
                                        : _choose(plan, data.account?.planId),
                        child: Text(
                          plan.id == 'developers' && hasDeveloperAccess
                              ? 'Open developer tools'
                              : data.account?.planId == plan.id
                                  ? 'Current plan'
                                  : _busyPlan == plan.id
                                      ? 'Opening checkout'
                                      : (plan.id == 'organization' ||
                                                  plan.id == 'developers') &&
                                              (data.businessApplications
                                                      .isEmpty ||
                                                  data.businessApplications
                                                          .first.status ==
                                                      'rejected')
                                          ? 'Apply for Organisation access'
                                          : plan.isPaid
                                              ? 'Start ${plan.name}'
                                              : 'Use Free',
                        ),
                      ),
                    ),
                    // Safety-net reassurance: choosing a paid plan isn't a trap.
                    if (plan.isPaid &&
                        data.account?.planId != plan.id &&
                        !(plan.id == 'developers' && hasDeveloperAccess)) ...[
                      const SizedBox(height: 6),
                      Center(
                        child: Text(
                          'Switch or cancel anytime',
                          style: TextStyle(
                              color: TS.faintOf(context), fontSize: 12),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _BusinessApplicationSheet extends StatefulWidget {
  const _BusinessApplicationSheet({
    required this.api,
    required this.account,
  });

  final Api api;
  final MemberAccount? account;

  @override
  State<_BusinessApplicationSheet> createState() =>
      _BusinessApplicationSheetState();
}

class _BusinessApplicationSheetState extends State<_BusinessApplicationSheet> {
  final _formKey = GlobalKey<FormState>();
  final _organisationName = TextEditingController();
  final _tradingName = TextEditingController();
  final _registrationNumber = TextEditingController();
  final _category = TextEditingController();
  late final TextEditingController _contactName =
      TextEditingController(text: widget.account?.displayName ?? '');
  late final TextEditingController _contactEmail =
      TextEditingController(text: widget.account?.email ?? '');
  final _contactPhone = TextEditingController();
  final _websiteUrl = TextEditingController();
  final _city = TextEditingController();
  final _province = TextEditingController();
  final _description = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final controller in [
      _organisationName,
      _tradingName,
      _registrationNumber,
      _category,
      _contactName,
      _contactEmail,
      _contactPhone,
      _websiteUrl,
      _city,
      _province,
      _description,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.submitOrganizationApplication(
        OrganizationApplicationDraft(
          organisationName: _organisationName.text.trim(),
          tradingName: _tradingName.text.trim(),
          registrationNumber: _registrationNumber.text.trim(),
          category: _category.text.trim(),
          contactName: _contactName.text.trim(),
          contactEmail: _contactEmail.text.trim(),
          contactPhone: _contactPhone.text.trim(),
          websiteUrl: _websiteUrl.text.trim(),
          city: _city.text.trim(),
          province: _province.text.trim(),
          description: _description.text.trim(),
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Material(
          color: Theme.of(context).colorScheme.surface,
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Tell us about your business',
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.merge(TS.display),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close application',
                      onPressed:
                          _busy ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Your details go to the Trolley Scout admin. Organisation checkout starts after the form is saved.',
                  style: TextStyle(color: TS.mutedOf(context), height: 1.45),
                ),
                const SizedBox(height: 18),
                _applicationField(
                  controller: _organisationName,
                  label: 'Registered business name',
                  required: true,
                ),
                _applicationField(
                    controller: _tradingName, label: 'Trading name'),
                _applicationField(
                    controller: _registrationNumber,
                    label: 'Registration number'),
                _applicationField(
                    controller: _category, label: 'Business category'),
                _applicationField(
                  controller: _contactName,
                  label: 'Contact person',
                  required: true,
                ),
                _applicationField(
                  controller: _contactEmail,
                  label: 'Contact email',
                  keyboardType: TextInputType.emailAddress,
                  required: true,
                ),
                _applicationField(
                  controller: _contactPhone,
                  label: 'Contact phone',
                  keyboardType: TextInputType.phone,
                ),
                _applicationField(
                  controller: _websiteUrl,
                  label: 'Website',
                  keyboardType: TextInputType.url,
                ),
                _applicationField(controller: _city, label: 'City or town'),
                _applicationField(controller: _province, label: 'Province'),
                TextFormField(
                  controller: _description,
                  decoration: const InputDecoration(
                      labelText: 'What does your business sell?'),
                  maxLines: 4,
                  minLines: 3,
                  validator: (value) =>
                      value == null || value.trim().length < 20
                          ? 'Enter at least 20 characters.'
                          : null,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _busy ? null : _submit,
                  icon: _busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.storefront_outlined),
                  label: Text(
                    _busy
                        ? 'Saving business details'
                        : 'Save details and continue',
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  Widget _applicationField({
    required TextEditingController controller,
    required String label,
    TextInputType? keyboardType,
    bool required = false,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: controller,
          decoration: InputDecoration(labelText: label),
          keyboardType: keyboardType,
          validator: required
              ? (value) => value == null || value.trim().isEmpty
                  ? 'This field is required.'
                  : null
              : null,
        ),
      );
}
