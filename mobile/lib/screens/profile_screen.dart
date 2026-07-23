import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../app_controller.dart';
import '../biometric_gate.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';
import '../widgets/scout_avatar_view.dart';

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
  final _confirmPassword = TextEditingController();
  bool _savingProfile = false;
  bool _savingPassword = false;
  bool _showCurrentPassword = false;
  bool _showNewPassword = false;
  bool _showConfirmPassword = false;

  @override
  void dispose() {
    _displayName.dispose();
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
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
    if (_currentPassword.text.isEmpty) {
      showNotice(context, 'Enter your current password.');
      return;
    }
    if (_newPassword.text.length < 8) {
      showNotice(context, 'Use at least 8 characters for the new password.');
      return;
    }
    if (_newPassword.text != _confirmPassword.text) {
      showNotice(context, 'The new passwords do not match.');
      return;
    }
    setState(() => _savingPassword = true);
    try {
      await widget.controller.api
          .changePassword(_currentPassword.text, _newPassword.text);
      _currentPassword.clear();
      _newPassword.clear();
      _confirmPassword.clear();
      TextInput.finishAutofillContext();
      if (mounted) showNotice(context, 'Password updated.');
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _savingPassword = false);
    }
  }

  Future<void> _signOut() async {
    final confirmed = await confirmAction(
      context,
      title: 'Sign out?',
      message: 'You’ll need your email and password to sign in again.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (confirmed) await widget.controller.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final account = widget.controller.session.account;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const ScreenHeader(
          eyebrow: 'Settings',
          title: 'Settings',
          description:
              'Your profile, appearance, security, and how the app behaves.',
        ),
        PaperCard(
          margin: const EdgeInsets.only(bottom: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // The tile is the button — tapping your own picture to change
                  // it is the gesture people already expect from every other app.
                  Semantics(
                    button: true,
                    label: 'Change your profile picture',
                    child: PressableScale(
                      child: GestureDetector(
                        onTap: () => showScoutAvatarPicker(context),
                        child: ScoutAvatarView(
                            initials: account?.initials ?? '?', size: 56),
                      ),
                    ),
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
                        const SizedBox(height: 2),
                        GestureDetector(
                          onTap: () => showScoutAvatarPicker(context),
                          child: Text(
                            'Change picture',
                            style: TextStyle(
                              color: TS.redOf(context),
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              decoration: TextDecoration.underline,
                              decorationColor: TS.redOf(context),
                            ),
                          ),
                        ),
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
              AutofillGroup(
                child: Column(
                  children: [
                    TextField(
                      controller: _currentPassword,
                      obscureText: !_showCurrentPassword,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'Current password',
                        suffixIcon: IconButton(
                          tooltip: _showCurrentPassword
                              ? 'Hide current password'
                              : 'Show current password',
                          onPressed: () => setState(() =>
                              _showCurrentPassword = !_showCurrentPassword),
                          icon: Icon(_showCurrentPassword
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _newPassword,
                      obscureText: !_showNewPassword,
                      autofillHints: const [AutofillHints.newPassword],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'New password',
                        helperText: 'Use at least 8 characters.',
                        suffixIcon: IconButton(
                          tooltip: _showNewPassword
                              ? 'Hide new password'
                              : 'Show new password',
                          onPressed: () => setState(
                              () => _showNewPassword = !_showNewPassword),
                          icon: Icon(_showNewPassword
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _confirmPassword,
                      obscureText: !_showConfirmPassword,
                      autofillHints: const [AutofillHints.newPassword],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) =>
                          _savingPassword ? null : _savePassword(),
                      decoration: InputDecoration(
                        labelText: 'Confirm new password',
                        suffixIcon: IconButton(
                          tooltip: _showConfirmPassword
                              ? 'Hide confirmed password'
                              : 'Show confirmed password',
                          onPressed: () => setState(() =>
                              _showConfirmPassword = !_showConfirmPassword),
                          icon: Icon(_showConfirmPassword
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined),
                        ),
                      ),
                    ),
                  ],
                ),
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
                  subtitle: const Text('A quiet click on key actions'),
                  value: UxSettings.instance.sounds,
                  onChanged: (enabled) {
                    UxSettings.instance.setSounds(enabled);
                    // Preview the warm two-note chime so switching sounds on
                    // is immediately rewarded with the nicest of them.
                    if (enabled) uxSuccess();
                  },
                ),
              ],
            ),
          ),
        ),
        _AppearanceCard(controller: widget.controller),
        const _BiometricCard(),
        OutlinedButton.icon(
          onPressed: widget.controller.busy ? null : _signOut,
          icon: const Icon(Icons.logout),
          label: const Text('Sign out'),
        ),
        const SizedBox(height: 24),
        _DeleteAccountCard(controller: widget.controller),
      ],
    );
  }
}

/// POPIA right-to-erasure: permanently removes the account and personal data.
/// Two gates before anything happens: an explicit warning, then the current
/// password re-verified server-side.
class _DeleteAccountCard extends StatefulWidget {
  const _DeleteAccountCard({required this.controller});

  final AppController controller;

  @override
  State<_DeleteAccountCard> createState() => _DeleteAccountCardState();
}

class _DeleteAccountCardState extends State<_DeleteAccountCard> {
  bool _deleting = false;

  Future<void> _confirmAndDelete() async {
    final password = await _askPassword();
    if (password == null || password.isEmpty || !mounted) return;
    setState(() => _deleting = true);
    try {
      await widget.controller.deleteAccount(password);
      // Success unmounts this whole screen via the auth wall; nothing to show.
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } catch (_) {
      if (mounted) {
        showNotice(context, 'Your account could not be deleted. Try again.');
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  Future<String?> _askPassword() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete your account?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This permanently removes your account, saved deals, basket, '
              'watches, and settings. It cannot be undone.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              obscureText: true,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Current password to confirm',
              ),
              onSubmitted: (value) => Navigator.of(context).pop(value),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Keep my account'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: TS.redOf(context),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Delete forever'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Danger zone',
              style: Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
          const SizedBox(height: 4),
          Text(
            'Deleting your account removes your saved deals, basket, watches, '
            'and personal data from Trolley Scout permanently.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: TS.redOf(context),
              side: BorderSide(color: TS.redOf(context), width: 2),
            ),
            onPressed: _deleting ? null : _confirmAndDelete,
            icon: const Icon(Icons.delete_forever_outlined),
            label: Text(_deleting ? 'Deleting…' : 'Delete account'),
          ),
        ],
      ),
    );
  }
}

/// Appearance: an explicit system/light/dark choice (tester request — there
/// was no way to "change the lighting" from inside the app).
class _AppearanceCard extends StatelessWidget {
  const _AppearanceCard({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      margin: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Appearance',
              style: Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
          const SizedBox(height: 4),
          Text(
            'Match your phone, or keep Trolley Scout light or dark.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment(
                  value: ThemeMode.system,
                  label: Text('System'),
                  icon: Icon(Icons.brightness_auto_outlined),
                ),
                ButtonSegment(
                  value: ThemeMode.light,
                  label: Text('Light'),
                  icon: Icon(Icons.light_mode_outlined),
                ),
                ButtonSegment(
                  value: ThemeMode.dark,
                  label: Text('Dark'),
                  icon: Icon(Icons.dark_mode_outlined),
                ),
              ],
              selected: {controller.themeMode},
              onSelectionChanged: (selection) {
                uxTap();
                controller.setThemeMode(selection.first);
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Opt-in fingerprint unlock. Enabling verifies the shopper once, then the app
/// asks for a fingerprint on each launch instead of a password.
class _BiometricCard extends StatefulWidget {
  const _BiometricCard();

  @override
  State<_BiometricCard> createState() => _BiometricCardState();
}

class _BiometricCardState extends State<_BiometricCard> {
  bool _enabled = false;
  bool _available = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final [available, enabled] = await Future.wait([
      BiometricPrefs.canUse(),
      BiometricPrefs.isEnabled(),
    ]);
    if (mounted) {
      setState(() {
        _available = available;
        _enabled = enabled;
      });
    }
  }

  Future<void> _toggle(bool value) async {
    if (_busy) return;
    setState(() => _busy = true);
    if (value) {
      final ok = await BiometricPrefs.authenticate(
          'Confirm to turn on fingerprint unlock');
      if (ok) {
        await BiometricPrefs.setEnabled(true);
        if (mounted) setState(() => _enabled = true);
      } else if (mounted) {
        showNotice(context, 'Could not verify. Fingerprint unlock stays off.');
      }
    } else {
      await BiometricPrefs.setEnabled(false);
      if (mounted) setState(() => _enabled = false);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      margin: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Security',
              style: Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
          const SizedBox(height: 4),
          Text(
            _available
                ? 'Unlock the app with your fingerprint instead of typing a password.'
                : 'Fingerprint unlock is not available on this device.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Unlock with fingerprint'),
            subtitle:
                const Text('Ask for a fingerprint each time the app opens'),
            value: _enabled,
            onChanged: (_available && !_busy) ? _toggle : null,
          ),
        ],
      ),
    );
  }
}
