import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../money_help.dart';
import '../theme.dart';

class MoneyHelpScreen extends StatelessWidget {
  const MoneyHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('MONEY HELP', style: TS.eyebrow),
        const SizedBox(height: 4),
        const Text('Money you may be missing',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        const Text(
          'Millions of rands in grants go unclaimed every month because people were never told. '
          'Everything below is free to claim, and every amount links to its official source.',
          style: TextStyle(color: TS.muted),
        ),
        const SizedBox(height: 16),
        for (final grant in socialGrants) _GrantTile(grant: grant),
        const SizedBox(height: 16),
        const Text(
          'Trolley Scout summarises public information to make it easier to find. It is not legal '
          'or financial advice, and amounts change — the official links are always the final word.',
          style: TextStyle(color: TS.faint, fontSize: 12),
        ),
      ],
    );
  }
}

class _GrantTile extends StatelessWidget {
  const _GrantTile({required this.grant});
  final Grant grant;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: TS.card(),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          shape: const Border(),
          collapsedShape: const Border(),
          title: Text(grant.name, style: const TextStyle(fontWeight: FontWeight.w700)),
          trailing: Text(grant.amount,
              style: const TextStyle(color: TS.red, fontWeight: FontWeight.w900, fontSize: 16)),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          children: [
            _detail('Who qualifies', grant.whoQualifies),
            const SizedBox(height: 8),
            _detail('How to apply', grant.howToApply),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(grant.url), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.open_in_new, size: 16, color: TS.red),
                label: const Text('Official SASSA page', style: TextStyle(color: TS.red)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detail(String label, String value) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(color: TS.muted, fontSize: 14, height: 1.35),
        children: [
          TextSpan(text: '$label: ', style: const TextStyle(color: TS.ink, fontWeight: FontWeight.w700)),
          TextSpan(text: value),
        ],
      ),
    );
  }
}
