import 'package:flutter/material.dart';

import '../theme.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onGoToDeals});

  final VoidCallback onGoToDeals;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('SHOP SMARTER', style: TS.eyebrowOf(context)),
        const SizedBox(height: 6),
        RichText(
          text: TextSpan(
            style: TextStyle(
              color: TS.inkOf(context),
              fontSize: 34,
              fontWeight: FontWeight.w900,
              height: 1.05,
            ),
            children: const [
              TextSpan(text: 'Stretch '),
              TextSpan(
                text: 'every budget',
                style: TextStyle(backgroundColor: TS.yellow, color: TS.ink),
              ),
              TextSpan(text: '.\nFind the right deal.'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Compare prices, browse current catalogues, find nearby stores, and search property platforms without jumping between apps.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 15),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: onGoToDeals,
          icon: const Icon(Icons.local_offer_outlined),
          label: const Text('Find grocery deals'),
        ),
        const SizedBox(height: 20),
        const _FeatureCard(
          icon: Icons.calculate_outlined,
          title: 'Compare real value',
          text:
              'Compare pack prices and search selected stores for the product you need.',
        ),
        const SizedBox(height: 12),
        const _FeatureCard(
          icon: Icons.near_me_outlined,
          title: 'Find what is nearby',
          text: 'See local stores and deals based on your location.',
        ),
        const SizedBox(height: 12),
        const _FeatureCard(
          icon: Icons.apartment_outlined,
          title: 'Search more property platforms',
          text: 'Browse homes to rent or buy from multiple listing sources.',
        ),
      ],
    );
  }
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.text,
  });

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: TS.card(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: TS.redOf(context)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(text, style: TextStyle(color: TS.mutedOf(context))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
