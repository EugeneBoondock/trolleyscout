import 'package:flutter/material.dart';

import '../api.dart';
import '../payfast_checkout.dart';
import '../theme.dart';
import '../widgets/common.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key, required this.api});

  final Api api;

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  late Future<SubscriptionData> _future = widget.api.subscription();
  String _billingCycle = 'monthly';
  String? _busyPlan;
  CountryPricing? _country;

  @override
  void initState() {
    super.initState();
    _loadCountry();
  }

  Future<void> _loadCountry() async {
    try {
      final country = await widget.api.country();
      if (mounted && !country.isRand) setState(() => _country = country);
    } catch (_) {
      // Rand-only display is always a safe fallback.
    }
  }

  void _reload() => setState(() {
        _future = widget.api.subscription();
      });

  Future<void> _choose(MemberPlan plan) async {
    setState(() => _busyPlan = plan.id);
    try {
      final checkout = await widget.api.checkout(plan.id, _billingCycle);
      if (!mounted) return;
      final opened = await openPayFastCheckout(context, checkout);
      if (opened && mounted) _reload();
      if (mounted) showNotice(context, checkout.message);
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
                                  ? '${formatRand(_billingCycle == 'monthly' ? plan.monthlyCents : plan.annualCents)}/${_billingCycle == 'monthly' ? 'mo' : 'yr'}'
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
                                '≈ ${formatRand((plan.annualCents / 12).round())}/mo',
                                style: TextStyle(
                                    color: TS.mutedOf(context),
                                    fontWeight: FontWeight.w700,
                                    fontSize: 11),
                              ),
                            // Shoppers outside South Africa see their own
                            // currency; PayFast still settles in rand.
                            if (plan.isPaid &&
                                _country?.estimateFromRandCents(
                                        _billingCycle == 'monthly'
                                            ? plan.monthlyCents
                                            : plan.annualCents) !=
                                    null)
                              Text(
                                '${_country!.estimateFromRandCents(_billingCycle == 'monthly' ? plan.monthlyCents : plan.annualCents)!}'
                                '/${_billingCycle == 'monthly' ? 'mo' : 'yr'}',
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
                        plan.monthlyCents * 12 > plan.annualCents) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        color: TS.greenOf(context).withValues(alpha: 0.16),
                        child: Text(
                          'Save ${formatRand(plan.monthlyCents * 12 - plan.annualCents)} a year vs monthly',
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
                                : () => _choose(plan),
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
