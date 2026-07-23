import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/app_drawer.dart';
import '../widgets/common.dart';
import '../widgets/scout_mascot.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({
    super.key,
    required this.onNavigate,
    this.api,
    this.account,
  });

  final ValueChanged<AppDestination> onNavigate;
  final Api? api;
  final MemberAccount? account;

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
          action: 'Open price comparisons',
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
        if (api != null) ...[
          SupportFormCard(api: api!, account: account),
          const SizedBox(height: 18),
        ],
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

/// Support inbox: bug reports, feature requests, and questions go straight to
/// the team and surface in the admin console's support queue.
class SupportFormCard extends StatefulWidget {
  const SupportFormCard({super.key, required this.api, this.account});

  final Api api;
  final MemberAccount? account;

  @override
  State<SupportFormCard> createState() => _SupportFormCardState();
}

class _SupportFormCardState extends State<SupportFormCard> {
  static const _topics = [
    'Bug report',
    'Error message',
    'Feature request',
    'Question',
    'Other',
  ];

  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name =
      TextEditingController(text: widget.account?.displayName ?? '');
  late final TextEditingController _email =
      TextEditingController(text: widget.account?.email ?? '');
  final TextEditingController _message = TextEditingController();
  String _topic = _topics.first;
  bool _sending = false;
  String? _confirmation;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending || !(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _confirmation = null;
    });
    try {
      uxTap();
      final reply = await widget.api.submitSupportMessage(
        name: _name.text.trim(),
        email: _email.text.trim(),
        topic: _topic,
        message: _message.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _confirmation = reply;
        _message.clear();
      });
      uxReward();
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } catch (_) {
      if (mounted) {
        showNotice(context, 'Your message could not be sent. Try again.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.support_agent_outlined, color: TS.redOf(context)),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Contact support',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.merge(TS.display)),
              ),
            ]),
            const SizedBox(height: 4),
            Text(
              'Found a bug, hit an error, or want a feature? Tell the team — '
              'messages land straight in the admin inbox and we reply by email.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _topic,
              decoration: const InputDecoration(labelText: 'Topic'),
              items: [
                for (final topic in _topics)
                  DropdownMenuItem(value: topic, child: Text(topic)),
              ],
              onChanged: _sending
                  ? null
                  : (value) =>
                      setState(() => _topic = value ?? _topics.first),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _name,
              enabled: !_sending,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Your name'),
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Please enter your name.'
                  : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _email,
              enabled: !_sending,
              keyboardType: TextInputType.emailAddress,
              decoration:
                  const InputDecoration(labelText: 'Email for our reply'),
              validator: (value) {
                final email = (value ?? '').trim();
                if (email.isEmpty || !email.contains('@')) {
                  return 'Please enter a valid email address.';
                }
                return null;
              },
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _message,
              enabled: !_sending,
              minLines: 3,
              maxLines: 6,
              maxLength: 2000,
              decoration: const InputDecoration(
                labelText: 'What happened, or what would help?',
                alignLabelWithHint: true,
              ),
              validator: (value) => (value ?? '').trim().length < 10
                  ? 'Please describe it in at least 10 characters.'
                  : null,
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _sending ? null : _submit,
                child: Text(_sending ? 'Sending…' : 'Send to the team'),
              ),
            ),
            if (_confirmation != null) ...[
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_circle_outline,
                      color: TS.greenOf(context), size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _confirmation!,
                      style: TextStyle(
                          color: TS.greenOf(context),
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
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
