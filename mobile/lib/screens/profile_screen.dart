import 'package:flutter/material.dart';

import '../api.dart';
import '../app_controller.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final _displayName = TextEditingController(
    text: widget.controller.session.account?.displayName ?? '',
  );
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  bool _savingProfile = false;
  bool _savingPassword = false;

  @override
  void dispose() {
    _displayName.dispose();
    _currentPassword.dispose();
    _newPassword.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    if (_displayName.text.trim().length < 2) {
      showNotice(context, 'Use a display name with at least 2 characters.');
      return;
    }
    setState(() => _savingProfile = true);
    try {
      final account =
          await widget.controller.api.updateProfile(_displayName.text.trim());
      widget.controller.replaceAccount(account);
      if (mounted) showNotice(context, 'Profile updated.');
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _savingProfile = false);
    }
  }

  Future<void> _savePassword() async {
    if (_newPassword.text.length < 8) {
      showNotice(context, 'Use at least 8 characters for the new password.');
      return;
    }
    setState(() => _savingPassword = true);
    try {
      await widget.controller.api
          .changePassword(_currentPassword.text, _newPassword.text);
      _currentPassword.clear();
      _newPassword.clear();
      if (mounted) showNotice(context, 'Password updated.');
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _savingPassword = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = widget.controller.session.account;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const ScreenHeader(
          eyebrow: 'Account',
          title: 'Your profile',
          description: 'Update your member name, password, or session.',
        ),
        PaperCard(
          margin: const EdgeInsets.only(bottom: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    child: Text(account?.initials ?? '?',
                        style: const TextStyle(fontWeight: FontWeight.w900)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(account?.email ?? '',
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                        Text(
                            '${account?.planName ?? 'Free'} plan · ${account?.role ?? 'member'}'),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                  controller: _displayName,
                  decoration: const InputDecoration(labelText: 'Display name')),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _savingProfile ? null : _saveProfile,
                child: Text(_savingProfile ? 'Saving' : 'Save profile'),
              ),
            ],
          ),
        ),
        PaperCard(
          margin: const EdgeInsets.only(bottom: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Change password',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.merge(TS.display)),
              const SizedBox(height: 12),
              TextField(
                controller: _currentPassword,
                obscureText: true,
                decoration:
                    const InputDecoration(labelText: 'Current password'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _newPassword,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _savingPassword ? null : _savePassword,
                child: Text(_savingPassword ? 'Updating' : 'Update password'),
              ),
            ],
          ),
        ),
        PaperCard(
          margin: const EdgeInsets.only(bottom: 14),
          child: AnimatedBuilder(
            animation: UxSettings.instance,
            builder: (context, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('App feel',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.merge(TS.display)),
                const SizedBox(height: 4),
                Text(
                  'Small touches that make the app feel alive. Both stay out of '
                  'your way and can be switched off any time.',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Haptic feedback'),
                  subtitle: const Text('A light tick on saves and actions'),
                  value: UxSettings.instance.haptics,
                  onChanged: (enabled) {
                    UxSettings.instance.setHaptics(enabled);
                    if (enabled) uxTap();
                  },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Tap sounds'),
                  subtitle: const Text('A subtle click on key actions'),
                  value: UxSettings.instance.sounds,
                  onChanged: (enabled) {
                    UxSettings.instance.setSounds(enabled);
                    if (enabled) uxTap();
                  },
                ),
              ],
            ),
          ),
        ),
        OutlinedButton.icon(
          onPressed: widget.controller.busy ? null : widget.controller.signOut,
          icon: const Icon(Icons.logout),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}
