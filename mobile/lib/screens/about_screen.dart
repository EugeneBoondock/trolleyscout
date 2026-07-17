import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/app_drawer.dart';
import '../widgets/common.dart';

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
              'One place for money you can claim, tools to pay less, and real specials from official shop pages.',
        ),
        _Step(
          number: '1',
          icon: Icons.volunteer_activism_outlined,
          title: 'Claim what is yours',
          text:
              'See SASSA grants, school-fee exemptions, free basic electricity, and UIF with official application links.',
          action: 'Open money help',
          onTap: () => onNavigate(AppDestination.money),
        ),
        _Step(
          number: '2',
          icon: Icons.local_offer_outlined,
          title: 'Find real specials',
          text:
              'See live prices and current store catalogues. Every row links to the shop’s own page.',
          action: 'Find deals',
          onTap: () => onNavigate(AppDestination.deals),
        ),
        _Step(
          number: '3',
          icon: Icons.calculate_outlined,
          title: 'Pay less at the shelf',
          text:
              'Compare pack sizes by price per kilogram, litre, or unit before choosing.',
          action: 'Open tools',
          onTap: () => onNavigate(AppDestination.tools),
        ),
        _Step(
          number: '4',
          icon: Icons.storefront_outlined,
          title: 'Go to the source',
          text:
              'Use official specials, catalogue, store-finder, and free loyalty pages.',
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
                            'Every price, catalogue, and grant amount comes from an official page and shows when it was checked.',
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
    'Some shops publish only a printed catalogue online. Trolley Scout shows live prices where an official feed exists and current catalogues everywhere else.'
  ),
  (
    'Why did a price not match the shop?',
    'Prices change often and specials expire. Open the source link to check the shop’s current page.'
  ),
  (
    'Is it really free?',
    'Yes. Money help, price tools, live deals, and store catalogues are free. Paid plans add larger saved lists.'
  ),
  (
    'How is money help kept accurate?',
    'Every amount links to an official source and includes the date it was checked. Always confirm before acting.'
  ),
];
