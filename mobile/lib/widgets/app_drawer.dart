import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'scout_avatar_view.dart';
import 'in_app_browser.dart';

enum AppDestination {
  near('Near me', Icons.near_me_outlined, false),
  deals('Marketplace', Icons.local_offer_outlined, false),
  clothing('Fitting room', Icons.checkroom_outlined, false),
  chat('Mr Scout', Icons.chat_bubble_outline, true),
  scroll('Window shopping', Icons.window_outlined, false),
  properties('Properties', Icons.apartment_outlined, false),
  tools('Price comparisons', Icons.calculate_outlined, false),
  dashboard('Dashboard', Icons.dashboard_outlined, false),
  stores('Stores', Icons.storefront_outlined, false),
  vouchers('Vouchers', Icons.confirmation_number_outlined, false),
  coverage('Coverage', Icons.public_outlined, false),
  loyaltyWallet('Loyalty cards', Icons.credit_card_outlined, true),
  savedDeals('Saved deals', Icons.wallet_outlined, true),
  basket('Basket', Icons.shopping_basket_outlined, true),
  savedSources('Saved sources', Icons.bookmark_outline, true),
  storeSessions('Store sign-ins', Icons.key_outlined, true),
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
          AppDestination.deals,
          AppDestination.chat,
          AppDestination.stores,
          AppDestination.near,
          AppDestination.scroll,
          AppDestination.vouchers,
          AppDestination.coverage,
          AppDestination.loyaltyWallet,
        ],
      ),
      (
        'Plan',
        [
          AppDestination.tools,
          AppDestination.properties,
          AppDestination.savedDeals,
          AppDestination.basket,
          AppDestination.storeSessions,
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
                // No overscroll glow. The app's accent is a saturated yellow,
                // so the glow painted a solid yellow band across the drawer at
                // whichever end the list ran out, over the footer at the
                // bottom and over the header at the top.
                child: ScrollConfiguration(
                  behavior: const _NoGlowScrollBehavior(),
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
                            // Marketplace is a section with children (Clothing
                            // for now): its row navigates as usual, its chevron
                            // folds the children away.
                            if (item == AppDestination.deals)
                              _ExpandableDrawerGroup(
                                parent: _drawerTile(
                                  context,
                                  item,
                                  withChevronGutter: true,
                                ),
                                isChildSelected:
                                    destination == AppDestination.clothing,
                                children: [
                                  _drawerSubTile(
                                      context, AppDestination.clothing),
                                ],
                              )
                            else
                              _drawerTile(context, item),
                        ],
                      ],
                    ),
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

  Widget _drawerTile(
    BuildContext context,
    AppDestination item, {
    bool withChevronGutter = false,
  }) {
    return ListTile(
      key: ValueKey('drawer-${item.name}'),
      selected: destination == item,
      selectedTileColor: TS.yellow,
      selectedColor: TS.ink,
      iconColor: TS.mutedOf(context),
      textColor: TS.inkOf(context),
      // A group parent leaves room for the fold chevron drawn beside it.
      contentPadding:
          withChevronGutter ? const EdgeInsets.only(left: 16, right: 52) : null,
      shape: destination == item
          ? Border(
              left: BorderSide(color: TS.redOf(context), width: 5),
            )
          : null,
      leading: Icon(item.icon),
      title: Text(item.label),
      trailing: item.requiresAuth && !session.isAuthenticated
          ? const Icon(Icons.lock_outline, size: 16)
          : null,
      onTap: () => onSelect(item),
    );
  }

  /// A quiet child row: no icon of its own, just the thread elbow tying it to
  /// its parent and a smaller label — a file-tree line, not a second peer.
  Widget _drawerSubTile(BuildContext context, AppDestination item) {
    final selected = destination == item;
    return InkWell(
      key: ValueKey('drawer-${item.name}'),
      onTap: () => onSelect(item),
      child: Container(
        height: 40,
        padding: const EdgeInsets.only(left: 27, right: 16),
        decoration: selected
            ? BoxDecoration(
                color: TS.yellow,
                border: Border(
                  left: BorderSide(color: TS.redOf(context), width: 5),
                ),
              )
            : null,
        child: Row(
          children: [
            Icon(
              Icons.subdirectory_arrow_right_rounded,
              size: 16,
              color: selected ? TS.ink : TS.faintOf(context),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                item.label,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: selected ? FontWeight.w900 : FontWeight.w600,
                  color: selected ? TS.ink : TS.inkOf(context),
                ),
              ),
            ),
            if (item.requiresAuth && !session.isAuthenticated)
              const Icon(Icons.lock_outline, size: 14),
          ],
        ),
      ),
    );
  }
}

/// A drawer section that folds: the parent row keeps its normal navigation
/// tap, a chevron beside it opens and closes the children with a smooth
/// animated reveal. Opens itself whenever a child is the current page so the
/// selection is never hidden inside a closed fold.
class _ExpandableDrawerGroup extends StatefulWidget {
  const _ExpandableDrawerGroup({
    required this.parent,
    required this.children,
    required this.isChildSelected,
  });

  final Widget parent;
  final List<Widget> children;
  final bool isChildSelected;

  @override
  State<_ExpandableDrawerGroup> createState() => _ExpandableDrawerGroupState();
}

class _ExpandableDrawerGroupState extends State<_ExpandableDrawerGroup> {
  late bool _expanded = widget.isChildSelected;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Stack(
          alignment: Alignment.centerRight,
          children: [
            widget.parent,
            Positioned(
              right: 6,
              child: IconButton(
                key: const ValueKey('drawer-group-toggle'),
                tooltip: _expanded ? 'Hide categories' : 'Show categories',
                onPressed: () => setState(() => _expanded = !_expanded),
                icon: AnimatedRotation(
                  turns: _expanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 180),
                  child: Icon(
                    Icons.expand_more_rounded,
                    size: 22,
                    color: TS.mutedOf(context),
                  ),
                ),
              ),
            ),
          ],
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: _expanded
              ? Column(children: widget.children)
              : const SizedBox(width: double.infinity),
        ),
      ],
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
        // Opaque fill, for the same reason the header has one: the list
        // scrolls underneath this, and a selected row is a solid yellow bar.
        // Without a background it slid straight through the credit line.
        decoration: BoxDecoration(
          color: TS.bgOf(context),
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

/// Kills the overscroll glow. Trolley Scout's accent is a saturated yellow,
/// which the glow paints as a solid band right across whatever it overlaps.
class _NoGlowScrollBehavior extends ScrollBehavior {
  const _NoGlowScrollBehavior();

  @override
  Widget buildOverscrollIndicator(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) =>
      child;
}
