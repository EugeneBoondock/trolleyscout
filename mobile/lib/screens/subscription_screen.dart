import 'package:flutter/material.dart';

import '../api.dart';
import '../currency.dart';
import '../payfast_checkout.dart';
import '../theme.dart';
import '../widgets/common.dart';

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
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Membership',
              title: 'Choose your plan',
              description:
                  'Core price tools, deals, and catalogues stay free. Paid plans add larger saved lists.',
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
                        onPressed:
                            data.account?.planId == plan.id || _busyPlan != null
                                ? null
                                : () => _choose(plan, data.account?.planId),
                        child: Text(
                          data.account?.planId == plan.id
                              ? 'Current plan'
                              : _busyPlan == plan.id
                                  ? 'Opening checkout'
                                  : plan.isPaid
                                      ? 'Start ${plan.name}'
                                      : 'Use Free',
                        ),
                      ),
                    ),
                    // Safety-net reassurance: choosing a paid plan isn't a trap.
                    if (plan.isPaid && data.account?.planId != plan.id) ...[
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
