import 'package:flutter/material.dart';

import '../store_sessions.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/in_app_browser.dart';

/// Where the shopper signs into the shops they buy from, once, so Mr Scout can
/// fill those carts later.
///
/// The sign-in happens on the store's own page inside the app's browser. The
/// app keeps no password and no token of its own — only a note that a session
/// exists, so this screen has something honest to show.
class StoreSessionsScreen extends StatefulWidget {
  const StoreSessionsScreen({super.key});

  @override
  State<StoreSessionsScreen> createState() => _StoreSessionsScreenState();
}

class _StoreSessionsScreenState extends State<StoreSessionsScreen> {
  final StoreSessionStore _sessions = StoreSessionStore.instance;

  @override
  void initState() {
    super.initState();
    _sessions.addListener(_onChanged);
    _sessions.load();
  }

  @override
  void dispose() {
    _sessions.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _signIn(SupportedStore store) async {
    await showInAppBrowser(
      context,
      store.signInUrl,
      title: 'Sign in to ${store.name}',
      watchSessionFor: store,
    );
  }

  Future<void> _forget(SupportedStore store) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Forget ${store.name}?'),
        content: Text(
          'Mr Scout will stop treating you as signed in at ${store.name}. '
          'To end the session at the shop itself, sign out on their site.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Forget'),
          ),
        ],
      ),
    );
    if (confirmed == true) await _sessions.forget(store.id);
  }

  @override
  Widget build(BuildContext context) {
    final signedInCount =
        supportedStores.where((store) => _sessions.isSignedIn(store.id)).length;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        ScreenHeader(
          eyebrow: 'Mr Scout',
          title: 'Your store sign-ins',
          description: signedInCount == 0
              ? 'Sign in once to a shop and Mr Scout can fill that cart for you later.'
              : 'Signed in at $signedInCount ${signedInCount == 1 ? 'shop' : 'shops'}. Mr Scout can fill those carts.',
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: TS.surfaceSoftOf(context),
            borderRadius: BorderRadius.circular(TS.panelRadius),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.shield_outlined, size: 18, color: TS.mutedOf(context)),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  'You type your password into the shop\'s own page. Trolley Scout '
                  'never sees it, never stores it, and never pays for anything — '
                  'Mr Scout stops at the cart so you check out yourself.',
                  style: TextStyle(
                    color: TS.mutedOf(context),
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        for (final store in supportedStores) ...[
          _StoreSessionCard(
            onForget: () => _forget(store),
            onSignIn: () => _signIn(store),
            record: _sessions.recordFor(store.id),
            store: store,
          ),
          const SizedBox(height: 9),
        ],
      ],
    );
  }
}

class _StoreSessionCard extends StatelessWidget {
  const _StoreSessionCard({
    required this.onForget,
    required this.onSignIn,
    required this.record,
    required this.store,
  });

  final VoidCallback onForget;
  final VoidCallback onSignIn;
  final StoreSessionRecord? record;
  final SupportedStore store;

  @override
  Widget build(BuildContext context) {
    final signedIn = record != null;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
      decoration: BoxDecoration(
        border: Border.all(color: TS.lineSoftOf(context)),
        borderRadius: BorderRadius.circular(TS.panelRadius),
        color: TS.surfaceOf(context),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: signedIn ? TS.greenOf(context) : TS.surfaceSoftOf(context),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              signedIn ? Icons.check_rounded : Icons.storefront_outlined,
              color: signedIn ? Colors.white : TS.mutedOf(context),
              size: 18,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  store.name,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                Text(
                  signedIn
                      ? record?.accountLabel == null
                          ? 'Signed in'
                          : 'Signed in as ${record!.accountLabel}'
                      : store.host,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: signedIn ? TS.greenOf(context) : TS.mutedOf(context),
                    fontSize: 11,
                    fontWeight: signedIn ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          if (signedIn)
            IconButton(
              icon: const Icon(Icons.link_off, size: 18),
              onPressed: onForget,
              tooltip: 'Forget ${store.name}',
            )
          else
            TextButton(onPressed: onSignIn, child: const Text('Sign in')),
        ],
      ),
    );
  }
}
