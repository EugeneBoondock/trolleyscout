import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'scout_avatar_view.dart';
import 'in_app_browser.dart';

enum AppDestination {
  near('Near me', Icons.near_me_outlined, false),
  deals('Find deals', Icons.local_offer_outlined, false),
  scroll('Window shopping', Icons.window_outlined, false),
  properties('Properties', Icons.apartment_outlined, false),
  tools('Price comparisons', Icons.calculate_outlined, false),
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
  profile('Settings', Icons.settings_outlined, true),
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
    final groups = <(String, List<AppDestination>)>[
      (
        'Shop',
        [
          AppDestination.dashboard,
          AppDestination.stores,
          AppDestination.near,
          AppDestination.deals,
          AppDestination.scroll,
          AppDestination.vouchers,
        ],
      ),
      (
        'Plan',
        [
          AppDestination.tools,
          AppDestination.properties,
          AppDestination.savedDeals,
          AppDestination.basket,
        ],
      ),
      (
        'Account',
        [
          AppDestination.advertise,
          AppDestination.subscription,
          AppDestination.profile,
        ],
      ),
      ('Support', [AppDestination.about]),
    ];
    if (account?.isAdmin == true) {
      groups.insert(3, ('Administration', [AppDestination.admin]));
    }
    return Drawer(
      backgroundColor: TS.bgOf(context),
      child: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              // Opaque fill so a selected (yellow) row can never show through
              // behind the logo and title.
              decoration: BoxDecoration(
                color: TS.bgOf(context),
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
                        child: Image.asset('assets/scout-logo.png',
                            width: 44, height: 44),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                          child: Text('TROLLEY SCOUT', style: TS.display)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (account == null)
                    Text(
                      'Stretch your budget.',
                      style: TextStyle(color: TS.mutedOf(context)),
                    )
                  else
                    Row(
                      children: [
                        ScoutAvatarView(initials: account.initials, size: 40),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                account.displayName,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800),
                              ),
                              Text(account.planName,
                                  style: TS.eyebrowOf(context)),
                            ],
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
            Expanded(
              child: ClipRect(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final group in groups) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 14, 20, 5),
                          child: Text(group.$1.toUpperCase(),
                              style: TS.eyebrowOf(context)),
                        ),
                        for (final item in group.$2)
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
                                  )
                                : null,
                            leading: Icon(item.icon),
                            title: Text(item.label),
                            trailing:
                                item.requiresAuth && !session.isAuthenticated
                                    ? const Icon(Icons.lock_outline, size: 16)
                                    : null,
                            onTap: () => onSelect(item),
                          ),
                      ],
                    ],
                  ),
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
      onTap: () => showInAppBrowser(
        context,
        'https://boondocklabs.co.za',
        title: 'Boondock Labs',
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 20),
        decoration: BoxDecoration(
          border:
              Border(top: BorderSide(color: TS.lineSoftOf(context), width: 1)),
        ),
        child: Text.rich(
          textAlign: TextAlign.center,
          TextSpan(
            style: TextStyle(
                color: TS.faintOf(context),
                fontSize: 11,
                fontWeight: FontWeight.w500),
            children: [
              const TextSpan(text: 'A '),
              TextSpan(
                text: 'Boondock Labs',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: TS.mutedOf(context),
                ),
              ),
              const TextSpan(text: ' product'),
            ],
          ),
        ),
      ),
    );
  }
}
