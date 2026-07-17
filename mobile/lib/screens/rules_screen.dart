import 'package:flutter/material.dart';

import '../widgets/common.dart';

class RulesScreen extends StatelessWidget {
  const RulesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        ScreenHeader(
          eyebrow: 'Data rules',
          title: 'Data rules',
          description: 'How offers earn a row on the verified board.',
        ),
        _Rule(
          icon: Icons.link,
          title: 'Source first',
          text:
              'Every offer row must point to an official retailer source or a captured page from that source.',
        ),
        _Rule(
          icon: Icons.sell_outlined,
          title: 'Text from source',
          text:
              'Price, saving, and voucher terms must match the retailer copy. No guessed amounts.',
        ),
        _Rule(
          icon: Icons.verified_outlined,
          title: 'Date stamped',
          text:
              'Each row needs a capture date and valid dates before it can appear on the offer board.',
        ),
      ],
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule({required this.icon, required this.title, required this.text});

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) => PaperCard(
        margin: const EdgeInsets.only(bottom: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 17)),
                  const SizedBox(height: 4),
                  Text(text),
                ],
              ),
            ),
          ],
        ),
      );
}
