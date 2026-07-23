import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../app_controller.dart';
import '../theme.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({
    super.key,
    required this.controller,
    required this.initialIntent,
    required this.onAuthenticated,
    required this.onBack,
  });

  final AppController controller;
  final String initialIntent;
  final VoidCallback onAuthenticated;
  final VoidCallback onBack;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _displayName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  late String _intent = widget.initialIntent;
  bool _obscurePassword = true;

  bool get _isSignUp => _intent == 'signup';

  @override
  void didUpdateWidget(covariant AuthScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialIntent != widget.initialIntent) {
      _intent = widget.initialIntent;
    }
  }

  @override
  void dispose() {
    _displayName.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final draft = _isSignUp
        ? AuthDraft.signUp(
            displayName: _displayName.text.trim(),
            email: _email.text.trim(),
            password: _password.text,
          )
        : AuthDraft.login(
            email: _email.text.trim(),
            password: _password.text,
          );
    if (await widget.controller.authenticate(draft) && mounted) {
      // Let the platform password manager (Samsung Pass, Google) offer to save
      // these credentials so the shopper never retypes them.
      TextInput.finishAutofillContext();
      widget.onAuthenticated();
    }
  }

  Future<void> _openPasswordHelp() async {
    final opened = await launchUrl(
      Uri.parse('https://trolleyscout.co.za/support?topic=account'),
      mode: LaunchMode.externalApplication,
    );
    if (!mounted || opened) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Password help could not be opened. Try again later.'),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 48),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: DecoratedBox(
              decoration: TS.card(context),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _formKey,
                  child: AutofillGroup(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Align(
                          alignment: Alignment.centerLeft,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.asset('assets/scout-logo.png',
                                width: 64, height: 64),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text('MEMBER WORKSPACE', style: TS.eyebrowOf(context)),
                        const SizedBox(height: 8),
                        Text(
                          _isSignUp ? 'Create your account' : 'Welcome back',
                          style: Theme.of(context)
                              .textTheme
                              .headlineMedium
                              ?.merge(TS.display),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _isSignUp
                              ? 'Sign up free to save deals and sources, plan a basket, and keep your lists across devices. No card needed.'
                              : 'Log in to your saved deals, sources, and basket.',
                        ),
                        const SizedBox(height: 20),
                        SegmentedButton<String>(
                          segments: const [
                            ButtonSegment(
                                value: 'signup', label: Text('Sign up')),
                            ButtonSegment(
                                value: 'login', label: Text('Log in')),
                          ],
                          selected: {_intent},
                          onSelectionChanged: (value) => setState(() {
                            _intent = value.first;
                            // A validation notice from the other form (e.g.
                            // "email already registered") no longer applies
                            // once the shopper switches which one they want.
                            widget.controller.notice = null;
                          }),
                        ),
                        const SizedBox(height: 20),
                        if (_isSignUp) ...[
                          TextFormField(
                            controller: _displayName,
                            autofillHints: const [AutofillHints.name],
                            decoration: const InputDecoration(
                                labelText: 'Display name'),
                            textInputAction: TextInputAction.next,
                            validator: (value) =>
                                (value ?? '').trim().length < 2
                                    ? 'Enter your display name.'
                                    : null,
                          ),
                          const SizedBox(height: 14),
                        ],
                        TextFormField(
                          controller: _email,
                          autofillHints: const [AutofillHints.email],
                          decoration: const InputDecoration(labelText: 'Email'),
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          validator: (value) {
                            final email = (value ?? '').trim();
                            return email.contains('@') && email.contains('.')
                                ? null
                                : 'Enter a valid email address.';
                          },
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _password,
                          autofillHints: [
                            _isSignUp
                                ? AutofillHints.newPassword
                                : AutofillHints.password,
                          ],
                          decoration: InputDecoration(
                            labelText: 'Password',
                            suffixIcon: IconButton(
                              tooltip: _obscurePassword
                                  ? 'Show password'
                                  : 'Hide password',
                              onPressed: () => setState(
                                  () => _obscurePassword = !_obscurePassword),
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                              ),
                            ),
                          ),
                          obscureText: _obscurePassword,
                          onFieldSubmitted: (_) => _submit(),
                          validator: (value) => (value ?? '').length < 8
                              ? 'Use at least 8 characters.'
                              : null,
                        ),
                        if (!_isSignUp)
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: _openPasswordHelp,
                              child: const Text('Forgot password?'),
                            ),
                          ),
                        if (widget.controller.notice != null) ...[
                          const SizedBox(height: 14),
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              widget.controller.notice!,
                              style: TextStyle(
                                  color: TS.redOf(context),
                                  fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        FilledButton.icon(
                          onPressed: widget.controller.busy ? null : _submit,
                          icon: const Icon(Icons.person_outline),
                          label: Text(
                            widget.controller.busy
                                ? 'Please wait'
                                : _isSignUp
                                    ? 'Create account'
                                    : 'Log in',
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                            onPressed: widget.onBack,
                            child: const Text('Back')),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
