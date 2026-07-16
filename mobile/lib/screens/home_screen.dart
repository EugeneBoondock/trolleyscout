import 'package:flutter/material.dart';
import '../money_help.dart';
import '../theme.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onGoToDeals});

  final VoidCallback onGoToDeals;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('FOR EVERY HOUSEHOLD IN SOUTH AFRICA', style: TS.eyebrow),
        const SizedBox(height: 6),
        RichText(
          text: const TextSpan(
            style: TextStyle(color: TS.ink, fontSize: 34, fontWeight: FontWeight.w900, height: 1.05),
            children: [
              TextSpan(text: 'Stretch '),
              TextSpan(text: 'every rand', style: TextStyle(backgroundColor: TS.yellow)),
              TextSpan(text: '.\nClaim every cent.'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Groceries are brutal right now. Trolley Scout puts three things in your pocket: '
          'the money and help you are already entitled to, tools to pay less at the shelf, '
          'and real specials from official store pages, never rumours.',
          style: TextStyle(color: TS.muted, fontSize: 15),
        ),
        const SizedBox(height: 20),
        _tillSlip(),
        const SizedBox(height: 12),
        const Text(
          'Grant amounts effective $grantsEffectiveFrom · amounts change every April, '
          'always confirm on sassa.gov.za.',
          style: TextStyle(color: TS.faint, fontSize: 12),
        ),
        const SizedBox(height: 20),
        _fraudNote(),
      ],
    );
  }

  Widget _tillSlip() {
    return Container(
      decoration: TS.card(color: const Color(0xFFFFFDF4)),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Center(
            child: Text('** MONEY ON THE TABLE **',
                style: TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, letterSpacing: 1)),
          ),
          const SizedBox(height: 4),
          const Center(
            child: Text('amounts from official sources · per month',
                style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: TS.faint)),
          ),
          const _DashedLine(),
          for (final line in tillLines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  Expanded(
                    child: Text(line[0],
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                  ),
                  Text(line[1],
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 13, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          const _DashedLine(),
        ],
      ),
    );
  }

  Widget _fraudNote() {
    return Container(
      decoration: BoxDecoration(
        color: TS.surface,
        border: Border.all(color: TS.redBright, width: 2),
      ),
      padding: const EdgeInsets.all(14),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_user, color: TS.redBright),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Applying for any SASSA grant is free. SASSA never charges to process, unblock, or '
              'speed up a grant. Never share your PIN. Report fraud free on 0800 601 011.',
              style: TextStyle(color: TS.muted, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _DashedLine extends StatelessWidget {
  const _DashedLine();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: LayoutBuilder(
        builder: (context, c) {
          final count = (c.maxWidth / 8).floor();
          return Row(
            children: List.generate(
              count,
              (_) => const Expanded(
                child: Text('- ',
                    style: TextStyle(fontFamily: 'monospace', color: TS.faint), textAlign: TextAlign.center),
              ),
            ),
          );
        },
      ),
    );
  }
}
