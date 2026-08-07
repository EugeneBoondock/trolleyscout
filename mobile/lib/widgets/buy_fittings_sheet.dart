import 'package:flutter/material.dart';

import '../api.dart';
import '../currency.dart';
import '../payfast_checkout.dart';
import '../theme.dart';
import '../ux.dart';
import 'common.dart';

/// Buy more fittings when the month runs dry. Credits never expire and are
/// spent only after the plan's own allowance, so nobody pays for something
/// they already had.
Future<bool> showBuyFittingsSheet(BuildContext context, Api api) async {
  uxTap();
  final bought = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: TS.bgOf(context),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(TS.panelRadius)),
    ),
    builder: (_) => _BuyFittingsSheet(api: api),
  );
  return bought ?? false;
}

class _BuyFittingsSheet extends StatefulWidget {
  const _BuyFittingsSheet({required this.api});

  final Api api;

  @override
  State<_BuyFittingsSheet> createState() => _BuyFittingsSheetState();
}

class _BuyFittingsSheetState extends State<_BuyFittingsSheet> {
  late Future<TryOnCreditOptions> _future = widget.api.tryOnCreditOptions();
  String? _busyPackId;

  Future<void> _buy(TryOnCreditPack pack) async {
    setState(() => _busyPackId = pack.id);
    try {
      final checkout = await widget.api.buyTryOnCredits(pack.id);
      if (!mounted) return;
      final hasCheckout = checkout.redirectUrl != null ||
          (checkout.engineUrl != null && checkout.onsiteUuid != null);
      if (!hasCheckout) {
        showNotice(
          context,
          checkout.message.isEmpty
              ? 'Checkout is unavailable. Try again later.'
              : checkout.message,
        );
        return;
      }
      final opened = await openPayFastCheckout(context, checkout);
      if (!mounted) return;
      if (!opened) {
        showNotice(context, 'Checkout closed. Nothing was charged.');
        return;
      }
      showNotice(context, 'Payment received. Loading your fittings…');
      // PayFast confirms server-side; poll briefly so the shopper sees the
      // new balance rather than being told to check back.
      for (var attempt = 0; attempt < 5; attempt++) {
        await Future<void>.delayed(const Duration(seconds: 2));
        if (!mounted) return;
        final options = await widget.api.tryOnCreditOptions();
        if (!mounted) return;
        if (options.quota.credits >= pack.credits) {
          Navigator.of(context).pop(true);
          return;
        }
        setState(() => _future = Future.value(options));
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _busyPackId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      heightFactor: 0.86,
      child: FutureBuilder<TryOnCreditOptions>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const LoadingPane();
          }
          final options = snapshot.data;
          if (options == null) {
            return ErrorPane(
              message: 'Fitting packs are unavailable right now.',
              onRetry: () =>
                  setState(() => _future = widget.api.tryOnCreditOptions()),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 28),
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: TS.lineOf(context),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('MORE FITTINGS', style: TS.eyebrowOf(context)),
              const SizedBox(height: 4),
              Text(
                'Keep trying things on',
                style:
                    Theme.of(context).textTheme.titleLarge?.merge(TS.display),
              ),
              const SizedBox(height: 6),
              Text(
                options.quota.isUnlimited
                    ? 'Your plan already includes unlimited fittings.'
                    : '${options.quota.label}. Bought fittings never expire and '
                        'are used only once your monthly ones are gone.',
                style: TextStyle(color: TS.mutedOf(context), height: 1.35),
              ),
              const SizedBox(height: 16),
              if (!options.canBuyPacks) ...[
                // A free shopper is not sold packs: a month of Scout costs
                // less than topping up repeatedly and includes everything
                // else. Saying so plainly is the honest sell.
                Container(
                  key: const Key('fittings-upgrade-instead'),
                  padding: const EdgeInsets.all(16),
                  decoration: TS.card(context, width: 2),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('BETTER VALUE', style: TS.eyebrowOf(context)),
                      const SizedBox(height: 6),
                      Text(
                        options.upgradeHint.isEmpty
                            ? 'Scout gives you 50 fittings a month plus the '
                                'whole toolkit.'
                            : options.upgradeHint,
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            height: 1.35),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () => Navigator.of(context).pop(false),
                          child: const Text('See the plans'),
                        ),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                for (final pack in options.packs) ...[
                  _PackCard(
                    pack: pack,
                    busy: _busyPackId == pack.id,
                    disabled: _busyPackId != null && _busyPackId != pack.id,
                    onBuy: () => _buy(pack),
                  ),
                  const SizedBox(height: 10),
                ],
                if (options.upgradeHint.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    options.upgradeHint,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  'Paid securely through PayFast. Your fittings load the '
                  'moment the payment is confirmed.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: TS.faintOf(context), fontSize: 11.5),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _PackCard extends StatelessWidget {
  const _PackCard({
    required this.pack,
    required this.busy,
    required this.disabled,
    required this.onBuy,
  });

  final TryOnCreditPack pack;
  final bool busy;
  final bool disabled;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final currency = Currency.of(kBillingCurrencyCode);
    // The larger pack is the one worth pointing at.
    final best = pack.credits >= 60;
    return Container(
      key: Key('fitting-pack-${pack.id}'),
      padding: const EdgeInsets.all(14),
      decoration: TS.card(context, width: best ? 2.5 : 1.5),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      pack.label,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w900),
                    ),
                    if (best) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: TS.yellow,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'BEST VALUE',
                          style: TextStyle(
                            color: TS.ink,
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${currency.format(pack.perFittingCents)} a fitting',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 118,
            child: FilledButton(
              onPressed: busy || disabled ? null : onBuy,
              style: FilledButton.styleFrom(
                backgroundColor: best ? TS.ink : null,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      currency.format(pack.amountCents),
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
