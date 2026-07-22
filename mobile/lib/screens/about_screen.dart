import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/app_drawer.dart';
import '../widgets/common.dart';
import '../widgets/scout_mascot.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key, required this.onNavigate});

  final ValueChanged<AppDestination> onNavigate;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const ScreenHeader(
          eyebrow: 'About & help',
          title: 'How Trolley Scout helps',
          description:
              'One place for current deals, store catalogues, product comparison, nearby stores, and property searches.',
        ),
        const Center(
          child: ScoutMascot(
            label: 'Scout, your Trolley Scout guide',
            pose: ScoutMascotPose.wave,
            size: 180,
          ),
        ),
        const SizedBox(height: 8),
        _Step(
          number: '1',
          icon: Icons.local_offer_outlined,
          title: 'Find real specials',
          text:
              'Search live prices and current store catalogues, then save a deal or add it straight to your basket.',
          action: 'Find deals',
          onTap: () => onNavigate(AppDestination.deals),
        ),
        _Step(
          number: '2',
          icon: Icons.compare_arrows_outlined,
          title: 'Compare across stores',
          text:
              'Search the same product across the stores you choose, or compare a whole shopping list.',
          action: 'Open tools',
          onTap: () => onNavigate(AppDestination.tools),
        ),
        _Step(
          number: '3',
          icon: Icons.storefront_outlined,
          title: 'Browse stores and catalogues',
          text:
              'Open a store card for its local deals and catalogues. Source links stay inside Trolley Scout’s browser.',
          action: 'Browse stores',
          onTap: () => onNavigate(AppDestination.stores),
        ),
        PaperCard(
          margin: const EdgeInsets.only(bottom: 18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.verified_user_outlined, color: TS.greenOf(context)),
              const SizedBox(width: 10),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                          text: 'Source-first, always. ',
                          style: TextStyle(fontWeight: FontWeight.w900)),
                      TextSpan(
                        text:
                            'Every price and catalogue comes from a source page and shows when it was checked.',
                        style: TextStyle(
                            color:
                                Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        Text('Good to know',
            style:
                Theme.of(context).textTheme.headlineSmall?.merge(TS.display)),
        const SizedBox(height: 8),
        for (final faq in _faqs)
          Card(
            child: ExpansionTile(
              title: Text(faq.$1,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              children: [
                Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Text(faq.$2))
              ],
            ),
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.number,
    required this.icon,
    required this.title,
    required this.text,
    required this.action,
    required this.onTap,
  });

  final String number;
  final IconData icon;
  final String title;
  final String text;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PaperCard(
        margin: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(icon, color: TS.redOf(context)),
              const SizedBox(width: 8),
              Text('$number. $title',
                  style:
                      Theme.of(context).textTheme.titleLarge?.merge(TS.display))
            ]),
            const SizedBox(height: 8),
            Text(text),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: onTap, child: Text(action)),
          ],
        ),
      );
}

const _faqs = [
  (
    'Why don’t I see every product from every shop?',
    'Some shops publish catalogues instead of a searchable product feed. Trolley Scout shows searchable prices where a source returns them and catalogue pages for the rest.'
  ),
  (
    'Why did a price not match the shop?',
    'Prices change often and specials expire. Open the source link in Trolley Scout’s browser to check the shop’s current page.'
  ),
  (
    'Is it really free?',
    'Yes. Deal search, store comparison, nearby stores, and catalogues are free. Paid plans add larger saved-deal and basket limits.'
  ),
];
