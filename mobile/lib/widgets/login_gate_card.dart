import 'package:flutter/material.dart';

import '../theme.dart';

/// A soft gate shown to logged-out shoppers under a sampled list: "here's a
/// taste, log in or sign up to see everything." Presentation only — the parent
/// wires the buttons to the auth flow.
class LoginGateCard extends StatelessWidget {
  const LoginGateCard({
    super.key,
    required this.onLogin,
    this.onSignUp,
    this.message = 'You are seeing a sample. Log in or sign up to see everything.',
  });

  final VoidCallback onLogin;
  final VoidCallback? onSignUp;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6, bottom: 6),
      decoration: TS.card(context, color: TS.surfaceSoftOf(context)),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.lock_open_outlined, color: TS.redOf(context)),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('See the full list',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(message, style: TextStyle(color: TS.mutedOf(context))),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    shape: const RoundedRectangleBorder(),
                  ),
                  onPressed: onSignUp ?? onLogin,
                  icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
                  label: const Text('Sign up free'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: TS.inkOf(context),
                    side: BorderSide(color: TS.lineOf(context), width: 2),
                    shape: const RoundedRectangleBorder(),
                  ),
                  onPressed: onLogin,
                  child: const Text('Log in'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
