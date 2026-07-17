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
        Text('FOR EVERY HOUSEHOLD IN SOUTH AFRICA',
            style: TS.eyebrowOf(context)),
        const SizedBox(height: 6),
        RichText(
          text: TextSpan(
            style: TextStyle(
                color: TS.inkOf(context),
                fontSize: 34,
                fontWeight: FontWeight.w900,
                height: 1.05),
            children: const [
              TextSpan(text: 'Stretch '),
              TextSpan(
                  text: 'every rand',
                  style: TextStyle(backgroundColor: TS.yellow, color: TS.ink)),
              TextSpan(text: '.\nClaim every cent.'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Groceries are brutal right now. Trolley Scout puts three things in your pocket: '
          'the money and help you are already entitled to, tools to pay less at the shelf, '
          'and real specials from official store pages, never rumours.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 15),
        ),
        const SizedBox(height: 20),
        _tillSlip(context),
        const SizedBox(height: 12),
        Text(
          'Grant amounts effective $grantsEffectiveFrom · amounts change every April, '
          'always confirm on sassa.gov.za.',
          style: TextStyle(color: TS.faintOf(context), fontSize: 12),
        ),
        const SizedBox(height: 20),
        _fraudNote(context),
      ],
    );
  }

  Widget _tillSlip(BuildContext context) {
    return Container(
      decoration: TS.card(context, color: const Color(0xFFFFFDF4)),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
      child: DefaultTextStyle.merge(
        style: const TextStyle(color: Color(0xFF23301F)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(
              child: Text('** MONEY ON THE TABLE **',
                  style: TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1)),
            ),
            const SizedBox(height: 4),
            const Center(
              child: Text('amounts from official sources · per month',
                  style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: Color(0xFF6F7A68))),
            ),
            const _DashedLine(),
            for (final line in tillLines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(line[0],
                          style: const TextStyle(
                              fontFamily: 'monospace', fontSize: 13)),
                    ),
                    Text(line[1],
                        style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 13,
                            fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            const _DashedLine(),
          ],
        ),
      ),
    );
  }

  Widget _fraudNote(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.redOf(context), width: 2),
      ),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_user, color: TS.redOf(context)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Applying for any SASSA grant is free. SASSA never charges to process, unblock, or '
              'speed up a grant. Never share your PIN. Report fraud free on 0800 601 011.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
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
                    style: TextStyle(fontFamily: 'monospace', color: TS.faint),
                    textAlign: TextAlign.center),
              ),
            ),
          );
        },
      ),
    );
  }
}
