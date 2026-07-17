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
        Text('MONEY HELP', style: TS.eyebrowOf(context)),
        const SizedBox(height: 4),
        const Text('Money you may be missing',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        Text(
          'Millions of rands in grants go unclaimed every month because people were never told. '
          'Everything below is free to claim, and every amount links to its official source.',
          style: TextStyle(color: TS.mutedOf(context)),
        ),
        const SizedBox(height: 16),
        for (final grant in socialGrants) _GrantTile(grant: grant),
        const SizedBox(height: 16),
        Text(
          'Trolley Scout summarises public information to make it easier to find. It is not legal '
          'or financial advice, and amounts change. The official links are always the final word.',
          style: TextStyle(color: TS.faintOf(context), fontSize: 12),
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
      decoration: TS.card(context),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          shape: const Border(),
          collapsedShape: const Border(),
          title: Text(grant.name,
              style: const TextStyle(fontWeight: FontWeight.w700)),
          trailing: Text(grant.amount,
              style: TextStyle(
                  color: TS.redOf(context),
                  fontWeight: FontWeight.w900,
                  fontSize: 16)),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          children: [
            _detail(context, 'Who qualifies', grant.whoQualifies),
            const SizedBox(height: 8),
            _detail(context, 'How to apply', grant.howToApply),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(grant.url),
                    mode: LaunchMode.externalApplication),
                icon:
                    Icon(Icons.open_in_new, size: 16, color: TS.redOf(context)),
                label: Text('Official SASSA page',
                    style: TextStyle(color: TS.redOf(context))),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detail(BuildContext context, String label, String value) {
    return RichText(
      text: TextSpan(
        style:
            TextStyle(color: TS.mutedOf(context), fontSize: 14, height: 1.35),
        children: [
          TextSpan(
              text: '$label: ',
              style: TextStyle(
                  color: TS.inkOf(context), fontWeight: FontWeight.w700)),
          TextSpan(text: value),
        ],
      ),
    );
  }
}
