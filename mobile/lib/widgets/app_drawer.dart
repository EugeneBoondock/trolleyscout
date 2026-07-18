import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';

enum AppDestination {
  home('Home', Icons.home_outlined, false),
  money('Money help', Icons.volunteer_activism_outlined, false),
  near('Near me', Icons.near_me_outlined, false),
  deals('Find deals', Icons.local_offer_outlined, false),
  scroll('Scroll', Icons.local_fire_department_outlined, false),
  tools('Tools', Icons.calculate_outlined, false),
  dashboard('Dashboard', Icons.dashboard_outlined, true),
  stores('Stores', Icons.storefront_outlined, false),
  vouchers('Vouchers', Icons.confirmation_number_outlined, false),
  savedDeals('Saved deals', Icons.wallet_outlined, true),
  basket('Basket', Icons.shopping_basket_outlined, true),
  savedSources('Saved sources', Icons.bookmark_outline, true),
  offers('Offers', Icons.receipt_long_outlined, false),
  scanner('Scanner', Icons.verified_outlined, false),
  advertise('Advertise', Icons.campaign_outlined, true),
  subscription('Subscription', Icons.credit_card_outlined, true),
  profile('Profile', Icons.account_circle_outlined, true),
  about('About & help', Icons.info_outline, false),
  rules('Rules', Icons.rule_outlined, false),
  admin('Admin console', Icons.admin_panel_settings_outlined, true);

  const AppDestination(this.label, this.icon, this.requiresAuth);

  final String label;
  final IconData icon;
  final bool requiresAuth;
}

class AppMenuDrawer extends StatelessWidget {
  const AppMenuDrawer({
    super.key,
    required this.destination,
    required this.session,
    required this.onSelect,
  });

  final AppDestination destination;
  final MemberSession session;
  final ValueChanged<AppDestination> onSelect;

  @override
  Widget build(BuildContext context) {
    final account = session.account;
    final destinations = AppDestination.values
        .where((item) => item != AppDestination.admin)
        .toList();
    if (account?.isAdmin == true) {
      destinations.insert(6, AppDestination.admin);
    }
    return Drawer(
      backgroundColor: TS.bgOf(context),
      child: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                border: Border(
                    bottom: BorderSide(color: TS.lineOf(context), width: 3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.asset('assets/brand-mark.png',
                            width: 44, height: 44),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                          child: Text('TROLLEY SCOUT', style: TS.display)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    account == null
                        ? 'Stretch every rand.'
                        : account.displayName,
                    style: TextStyle(color: TS.mutedOf(context)),
                  ),
                  if (account != null)
                    Text(account.planName, style: TS.eyebrowOf(context)),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  children: [
                    for (final item in destinations)
                      ListTile(
                        selected: destination == item,
                        selectedTileColor: TS.yellow,
                        selectedColor: TS.ink,
                        iconColor: TS.mutedOf(context),
                        textColor: TS.inkOf(context),
                        shape: destination == item
                            ? Border(
                                left: BorderSide(
                                    color: TS.redOf(context), width: 5),
                                top: BorderSide(
                                    color: TS.lineOf(context), width: 1),
                                bottom: BorderSide(
                                    color: TS.lineOf(context), width: 1),
                              )
                            : null,
                        leading: Icon(item.icon),
                        title: Text(item.label),
                        trailing: item.requiresAuth && !session.isAuthenticated
                            ? const Icon(Icons.lock_outline, size: 16)
                            : null,
                        onTap: () => onSelect(item),
                      ),
                  ],
                ),
              ),
            ),
            const _BoondockFooter(),
          ],
        ),
      ),
    );
  }
}

/// Ownership credit — Trolley Scout is a Boondock Labs product. Tapping opens
/// the Boondock Labs site.
class _BoondockFooter extends StatelessWidget {
  const _BoondockFooter();

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => launchUrl(
        Uri.parse('https://boondocklabs.co.za'),
        mode: LaunchMode.externalApplication,
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: TS.lineOf(context), width: 3)),
        ),
        child: Text.rich(
          TextSpan(
            style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
            children: [
              const TextSpan(text: 'Property of '),
              TextSpan(
                text: 'Boondock Labs (Pty) Ltd',
                style: TextStyle(
                    color: TS.redOf(context),
                    fontWeight: FontWeight.w900,
                    decoration: TextDecoration.underline),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
