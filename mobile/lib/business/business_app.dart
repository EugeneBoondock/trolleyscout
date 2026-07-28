import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api_models.dart';
import '../app_update_prompt.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/scout_mark.dart';
import 'business_admin_app.dart';
import 'business_controller.dart';
import 'business_models.dart';

class TrolleyScoutBusinessApp extends StatefulWidget {
  const TrolleyScoutBusinessApp({
    super.key,
    this.appUpdateService,
    this.controller,
    this.updateCheckDelay = const Duration(milliseconds: 800),
  });

  final AppUpdateService? appUpdateService;
  final BusinessController? controller;
  final Duration updateCheckDelay;

  @override
  State<TrolleyScoutBusinessApp> createState() =>
      _TrolleyScoutBusinessAppState();
}

class _TrolleyScoutBusinessAppState extends State<TrolleyScoutBusinessApp> {
  late final BusinessController _controller =
      widget.controller ?? BusinessController();
  late final bool _ownsController = widget.controller == null;
  late final AppUpdateService _appUpdateService =
      widget.appUpdateService ??
      GooglePlayAppUpdateService(
        packageName: trolleyScoutBusinessAndroidPackage,
      );

  @override
  void initState() {
    super.initState();
    _controller.restore();
  }

  @override
  void dispose() {
    if (_ownsController) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => MaterialApp(
          title: 'Trolley Scout for Business',
          debugShowCheckedModeBanner: false,
          theme: TS.lightTheme(),
          darkTheme: TS.darkTheme(),
          themeMode: _controller.themeMode,
          home: AppUpdatePromptHost(
            checkDelay: widget.updateCheckDelay,
            service: _appUpdateService,
            child: _BusinessRoot(controller: _controller),
          ),
        ),
      );
}

class _BusinessRoot extends StatelessWidget {
  const _BusinessRoot({required this.controller});

  final BusinessController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.state == BusinessLoadState.loading) {
      return const _BusinessLoadingScreen();
    }
    if (controller.state == BusinessLoadState.error) {
      return Scaffold(
        body: ErrorPane(
          message: 'Your business workspace is still here.',
          detail: controller.error,
          onRetry: controller.restore,
        ),
      );
    }

    final bootstrap = controller.bootstrap;
    if (bootstrap == null || !controller.isAuthenticated) {
      return _BusinessAuthScreen(controller: controller);
    }
    if (bootstrap.session.account?.isAdmin == true) {
      return _AdminModeHost(
        controller: controller,
        bootstrap: bootstrap,
      );
    }
    if (!bootstrap.gate.hasOrganization ||
        bootstrap.gate.organization == null) {
      return _OrganizationGateScreen(
        controller: controller,
        bootstrap: bootstrap,
      );
    }
    return _BusinessShell(controller: controller, bootstrap: bootstrap);
  }
}

class _AdminModeHost extends StatefulWidget {
  const _AdminModeHost({
    required this.bootstrap,
    required this.controller,
  });

  final BusinessBootstrap bootstrap;
  final BusinessController controller;

  @override
  State<_AdminModeHost> createState() => _AdminModeHostState();
}

class _AdminModeHostState extends State<_AdminModeHost> {
  bool _businessView = false;

  @override
  Widget build(BuildContext context) {
    if (_businessView) {
      return _AdminBusinessView(
        controller: widget.controller,
        onViewAdmin: () => setState(() => _businessView = false),
      );
    }
    return BusinessAdminShell(
      bootstrap: widget.bootstrap,
      controller: widget.controller,
      onViewBusiness: () => setState(() => _businessView = true),
    );
  }
}

class _AdminBusinessView extends StatefulWidget {
  const _AdminBusinessView({
    required this.controller,
    required this.onViewAdmin,
  });

  final BusinessController controller;
  final VoidCallback onViewAdmin;

  @override
  State<_AdminBusinessView> createState() => _AdminBusinessViewState();
}

class _AdminBusinessViewState extends State<_AdminBusinessView> {
  String? _businessId;

  @override
  Widget build(BuildContext context) {
    final overview = widget.controller.adminOverview;
    final businesses = overview?.businesses
            .where((business) => business.isActive)
            .toList(growable: false) ??
        const <BusinessAdminOrganization>[];
    final selectedId = businesses.any((business) => business.id == _businessId)
        ? _businessId
        : businesses.firstOrNull?.id;
    final selected =
        businesses.where((business) => business.id == selectedId).firstOrNull;
    final campaigns = overview?.campaigns
            .where((campaign) => campaign.organizationId == selectedId)
            .toList(growable: false) ??
        const <BusinessAdminCampaign>[];

    return Scaffold(
      appBar: AppBar(
        title: const _BusinessBrand(compact: true),
        actions: [
          IconButton(
            tooltip: 'Admin view',
            onPressed: widget.onViewAdmin,
            icon: const Icon(Icons.admin_panel_settings_outlined),
          ),
          IconButton(
            tooltip: Theme.of(context).brightness == Brightness.dark
                ? 'Use light theme'
                : 'Use dark theme',
            onPressed: () =>
                widget.controller.toggleTheme(Theme.of(context).brightness),
            icon: Icon(
              Theme.of(context).brightness == Brightness.dark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
            ),
          ),
        ],
      ),
      body: overview == null
          ? ErrorPane(
              message: 'Business view is unavailable.',
              detail: widget.controller.error,
              onRetry: widget.controller.refreshAdminOverview,
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(18),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1120),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ScreenHeader(
                        eyebrow: 'BUSINESS VIEW',
                        title: selected?.name ?? 'Business workspace',
                        description:
                            'Preview campaigns, promotions, deals, posts, and shopper results for an approved business.',
                        action: businesses.isEmpty
                            ? null
                            : SizedBox(
                                width: 280,
                                child: DropdownButtonFormField<String>(
                                  initialValue: selectedId,
                                  decoration: const InputDecoration(
                                    labelText: 'View business',
                                    prefixIcon: Icon(Icons.storefront_outlined),
                                  ),
                                  items: businesses
                                      .map(
                                        (business) => DropdownMenuItem(
                                          value: business.id,
                                          child: Text(
                                            business.name,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      )
                                      .toList(growable: false),
                                  onChanged: (value) =>
                                      setState(() => _businessId = value),
                                ),
                              ),
                      ),
                      if (selected == null)
                        const EmptyCard(
                          icon: Icons.storefront_outlined,
                          message:
                              'Approve a business to open its business view.',
                        )
                      else ...[
                        _AdminBusinessViewNotice(
                          businessName: selected.name,
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            _AdminBusinessMetric(
                              icon: Icons.campaign_outlined,
                              label: 'Active campaigns',
                              value: '${selected.activeCampaigns}',
                            ),
                            _AdminBusinessMetric(
                              icon: Icons.visibility_outlined,
                              label: 'Impressions',
                              value: _adminPreviewCount(
                                selected.impressions,
                              ),
                            ),
                            _AdminBusinessMetric(
                              icon: Icons.bookmark_outline,
                              label: 'Saves',
                              value: _adminPreviewCount(selected.saves),
                            ),
                            _AdminBusinessMetric(
                              icon: Icons.open_in_new,
                              label: 'Visits',
                              value: _adminPreviewCount(selected.visits),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Campaigns and promotions',
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.merge(TS.display),
                        ),
                        const SizedBox(height: 10),
                        if (campaigns.isEmpty)
                          const EmptyCard(
                            icon: Icons.campaign_outlined,
                            message:
                                'This business has not created a campaign yet.',
                          )
                        else
                          LayoutBuilder(
                            builder: (context, constraints) {
                              final width = constraints.maxWidth >= 760
                                  ? (constraints.maxWidth - 12) / 2
                                  : constraints.maxWidth;
                              return Wrap(
                                spacing: 12,
                                runSpacing: 12,
                                children: campaigns
                                    .map(
                                      (campaign) => SizedBox(
                                        width: width,
                                        child: _AdminBusinessCampaignPreview(
                                          campaign: campaign,
                                        ),
                                      ),
                                    )
                                    .toList(growable: false),
                              );
                            },
                          ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}

class _AdminBusinessViewNotice extends StatelessWidget {
  const _AdminBusinessViewNotice({required this.businessName});

  final String businessName;

  @override
  Widget build(BuildContext context) => PaperCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.visibility_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'You are viewing $businessName as a business. This owner preview is read-only, so campaign changes stay with the approved business account.',
                style: TextStyle(color: TS.mutedOf(context), height: 1.45),
              ),
            ),
          ],
        ),
      );
}

class _AdminBusinessMetric extends StatelessWidget {
  const _AdminBusinessMetric({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 210,
        child: PaperCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: TS.red),
              const SizedBox(height: 10),
              Text(
                value,
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              Text(label, style: TextStyle(color: TS.faintOf(context))),
            ],
          ),
        ),
      );
}

class _AdminBusinessCampaignPreview extends StatelessWidget {
  const _AdminBusinessCampaignPreview({required this.campaign});

  final BusinessAdminCampaign campaign;

  @override
  Widget build(BuildContext context) => PaperCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: TS.surfaceSoftOf(context),
                borderRadius: BorderRadius.circular(TS.controlRadius),
              ),
              clipBehavior: Clip.antiAlias,
              child: campaign.imageUrl == null
                  ? const Icon(Icons.campaign_outlined)
                  : Image.network(
                      campaign.imageUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.image_not_supported_outlined),
                    ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    campaign.title,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${_adminPreviewLabel(campaign.kind)}, ${_adminPreviewLabel(campaign.placement)}, ${_adminPreviewLabel(campaign.status)}',
                    style: TextStyle(
                      color: TS.faintOf(context),
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 9),
                  Text(
                    '${_adminPreviewCount(campaign.impressions)} impressions  ${_adminPreviewCount(campaign.saves)} saves  ${_adminPreviewCount(campaign.visits)} visits',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

String _adminPreviewCount(int value) {
  if (value >= 1000000) {
    return '${(value / 1000000).toStringAsFixed(value >= 10000000 ? 0 : 1)}M';
  }
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(value >= 10000 ? 0 : 1)}K';
  }
  return '$value';
}

String _adminPreviewLabel(String value) {
  final text = value.replaceAll('_', ' ');
  return text.isEmpty ? text : '${text[0].toUpperCase()}${text.substring(1)}';
}

class _BusinessLoadingScreen extends StatelessWidget {
  const _BusinessLoadingScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AnimatedScoutMark.business(
                motion: ScoutMarkMotion.spin,
                size: 58,
              ),
              const SizedBox(height: 18),
              Text(
                'TROLLEY SCOUT',
                style:
                    Theme.of(context).textTheme.titleLarge?.merge(TS.display),
              ),
              Text('FOR BUSINESS', style: TS.eyebrowOf(context)),
              const SizedBox(height: 20),
              const SizedBox(
                width: 180,
                child: LinearProgressIndicator(),
              ),
            ],
          ),
        ),
      );
}

class _BusinessAuthScreen extends StatefulWidget {
  const _BusinessAuthScreen({required this.controller});

  final BusinessController controller;

  @override
  State<_BusinessAuthScreen> createState() => _BusinessAuthScreenState();
}

class _BusinessAuthScreenState extends State<_BusinessAuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final draft = AuthDraft.login(
      email: _email.text.trim(),
      password: _password.text,
    );
    await widget.controller.authenticate(draft);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const _BusinessBrand(compact: true),
          actions: [
            IconButton(
              tooltip: Theme.of(context).brightness == Brightness.dark
                  ? 'Use light theme'
                  : 'Use dark theme',
              onPressed: () =>
                  widget.controller.toggleTheme(Theme.of(context).brightness),
              icon: Icon(
                Theme.of(context).brightness == Brightness.dark
                    ? Icons.light_mode_outlined
                    : Icons.dark_mode_outlined,
              ),
            ),
          ],
        ),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('TROLLEY SCOUT FOR BUSINESS',
                        style: TS.eyebrowOf(context)),
                    const SizedBox(height: 8),
                    Text(
                      'Run your storefront',
                      style: Theme.of(context)
                          .textTheme
                          .displaySmall
                          ?.merge(TS.display),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Publish deals, plan Window Shopping posts, manage locations, and see what shoppers save.',
                      style: TextStyle(color: TS.mutedOf(context), height: 1.5),
                    ),
                    const SizedBox(height: 22),
                    PaperCard(
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Open your workspace',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.merge(TS.display),
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _email,
                              keyboardType: TextInputType.emailAddress,
                              autofillHints: const [AutofillHints.email],
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                prefixIcon: Icon(Icons.mail_outline),
                              ),
                              textInputAction: TextInputAction.next,
                              validator: (value) =>
                                  value == null || !value.contains('@')
                                      ? 'Enter a valid email address.'
                                      : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _password,
                              obscureText: _obscurePassword,
                              autofillHints: const [AutofillHints.password],
                              decoration: InputDecoration(
                                labelText: 'Password',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  tooltip: _obscurePassword
                                      ? 'Show password'
                                      : 'Hide password',
                                  onPressed: () => setState(() =>
                                      _obscurePassword = !_obscurePassword),
                                  icon: Icon(
                                    _obscurePassword
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                  ),
                                ),
                              ),
                              onFieldSubmitted: (_) => _submit(),
                              validator: (value) =>
                                  value == null || value.length < 8
                                      ? 'Use at least 8 characters.'
                                      : null,
                            ),
                            if (widget.controller.error != null) ...[
                              const SizedBox(height: 12),
                              _MessageBanner(
                                message: widget.controller.error!,
                                error: true,
                                onClose: widget.controller.clearMessage,
                              ),
                            ],
                            const SizedBox(height: 18),
                            FilledButton.icon(
                              key: const ValueKey('business-auth-submit'),
                              onPressed:
                                  widget.controller.busy ? null : _submit,
                              icon: widget.controller.busy
                                  ? const SizedBox.square(
                                      dimension: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.arrow_forward),
                              label: const Text('Sign in'),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Subscribe and apply in Trolley Scout first. You can sign in here after an admin approves your business.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: TS.faintOf(context),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}

class _OrganizationGateScreen extends StatelessWidget {
  const _OrganizationGateScreen({
    required this.controller,
    required this.bootstrap,
  });

  final BusinessController controller;
  final BusinessBootstrap bootstrap;

  @override
  Widget build(BuildContext context) {
    final status = bootstrap.gate.applicationStatus;
    if (status == 'pending') {
      return _GateStatusScreen(
        controller: controller,
        icon: Icons.hourglass_top_rounded,
        eyebrow: 'APPLICATION RECEIVED',
        title: 'Your application is in review',
        message: bootstrap.gate.message ??
            'Your Organisation subscription and business details are waiting for admin review.',
      );
    }
    return _GateStatusScreen(
      controller: controller,
      icon: status == 'approved'
          ? Icons.credit_card_off_outlined
          : Icons.lock_outline_rounded,
      eyebrow:
          status == 'rejected' ? 'APPLICATION NOT APPROVED' : 'APPROVED ACCESS',
      title: status == 'approved'
          ? 'Reactivate your Organisation subscription'
          : 'Business access is invitation-only',
      message: bootstrap.gate.message ??
          (status == 'rejected'
              ? 'Review the admin note in the Trolley Scout consumer app before you apply again.'
              : status == 'approved'
                  ? 'Your approval is saved. An active Organisation subscription is required to open this workspace.'
                  : 'Subscribe and apply in Trolley Scout. Return here after an admin approves your business.'),
    );
  }
}

class _GateStatusScreen extends StatelessWidget {
  const _GateStatusScreen({
    required this.controller,
    required this.icon,
    required this.eyebrow,
    required this.title,
    required this.message,
  });

  final BusinessController controller;
  final IconData icon;
  final String eyebrow;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const _BusinessBrand(compact: true),
          actions: [
            IconButton(
              tooltip: 'Refresh application status',
              onPressed: controller.busy ? null : controller.restore,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: PaperCard(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 34,
                      backgroundColor: TS.yellow,
                      foregroundColor: TS.ink,
                      child: Icon(icon, size: 34),
                    ),
                    const SizedBox(height: 20),
                    Text(eyebrow, style: TS.eyebrowOf(context)),
                    const SizedBox(height: 8),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.merge(TS.display),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: TS.mutedOf(context), height: 1.5),
                    ),
                    const SizedBox(height: 22),
                    OutlinedButton.icon(
                      onPressed: controller.busy ? null : controller.restore,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Check status'),
                    ),
                    TextButton(
                      onPressed: controller.busy ? null : controller.signOut,
                      child: const Text('Sign out'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}

class _OrganizationApplicationScreen extends StatefulWidget {
  const _OrganizationApplicationScreen({
    required this.controller,
    required this.rejected,
  });

  final BusinessController controller;
  final bool rejected;

  @override
  State<_OrganizationApplicationScreen> createState() =>
      _OrganizationApplicationScreenState();
}

class _OrganizationApplicationScreenState
    extends State<_OrganizationApplicationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _tradingName = TextEditingController();
  final _contactName = TextEditingController();
  final _contactEmail = TextEditingController();
  final _contactPhone = TextEditingController();
  final _website = TextEditingController();
  final _category = TextEditingController();
  final _city = TextEditingController();
  final _province = TextEditingController();
  final _description = TextEditingController();

  @override
  void initState() {
    super.initState();
    final account = widget.controller.bootstrap?.session.account;
    _contactName.text = account?.displayName ?? '';
    _contactEmail.text = account?.email ?? '';
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _tradingName,
      _contactName,
      _contactEmail,
      _contactPhone,
      _website,
      _category,
      _city,
      _province,
      _description,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await widget.controller.submitApplication(
      BusinessOrganizationApplicationDraft(
        organisationName: _name.text,
        tradingName: _tradingName.text,
        contactName: _contactName.text,
        contactEmail: _contactEmail.text,
        contactPhone: _contactPhone.text,
        websiteUrl: _website.text,
        category: _category.text,
        city: _city.text,
        province: _province.text,
        description: _description.text,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const _BusinessBrand(compact: true),
          actions: [
            IconButton(
              tooltip: 'Sign out',
              onPressed:
                  widget.controller.busy ? null : widget.controller.signOut,
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(18),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ScreenHeader(
                      eyebrow:
                          widget.rejected ? 'UPDATE DETAILS' : 'GET STARTED',
                      title: widget.rejected
                          ? 'Apply again'
                          : 'Open a business workspace',
                      description: widget.rejected
                          ? 'Update the business information and send a new application.'
                          : 'Tell us who you are and what shoppers will find from your business.',
                    ),
                    PaperCard(
                      child: Column(
                        children: [
                          _RequiredField(
                            controller: _name,
                            label: 'Registered organization name',
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _tradingName,
                            decoration: const InputDecoration(
                              labelText: 'Trading name',
                            ),
                          ),
                          const SizedBox(height: 12),
                          _RequiredField(
                            controller: _contactName,
                            label: 'Contact name',
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _contactEmail,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: 'Contact email',
                            ),
                            validator: (value) =>
                                value == null || !value.contains('@')
                                    ? 'Enter a valid contact email.'
                                    : null,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _contactPhone,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(
                              labelText: 'Contact phone',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _website,
                            keyboardType: TextInputType.url,
                            decoration: const InputDecoration(
                              labelText: 'Website',
                              hintText: 'https://',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _category,
                            decoration: const InputDecoration(
                              labelText: 'Business category',
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  controller: _city,
                                  decoration: const InputDecoration(
                                    labelText: 'City',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: TextFormField(
                                  controller: _province,
                                  decoration: const InputDecoration(
                                    labelText: 'Province',
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _description,
                            minLines: 4,
                            maxLines: 7,
                            decoration: const InputDecoration(
                              labelText: 'What your business offers',
                              alignLabelWithHint: true,
                            ),
                            validator: (value) =>
                                value == null || value.trim().length < 20
                                    ? 'Use at least 20 characters.'
                                    : null,
                          ),
                        ],
                      ),
                    ),
                    if (widget.controller.error != null) ...[
                      const SizedBox(height: 14),
                      _MessageBanner(
                        message: widget.controller.error!,
                        error: true,
                        onClose: widget.controller.clearMessage,
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: widget.controller.busy ? null : _submit,
                      icon: const Icon(Icons.send_outlined),
                      label: Text(
                        widget.controller.busy
                            ? 'Sending application'
                            : 'Submit application',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}

enum _BusinessDestination { overview, content, create, insights, more }

class _BusinessShell extends StatefulWidget {
  const _BusinessShell({
    required this.controller,
    required this.bootstrap,
  });

  final BusinessController controller;
  final BusinessBootstrap bootstrap;

  @override
  State<_BusinessShell> createState() => _BusinessShellState();
}

class _BusinessShellState extends State<_BusinessShell> {
  _BusinessDestination _destination = _BusinessDestination.overview;
  BusinessPublication? _editing;

  void _select(_BusinessDestination destination) {
    setState(() {
      _destination = destination;
      if (destination != _BusinessDestination.create) _editing = null;
    });
  }

  void _edit(BusinessPublication publication) {
    setState(() {
      _editing = publication;
      _destination = _BusinessDestination.create;
    });
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 820;
    final content = Column(
      children: [
        if (widget.controller.busy) const LinearProgressIndicator(),
        if (widget.controller.error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: _MessageBanner(
              message: widget.controller.error!,
              error: true,
              onClose: widget.controller.clearMessage,
            ),
          ),
        if (widget.controller.notice != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: _MessageBanner(
              message: widget.controller.notice!,
              onClose: widget.controller.clearMessage,
            ),
          ),
        Expanded(child: _screen()),
      ],
    );

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: const _BusinessBrand(compact: true),
        actions: [
          if (!wide)
            IconButton(
              tooltip: 'Create publication',
              onPressed: () => _select(_BusinessDestination.create),
              icon: const Icon(Icons.add_box_outlined),
            ),
          IconButton(
            tooltip: Theme.of(context).brightness == Brightness.dark
                ? 'Use light theme'
                : 'Use dark theme',
            onPressed: () =>
                widget.controller.toggleTheme(Theme.of(context).brightness),
            icon: Icon(
              Theme.of(context).brightness == Brightness.dark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
            ),
          ),
          const SizedBox(width: 4),
        ],
        shape: Border(
          bottom: BorderSide(color: TS.lineSoftOf(context), width: 1),
        ),
      ),
      body: wide
          ? Row(
              children: [
                _BusinessRail(
                  destination: _destination,
                  organization: widget.bootstrap.gate.organization!,
                  onSelect: _select,
                ),
                VerticalDivider(width: 1, color: TS.lineSoftOf(context)),
                Expanded(child: content),
              ],
            )
          : content,
      bottomNavigationBar: wide
          ? null
          : SafeArea(
              top: false,
              minimum: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: NavigationBar(
                selectedIndex: _destination.index,
                onDestinationSelected: (index) =>
                    _select(_BusinessDestination.values[index]),
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.dashboard_outlined),
                    selectedIcon: Icon(Icons.dashboard),
                    label: 'Overview',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.description_outlined),
                    selectedIcon: Icon(Icons.description),
                    label: 'Content',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.add_circle_outline),
                    selectedIcon: Icon(Icons.add_circle),
                    label: 'Create',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.insights_outlined),
                    selectedIcon: Icon(Icons.insights),
                    label: 'Insights',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.more_horiz),
                    label: 'More',
                  ),
                ],
              ),
            ),
    );
  }

  Widget _screen() => switch (_destination) {
        _BusinessDestination.overview => _OverviewScreen(
            controller: widget.controller,
            bootstrap: widget.bootstrap,
            onCreate: () => _select(_BusinessDestination.create),
            onEdit: _edit,
            onOpenContent: () => _select(_BusinessDestination.content),
          ),
        _BusinessDestination.content => _ContentScreen(
            controller: widget.controller,
            publications: widget.bootstrap.publications,
            onCreate: () => _select(_BusinessDestination.create),
            onEdit: _edit,
          ),
        _BusinessDestination.create => _PublicationComposerScreen(
            key: ValueKey(_editing?.id ?? 'new-publication'),
            controller: widget.controller,
            bootstrap: widget.bootstrap,
            publication: _editing,
            onDone: () => _select(_BusinessDestination.content),
          ),
        _BusinessDestination.insights => _InsightsScreen(
            controller: widget.controller,
            metrics: widget.bootstrap.metrics,
          ),
        _BusinessDestination.more => _MoreScreen(
            controller: widget.controller,
            bootstrap: widget.bootstrap,
          ),
      };
}

class _BusinessRail extends StatelessWidget {
  const _BusinessRail({
    required this.destination,
    required this.organization,
    required this.onSelect,
  });

  final _BusinessDestination destination;
  final BusinessOrganization organization;
  final ValueChanged<_BusinessDestination> onSelect;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 250,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: TS.surfaceSoftOf(context),
                  borderRadius: BorderRadius.circular(TS.cardRadius),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: TS.yellow,
                      foregroundColor: TS.ink,
                      child: Text(
                        organization.name.isEmpty
                            ? 'B'
                            : organization.name[0].toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            organization.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            'Business workspace',
                            style: TextStyle(
                              color: TS.faintOf(context),
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              for (final entry in const [
                (
                  _BusinessDestination.overview,
                  Icons.dashboard_outlined,
                  'Overview'
                ),
                (
                  _BusinessDestination.content,
                  Icons.description_outlined,
                  'Content'
                ),
                (
                  _BusinessDestination.create,
                  Icons.add_circle_outline,
                  'Create'
                ),
                (
                  _BusinessDestination.insights,
                  Icons.insights_outlined,
                  'Insights'
                ),
                (
                  _BusinessDestination.more,
                  Icons.settings_outlined,
                  'Locations and account'
                ),
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: FilledButton.tonalIcon(
                    onPressed: () => onSelect(entry.$1),
                    style: FilledButton.styleFrom(
                      alignment: Alignment.centerLeft,
                      backgroundColor: destination == entry.$1
                          ? TS.yellow
                          : Colors.transparent,
                      foregroundColor:
                          destination == entry.$1 ? TS.ink : TS.inkOf(context),
                      elevation: 0,
                    ),
                    icon: Icon(entry.$2),
                    label: Text(entry.$3),
                  ),
                ),
              const Spacer(),
              Text(
                'Merchant tools',
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.faintOf(context), fontSize: 11),
              ),
            ],
          ),
        ),
      );
}

class _OverviewScreen extends StatelessWidget {
  const _OverviewScreen({
    required this.controller,
    required this.bootstrap,
    required this.onCreate,
    required this.onEdit,
    required this.onOpenContent,
  });

  final BusinessController controller;
  final BusinessBootstrap bootstrap;
  final VoidCallback onCreate;
  final ValueChanged<BusinessPublication> onEdit;
  final VoidCallback onOpenContent;

  @override
  Widget build(BuildContext context) {
    final publications = bootstrap.publications;
    final live = publications
        .where((item) => item.status == BusinessPublicationStatus.live)
        .length;
    final scheduled = publications
        .where((item) => item.status == BusinessPublicationStatus.scheduled)
        .length;
    final drafts = publications
        .where((item) => item.status == BusinessPublicationStatus.draft)
        .length;
    final attention =
        publications.where((item) => item.status.needsAttention).toList();
    final account = bootstrap.session.account!;

    return RefreshIndicator(
      onRefresh: controller.restore,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ScreenHeader(
            eyebrow: _longDate(DateTime.now()),
            title:
                '${_greeting(DateTime.now().hour)}, ${_firstName(account.displayName)}',
            description:
                'See what shoppers can find and what needs your attention.',
            action: FilledButton.icon(
              onPressed: onCreate,
              icon: const Icon(Icons.add),
              label: const Text('Create publication'),
            ),
          ),
          if (attention.isNotEmpty) ...[
            _AttentionCard(
              count: attention.length,
              message: attention.first.reviewNote ??
                  'Open the review note, update the publication, and submit again.',
              onOpen: onOpenContent,
            ),
            const SizedBox(height: 14),
          ],
          LayoutBuilder(
            builder: (context, constraints) {
              final columns = constraints.maxWidth >= 760 ? 4 : 2;
              final width =
                  (constraints.maxWidth - ((columns - 1) * 10)) / columns;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _StatusMetric(
                    width: width,
                    label: 'Live now',
                    value: '$live',
                    detail: 'Visible to shoppers',
                    color: TS.greenOf(context),
                    icon: Icons.visibility_outlined,
                  ),
                  _StatusMetric(
                    width: width,
                    label: 'Scheduled',
                    value: '$scheduled',
                    detail: 'Ready for its start time',
                    color: Colors.blue,
                    icon: Icons.event_outlined,
                  ),
                  _StatusMetric(
                    width: width,
                    label: 'Drafts',
                    value: '$drafts',
                    detail: 'Ready to finish',
                    color: TS.yellow,
                    icon: Icons.edit_outlined,
                  ),
                  _StatusMetric(
                    width: width,
                    label: 'Shopper saves',
                    value: _compactNumber(bootstrap.metrics.totals.saves),
                    detail: 'Last ${bootstrap.metrics.rangeDays} days',
                    color: TS.redOf(context),
                    icon: Icons.bookmark_outline,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 18),
          PaperCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('SHOPPER RESPONSE', style: TS.eyebrowOf(context)),
                const SizedBox(height: 5),
                Text(
                  _compactNumber(bootstrap.metrics.totals.impressions),
                  style: Theme.of(context)
                      .textTheme
                      .displaySmall
                      ?.merge(TS.display),
                ),
                Text(
                  'Publication views in the last ${bootstrap.metrics.rangeDays} days',
                  style: TextStyle(color: TS.mutedOf(context)),
                ),
                const SizedBox(height: 18),
                _MetricProgress(
                  label: 'Opened',
                  value: bootstrap.metrics.totals.opens,
                  total: bootstrap.metrics.totals.impressions,
                ),
                _MetricProgress(
                  label: 'Saved',
                  value: bootstrap.metrics.totals.saves,
                  total: bootstrap.metrics.totals.impressions,
                ),
                _MetricProgress(
                  label: 'Visited your link',
                  value: bootstrap.metrics.totals.outboundVisits,
                  total: bootstrap.metrics.totals.impressions,
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Recent publications',
                  style:
                      Theme.of(context).textTheme.titleLarge?.merge(TS.display),
                ),
              ),
              TextButton(
                onPressed: onOpenContent,
                child: const Text('View all'),
              ),
            ],
          ),
          if (publications.isEmpty)
            EmptyCard(
              icon: Icons.campaign_outlined,
              message:
                  'Create your first publication and show shoppers what is available.',
              action: FilledButton(
                onPressed: onCreate,
                child: const Text('Create publication'),
              ),
            )
          else
            for (final publication in publications.take(4))
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _PublicationCard(
                  publication: publication,
                  onEdit: () => onEdit(publication),
                ),
              ),
        ],
      ),
    );
  }
}

class _ContentScreen extends StatefulWidget {
  const _ContentScreen({
    required this.controller,
    required this.publications,
    required this.onCreate,
    required this.onEdit,
  });

  final BusinessController controller;
  final List<BusinessPublication> publications;
  final VoidCallback onCreate;
  final ValueChanged<BusinessPublication> onEdit;

  @override
  State<_ContentScreen> createState() => _ContentScreenState();
}

class _ContentScreenState extends State<_ContentScreen> {
  final _query = TextEditingController();
  String _filter = 'all';

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _action(
    BusinessPublication publication,
    String operation,
  ) async {
    if (operation == 'archive') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Archive publication?'),
          content: Text(
            '“${publication.title}” will leave shopper feeds.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Archive'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    await widget.controller.changePublication(publication, operation);
  }

  @override
  Widget build(BuildContext context) {
    final query = _query.text.trim().toLowerCase();
    final filtered = widget.publications.where((publication) {
      final matchesQuery = query.isEmpty ||
          publication.title.toLowerCase().contains(query) ||
          publication.bodyText.toLowerCase().contains(query);
      final matchesFilter = switch (_filter) {
        'attention' => publication.status.needsAttention,
        'draft' => publication.status == BusinessPublicationStatus.draft,
        'submitted' =>
          publication.status == BusinessPublicationStatus.submitted,
        'scheduled' =>
          publication.status == BusinessPublicationStatus.scheduled,
        'live' => publication.status == BusinessPublicationStatus.live,
        'finished' => publication.status == BusinessPublicationStatus.expired ||
            publication.status == BusinessPublicationStatus.archived,
        _ => true,
      };
      return matchesQuery && matchesFilter;
    }).toList();

    return RefreshIndicator(
      onRefresh: widget.controller.restore,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ScreenHeader(
            eyebrow: 'PUBLISHING WORKSPACE',
            title: 'Content',
            description:
                'Manage every deal, special, promotion, and Window Shopping post.',
            action: FilledButton.icon(
              onPressed: widget.onCreate,
              icon: const Icon(Icons.add),
              label: const Text('Create'),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final filter in const [
                  ('all', 'All'),
                  ('attention', 'Action needed'),
                  ('draft', 'Drafts'),
                  ('submitted', 'In review'),
                  ('scheduled', 'Scheduled'),
                  ('live', 'Live'),
                  ('finished', 'Finished'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(filter.$2),
                      selected: _filter == filter.$1,
                      onSelected: (_) => setState(() => _filter = filter.$1),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _query,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Search content',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _query.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      onPressed: () {
                        _query.clear();
                        setState(() {});
                      },
                      icon: const Icon(Icons.close),
                    ),
            ),
          ),
          const SizedBox(height: 16),
          if (filtered.isEmpty)
            EmptyCard(
              icon: Icons.filter_alt_off_outlined,
              message: widget.publications.isEmpty
                  ? 'No publications yet.'
                  : 'No publications match this view.',
              action: widget.publications.isEmpty
                  ? FilledButton(
                      onPressed: widget.onCreate,
                      child: const Text('Create publication'),
                    )
                  : null,
            )
          else
            for (final publication in filtered)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _PublicationCard(
                  publication: publication,
                  onEdit: () => widget.onEdit(publication),
                  actionItems: _publicationActions(publication),
                  onAction: widget.controller.busy
                      ? null
                      : (operation) => _action(publication, operation),
                ),
              ),
        ],
      ),
    );
  }
}

class _PublicationComposerScreen extends StatefulWidget {
  const _PublicationComposerScreen({
    super.key,
    required this.controller,
    required this.bootstrap,
    required this.onDone,
    this.publication,
  });

  final BusinessController controller;
  final BusinessBootstrap bootstrap;
  final VoidCallback onDone;
  final BusinessPublication? publication;

  @override
  State<_PublicationComposerScreen> createState() =>
      _PublicationComposerScreenState();
}

class _PublicationComposerScreenState
    extends State<_PublicationComposerScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _title =
      TextEditingController(text: widget.publication?.title ?? '');
  late final _body =
      TextEditingController(text: widget.publication?.bodyText ?? '');
  late final _target =
      TextEditingController(text: widget.publication?.targetUrl ?? '');
  late final _imageUrl =
      TextEditingController(text: widget.publication?.imageUrl ?? '');
  late final _imageAlt =
      TextEditingController(text: widget.publication?.imageAlt ?? '');
  late final _price = TextEditingController(
    text: _moneyInput(widget.publication?.priceCents),
  );
  late final _previousPrice = TextEditingController(
    text: _moneyInput(widget.publication?.previousPriceCents),
  );
  late final _offer =
      TextEditingController(text: widget.publication?.offerText ?? '');
  late final _coupon =
      TextEditingController(text: widget.publication?.couponCode ?? '');
  late BusinessPublicationKind _kind =
      widget.publication?.kind ?? BusinessPublicationKind.deal;
  late BusinessPublicationPlacement _placement =
      widget.publication?.placement ?? BusinessPublicationPlacement.marketplace;
  late final Set<String> _locationIds = {...?widget.publication?.locationIds};
  late DateTime? _startsAt = _parseDate(widget.publication?.startsAt);
  late DateTime? _endsAt = _parseDate(widget.publication?.endsAt);
  String? _pickedPath;

  @override
  void dispose() {
    for (final controller in [
      _title,
      _body,
      _target,
      _imageUrl,
      _imageAlt,
      _price,
      _previousPrice,
      _offer,
      _coupon,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _pickImage() async {
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 88,
      maxWidth: 1800,
    );
    if (image != null && mounted) {
      setState(() => _pickedPath = image.path);
    }
  }

  Future<void> _pickDate({required bool start}) async {
    final current = (start ? _startsAt : _endsAt) ?? DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (time == null || !mounted) return;
    final value = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    setState(() {
      if (start) {
        _startsAt = value;
      } else {
        _endsAt = value;
      }
    });
  }

  Future<void> _save(bool submit) async {
    if (!_formKey.currentState!.validate()) return;
    if (_kind != BusinessPublicationKind.post &&
        _pickedPath == null &&
        _imageUrl.text.trim().isEmpty &&
        submit) {
      _showIssue('Add a cover image before submitting.');
      return;
    }
    if (_kind != BusinessPublicationKind.post &&
        _imageAlt.text.trim().isEmpty &&
        submit) {
      _showIssue('Describe the cover image before submitting.');
      return;
    }

    if (_pickedPath != null) {
      final uploaded = await widget.controller.uploadImage(
        _pickedPath!,
        altText: _imageAlt.text,
      );
      if (uploaded == null || !mounted) return;
      _imageUrl.text = uploaded.url;
    }

    final draft = BusinessPublicationDraft(
      kind: _kind,
      placement: _kind == BusinessPublicationKind.post
          ? BusinessPublicationPlacement.window
          : _placement,
      title: _title.text,
      bodyText: _body.text,
      targetUrl: _target.text,
      imageUrl: _imageUrl.text,
      imageAlt: _imageAlt.text,
      priceCents: _cents(_price.text),
      previousPriceCents: _cents(_previousPrice.text),
      offerText: _offer.text,
      couponCode: _coupon.text,
      startsAt: _startsAt?.toUtc().toIso8601String(),
      endsAt: _endsAt?.toUtc().toIso8601String(),
      locationIds: _locationIds.toList(),
    );
    final saved = await widget.controller.savePublication(
      draft,
      publicationId: widget.publication?.id,
      submit: submit,
    );
    if (saved != null && mounted) widget.onDone();
  }

  void _showIssue(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) => Form(
        key: _formKey,
        child: ListView(
          key: const ValueKey('business-composer-scroll'),
          padding: const EdgeInsets.all(16),
          children: [
            ScreenHeader(
              eyebrow: widget.publication == null
                  ? 'NEW PUBLICATION'
                  : 'EDIT CONTENT',
              title: widget.publication == null
                  ? 'Create publication'
                  : 'Edit publication',
              description:
                  'Build the business post and check how shoppers will see it.',
            ),
            _ComposerSection(
              number: 1,
              title: 'What are you publishing?',
              description:
                  'The type sets the shopper card and required details.',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final kind in BusinessPublicationKind.values)
                    ChoiceChip(
                      label: Text(kind.label),
                      selected: _kind == kind,
                      onSelected: (_) => setState(() {
                        _kind = kind;
                        if (kind == BusinessPublicationKind.post) {
                          _placement = BusinessPublicationPlacement.window;
                        }
                      }),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _ComposerSection(
              number: 2,
              title: 'Story and image',
              description:
                  'Lead with the shopper benefit and use a clear product photo.',
              child: Column(
                children: [
                  TextFormField(
                    controller: _title,
                    maxLength: 120,
                    decoration: const InputDecoration(
                      labelText: 'Title',
                      hintText: 'Weekend potato deal',
                    ),
                    onChanged: (_) => setState(() {}),
                    validator: (value) =>
                        value == null || value.trim().length < 3
                            ? 'Enter a title.'
                            : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _body,
                    minLines: 4,
                    maxLines: 8,
                    maxLength: 1600,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      alignLabelWithHint: true,
                    ),
                    onChanged: (_) => setState(() {}),
                    validator: (value) =>
                        value == null || value.trim().length < 10
                            ? 'Use at least 10 characters.'
                            : null,
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: widget.controller.busy ? null : _pickImage,
                    icon: const Icon(Icons.photo_library_outlined),
                    label: Text(
                      _pickedPath == null
                          ? 'Choose cover image'
                          : 'Choose another image',
                    ),
                  ),
                  if (_pickedPath != null) ...[
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(TS.cardRadius),
                      child: Image.file(
                        File(_pickedPath!),
                        height: 180,
                        width: double.infinity,
                        fit: BoxFit.cover,
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _imageUrl,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'Cover image link',
                      hintText: 'https://',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _imageAlt,
                    decoration: const InputDecoration(
                      labelText: 'Image description',
                      hintText: 'A bag of fresh potatoes',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _ComposerSection(
              number: 3,
              title: 'Offer details',
              description:
                  'Use exact prices and terms so the shopper card stays trustworthy.',
              child: Column(
                children: [
                  if (_kind == BusinessPublicationKind.deal ||
                      _kind == BusinessPublicationKind.special)
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _price,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: const InputDecoration(
                              labelText: 'Current price',
                              prefixText: 'R ',
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _previousPrice,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: const InputDecoration(
                              labelText: 'Previous price',
                              prefixText: 'R ',
                            ),
                          ),
                        ),
                      ],
                    ),
                  if (_kind == BusinessPublicationKind.deal ||
                      _kind == BusinessPublicationKind.special)
                    const SizedBox(height: 10),
                  TextFormField(
                    controller: _offer,
                    decoration: const InputDecoration(
                      labelText: 'Offer label',
                      hintText: 'Save R100',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _coupon,
                    decoration: const InputDecoration(
                      labelText: 'Coupon code',
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _target,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'Destination link',
                      hintText: 'https://',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _ComposerSection(
              number: 4,
              title: 'Placement and timing',
              description:
                  'Choose the shopper surface, locations, and publication window.',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Where should this appear?',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<BusinessPublicationPlacement>(
                    segments: [
                      for (final placement
                          in BusinessPublicationPlacement.values)
                        ButtonSegment(
                          value: placement,
                          label: Text(
                            placement == BusinessPublicationPlacement.window
                                ? 'Window'
                                : placement.label,
                          ),
                        ),
                    ],
                    selected: {_placement},
                    onSelectionChanged: _kind == BusinessPublicationKind.post
                        ? null
                        : (value) => setState(() => _placement = value.first),
                  ),
                  if (widget.bootstrap.locations.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(
                      'Locations',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    Text(
                      'No selection means every active location.',
                      style: TextStyle(
                        color: TS.faintOf(context),
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final location in widget.bootstrap.locations)
                          FilterChip(
                            label: Text(location.name),
                            selected: _locationIds.contains(location.id),
                            onSelected: (selected) => setState(() {
                              if (selected) {
                                _locationIds.add(location.id);
                              } else {
                                _locationIds.remove(location.id);
                              }
                            }),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _pickDate(start: true),
                          icon: const Icon(Icons.play_circle_outline),
                          label: Text(
                            _startsAt == null
                                ? 'Set start'
                                : _shortDateTime(_startsAt!),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _pickDate(start: false),
                          icon: const Icon(Icons.event_busy_outlined),
                          label: Text(
                            _endsAt == null
                                ? 'Set end'
                                : _shortDateTime(_endsAt!),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _ConsumerPreview(
              kind: _kind,
              placement: _placement,
              title: _title.text,
              body: _body.text,
              imageUrl: _imageUrl.text,
              pickedPath: _pickedPath,
              offer: _offer.text,
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    key: const ValueKey('business-save-draft'),
                    onPressed:
                        widget.controller.busy ? null : () => _save(false),
                    child: const Text('Save draft'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    key: const ValueKey('business-submit-review'),
                    onPressed:
                        widget.controller.busy ? null : () => _save(true),
                    child: const Text('Submit for review'),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
}

class _InsightsScreen extends StatefulWidget {
  const _InsightsScreen({
    required this.controller,
    required this.metrics,
  });

  final BusinessController controller;
  final BusinessMetrics metrics;

  @override
  State<_InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends State<_InsightsScreen> {
  late int _days = widget.metrics.rangeDays;

  @override
  Widget build(BuildContext context) {
    final totals = widget.metrics.totals;
    return RefreshIndicator(
      onRefresh: () async {
        await widget.controller.loadMetrics(_days);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const ScreenHeader(
            eyebrow: 'SHOPPER ACTIVITY',
            title: 'Insights',
            description:
                'Anonymous totals show how shoppers respond to your publications.',
          ),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 7, label: Text('7 days')),
              ButtonSegment(value: 30, label: Text('30 days')),
              ButtonSegment(value: 90, label: Text('90 days')),
            ],
            selected: {_days},
            onSelectionChanged: widget.controller.busy
                ? null
                : (value) async {
                    setState(() => _days = value.first);
                    await widget.controller.loadMetrics(value.first);
                  },
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final width = (constraints.maxWidth - 10) / 2;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _InsightCard(
                    width: width,
                    icon: Icons.visibility_outlined,
                    label: 'Impressions',
                    value: _compactNumber(totals.impressions),
                  ),
                  _InsightCard(
                    width: width,
                    icon: Icons.touch_app_outlined,
                    label: 'Opened',
                    value: _compactNumber(totals.opens),
                  ),
                  _InsightCard(
                    width: width,
                    icon: Icons.bookmark_outline,
                    label: 'Saved',
                    value: _compactNumber(totals.saves),
                  ),
                  _InsightCard(
                    width: width,
                    icon: Icons.open_in_new,
                    label: 'Link visits',
                    value: _compactNumber(totals.outboundVisits),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          PaperCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Response rates',
                  style:
                      Theme.of(context).textTheme.titleLarge?.merge(TS.display),
                ),
                const SizedBox(height: 16),
                _MetricProgress(
                  label: 'Open rate',
                  value: totals.opens,
                  total: totals.impressions,
                ),
                _MetricProgress(
                  label: 'Save rate',
                  value: totals.saves,
                  total: totals.impressions,
                ),
                _MetricProgress(
                  label: 'Link visit rate',
                  value: totals.outboundVisits,
                  total: totals.impressions,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          PaperCard(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.shield_outlined, color: TS.greenOf(context)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'These totals contain no shopper names, email addresses, or device identifiers.',
                    style: TextStyle(color: TS.mutedOf(context), height: 1.4),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MoreScreen extends StatelessWidget {
  const _MoreScreen({
    required this.controller,
    required this.bootstrap,
  });

  final BusinessController controller;
  final BusinessBootstrap bootstrap;

  Future<void> _locationForm(
    BuildContext context, {
    BusinessLocation? location,
  }) async {
    final name = TextEditingController(text: location?.name ?? '');
    final address = TextEditingController(text: location?.addressLine ?? '');
    final city = TextEditingController(text: location?.city ?? '');
    final province = TextEditingController(text: location?.province ?? '');
    final website = TextEditingController(text: location?.websiteUrl ?? '');
    final formKey = GlobalKey<FormState>();

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.fromLTRB(
          18,
          18,
          18,
          MediaQuery.viewInsetsOf(sheetContext).bottom + 18,
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    location == null ? 'Add location' : 'Edit location',
                    style: Theme.of(sheetContext)
                        .textTheme
                        .headlineSmall
                        ?.merge(TS.display),
                  ),
                  const SizedBox(height: 16),
                  _RequiredField(controller: name, label: 'Location name'),
                  const SizedBox(height: 10),
                  _RequiredField(controller: address, label: 'Street address'),
                  const SizedBox(height: 10),
                  _RequiredField(controller: city, label: 'City'),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: province,
                    decoration: const InputDecoration(labelText: 'Province'),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: website,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'Location website',
                      hintText: 'https://',
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: controller.busy
                        ? null
                        : () async {
                            if (!formKey.currentState!.validate()) return;
                            final saved = await controller.saveLocation(
                              BusinessLocationDraft(
                                name: name.text,
                                addressLine: address.text,
                                city: city.text,
                                province: province.text,
                                websiteUrl: website.text,
                              ),
                              locationId: location?.id,
                            );
                            if (saved && sheetContext.mounted) {
                              Navigator.pop(sheetContext);
                            }
                          },
                    child: Text(
                      location == null ? 'Add location' : 'Save location',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    name.dispose();
    address.dispose();
    city.dispose();
    province.dispose();
    website.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final account = bootstrap.session.account!;
    final organization = bootstrap.gate.organization!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ScreenHeader(
          eyebrow: 'BUSINESS SETTINGS',
          title: 'Locations and account',
          description:
              'Keep store details current and control this app session.',
          action: FilledButton.icon(
            onPressed: () => _locationForm(context),
            icon: const Icon(Icons.add_location_alt_outlined),
            label: const Text('Add location'),
          ),
        ),
        Text(
          'Locations',
          style: Theme.of(context).textTheme.titleLarge?.merge(TS.display),
        ),
        const SizedBox(height: 10),
        if (bootstrap.locations.isEmpty)
          EmptyCard(
            icon: Icons.store_mall_directory_outlined,
            message:
                'Add a location so publications can target a store or service area.',
            action: FilledButton(
              onPressed: () => _locationForm(context),
              child: const Text('Add location'),
            ),
          )
        else
          for (final location in bootstrap.locations)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: PaperCard(
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: TS.surfaceSoftOf(context),
                      foregroundColor: TS.inkOf(context),
                      child: const Icon(Icons.storefront_outlined),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            location.name,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            '${location.addressLine}, ${location.city}',
                            style: TextStyle(
                              color: TS.mutedOf(context),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Edit ${location.name}',
                      onPressed: () =>
                          _locationForm(context, location: location),
                      icon: const Icon(Icons.edit_outlined),
                    ),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 20),
        Text(
          'Account',
          style: Theme.of(context).textTheme.titleLarge?.merge(TS.display),
        ),
        const SizedBox(height: 10),
        PaperCard(
          child: Column(
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  backgroundColor: TS.yellow,
                  foregroundColor: TS.ink,
                  child: Text(
                    account.initials,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                title: Text(account.displayName),
                subtitle: Text(account.email),
              ),
              const Divider(),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.business_outlined),
                title: Text(organization.name),
                subtitle: const Text('Organization owner'),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Theme.of(context).brightness == Brightness.dark
                      ? Icons.light_mode_outlined
                      : Icons.dark_mode_outlined,
                ),
                title: Text(
                  Theme.of(context).brightness == Brightness.dark
                      ? 'Use light theme'
                      : 'Use dark theme',
                ),
                onTap: () =>
                    controller.toggleTheme(Theme.of(context).brightness),
              ),
              const Divider(),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.logout, color: TS.redOf(context)),
                title: Text(
                  'Sign out',
                  style: TextStyle(color: TS.redOf(context)),
                ),
                onTap: controller.busy
                    ? null
                    : () async {
                        final confirmed = await showDialog<bool>(
                          context: context,
                          builder: (context) => AlertDialog(
                            title: const Text('Sign out?'),
                            content: const Text(
                              'This removes the business session from this device.',
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context, false),
                                child: const Text('Cancel'),
                              ),
                              FilledButton(
                                onPressed: () => Navigator.pop(context, true),
                                child: const Text('Sign out'),
                              ),
                            ],
                          ),
                        );
                        if (confirmed == true) await controller.signOut();
                      },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _BusinessBrand extends StatelessWidget {
  const _BusinessBrand({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedScoutMark.business(
            motion: ScoutMarkMotion.scout,
            size: compact ? 36 : 46,
          ),
          const SizedBox(width: 9),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'TROLLEY SCOUT',
                style: TextStyle(
                  color: TS.inkOf(context),
                  fontWeight: FontWeight.w900,
                  fontSize: compact ? 13 : 16,
                  letterSpacing: 0.5,
                ),
              ),
              Text(
                'FOR BUSINESS',
                style: TextStyle(
                  color: TS.redOf(context),
                  fontWeight: FontWeight.w900,
                  fontSize: compact ? 9 : 11,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
        ],
      );
}

class _AttentionCard extends StatelessWidget {
  const _AttentionCard({
    required this.count,
    required this.message,
    required this.onOpen,
  });

  final int count;
  final String message;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Color.lerp(
            TS.surfaceOf(context),
            TS.redOf(context),
            0.12,
          ),
          border: Border.all(color: TS.redOf(context), width: 2),
          borderRadius: BorderRadius.circular(TS.cardRadius),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.error, color: TS.redOf(context)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '$count ${count == 1 ? 'publication needs' : 'publications need'} attention',
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(message, style: TextStyle(color: TS.mutedOf(context))),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: onOpen,
              child: const Text('Review content'),
            ),
          ],
        ),
      );
}

class _StatusMetric extends StatelessWidget {
  const _StatusMetric({
    required this.width,
    required this.label,
    required this.value,
    required this.detail,
    required this.color,
    required this.icon,
  });

  final double width;
  final String label;
  final String value;
  final String detail;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: TS.card(context, border: color),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, color: color, size: 20),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                value,
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.merge(TS.display),
              ),
              Text(
                detail,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: TS.faintOf(context), fontSize: 11),
              ),
            ],
          ),
        ),
      );
}

class _PublicationCard extends StatelessWidget {
  const _PublicationCard({
    required this.publication,
    required this.onEdit,
    this.actionItems = const [],
    this.onAction,
  });

  final BusinessPublication publication;
  final VoidCallback onEdit;
  final List<(String, String, IconData)> actionItems;
  final ValueChanged<String>? onAction;

  @override
  Widget build(BuildContext context) => PaperCard(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: 62,
                height: 62,
                color: TS.surfaceSoftOf(context),
                child: publication.imageUrl == null
                    ? Icon(
                        Icons.image_outlined,
                        color: TS.faintOf(context),
                      )
                    : Image.network(
                        publication.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Icon(
                          Icons.broken_image_outlined,
                          color: TS.faintOf(context),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    publication.kind.label.toUpperCase(),
                    style: TS.eyebrowOf(context).copyWith(fontSize: 10),
                  ),
                  Text(
                    publication.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 5),
                  Wrap(
                    spacing: 6,
                    runSpacing: 5,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      _StatusBadge(status: publication.status),
                      Text(
                        publication.placement.label,
                        style: TextStyle(
                          color: TS.faintOf(context),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (actionItems.isEmpty)
              IconButton(
                tooltip: 'Edit ${publication.title}',
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined),
              )
            else
              PopupMenuButton<String>(
                tooltip: 'Actions for ${publication.title}',
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'edit',
                    child: ListTile(
                      leading: Icon(Icons.edit_outlined),
                      title: Text('Edit'),
                    ),
                  ),
                  for (final action in actionItems)
                    PopupMenuItem(
                      value: action.$1,
                      child: ListTile(
                        leading: Icon(action.$3),
                        title: Text(action.$2),
                      ),
                    ),
                ],
                onSelected: (value) {
                  if (value == 'edit') {
                    onEdit();
                  } else {
                    onAction?.call(value);
                  }
                },
              ),
          ],
        ),
      );
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final BusinessPublicationStatus status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      BusinessPublicationStatus.live => TS.greenOf(context),
      BusinessPublicationStatus.scheduled => Colors.blue,
      BusinessPublicationStatus.changesRequested ||
      BusinessPublicationStatus.rejected =>
        TS.redOf(context),
      BusinessPublicationStatus.submitted => Colors.orange,
      _ => TS.mutedOf(context),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _ComposerSection extends StatelessWidget {
  const _ComposerSection({
    required this.number,
    required this.title,
    required this.description,
    required this.child,
  });

  final int number;
  final String title;
  final String description;
  final Widget child;

  @override
  Widget build(BuildContext context) => PaperCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: TS.yellow,
                  foregroundColor: TS.ink,
                  child: Text(
                    '$number',
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.merge(TS.display),
                      ),
                      Text(
                        description,
                        style: TextStyle(
                          color: TS.mutedOf(context),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            child,
          ],
        ),
      );
}

class _ConsumerPreview extends StatelessWidget {
  const _ConsumerPreview({
    required this.kind,
    required this.placement,
    required this.title,
    required this.body,
    required this.imageUrl,
    required this.offer,
    this.pickedPath,
  });

  final BusinessPublicationKind kind;
  final BusinessPublicationPlacement placement;
  final String title;
  final String body;
  final String imageUrl;
  final String offer;
  final String? pickedPath;

  @override
  Widget build(BuildContext context) => PaperCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.visibility_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Consumer preview',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.merge(TS.display),
                  ),
                ),
                Text(
                  placement.label,
                  style: TextStyle(color: TS.faintOf(context), fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(TS.cardRadius),
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: TS.lineOf(context), width: 2),
                  borderRadius: BorderRadius.circular(TS.cardRadius),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SizedBox(
                      height: 190,
                      child: pickedPath != null
                          ? Image.file(File(pickedPath!), fit: BoxFit.cover)
                          : imageUrl.trim().isNotEmpty
                              ? Image.network(
                                  imageUrl.trim(),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) =>
                                      const _PreviewPlaceholder(),
                                )
                              : const _PreviewPlaceholder(),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            kind.label.toUpperCase(),
                            style: TS.eyebrowOf(context),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            title.trim().isEmpty
                                ? 'Your publication title'
                                : title.trim(),
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.merge(TS.display),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            body.trim().isEmpty
                                ? 'Your description will appear here.'
                                : body.trim(),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: TS.mutedOf(context)),
                          ),
                          if (offer.trim().isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Text(
                              offer.trim(),
                              style: TextStyle(
                                color: TS.greenOf(context),
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed: () {},
                            child: const Text('View offer'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
}

class _PreviewPlaceholder extends StatelessWidget {
  const _PreviewPlaceholder();

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: TS.surfaceSoftOf(context),
        child: Center(
          child: Icon(
            Icons.add_photo_alternate_outlined,
            size: 42,
            color: TS.faintOf(context),
          ),
        ),
      );
}

class _MetricProgress extends StatelessWidget {
  const _MetricProgress({
    required this.label,
    required this.value,
    required this.total,
  });

  final String label;
  final int value;
  final int total;

  @override
  Widget build(BuildContext context) {
    final rate = total <= 0 ? 0.0 : (value / total).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(label)),
              Text(
                '${_compactNumber(value)}  ${(rate * 100).toStringAsFixed(1)}%',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ],
          ),
          const SizedBox(height: 6),
          LinearProgressIndicator(
            minHeight: 8,
            borderRadius: BorderRadius.circular(999),
            value: rate,
          ),
        ],
      ),
    );
  }
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({
    required this.width,
    required this.icon,
    required this.label,
    required this.value,
  });

  final double width;
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: PaperCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: TS.redOf(context)),
              const SizedBox(height: 10),
              Text(
                value,
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.merge(TS.display),
              ),
              Text(label, style: TextStyle(color: TS.mutedOf(context))),
            ],
          ),
        ),
      );
}

class _MessageBanner extends StatelessWidget {
  const _MessageBanner({
    required this.message,
    required this.onClose,
    this.error = false,
  });

  final String message;
  final VoidCallback onClose;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error ? TS.redOf(context) : TS.greenOf(context);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(TS.controlRadius),
        ),
        child: Row(
          children: [
            Icon(
              error ? Icons.error_outline : Icons.check_circle_outline,
              color: color,
            ),
            const SizedBox(width: 9),
            Expanded(child: Text(message)),
            IconButton(
              tooltip: 'Dismiss message',
              onPressed: onClose,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ),
    );
  }
}

class _RequiredField extends StatelessWidget {
  const _RequiredField({
    required this.controller,
    required this.label,
  });

  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) => TextFormField(
        controller: controller,
        decoration: InputDecoration(labelText: label),
        validator: (value) =>
            value == null || value.trim().length < 2 ? 'Enter $label.' : null,
      );
}

List<(String, String, IconData)> _publicationActions(
  BusinessPublication publication,
) {
  final actions = <(String, String, IconData)>[];
  if (publication.status == BusinessPublicationStatus.draft ||
      publication.status == BusinessPublicationStatus.changesRequested) {
    actions.add(('submit', 'Submit for review', Icons.send_outlined));
  }
  if (publication.status == BusinessPublicationStatus.live ||
      publication.status == BusinessPublicationStatus.scheduled) {
    actions.add(('pause', 'Pause', Icons.pause_outlined));
  }
  if (publication.status == BusinessPublicationStatus.paused) {
    actions.add(('resume', 'Resume', Icons.play_arrow_outlined));
  }
  if (publication.status == BusinessPublicationStatus.live) {
    actions.add(('sold_out', 'Mark sold out', Icons.remove_shopping_cart));
  }
  if (publication.status != BusinessPublicationStatus.archived) {
    actions.add(('archive', 'Archive', Icons.archive_outlined));
  }
  return actions;
}

String _greeting(int hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

String _firstName(String displayName) {
  final parts = displayName.trim().split(RegExp(r'\s+'));
  return parts.isEmpty || parts.first.isEmpty ? 'there' : parts.first;
}

String _longDate(DateTime date) {
  const weekdays = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return '${weekdays[date.weekday - 1]}, ${date.day} ${months[date.month - 1]} ${date.year}';
}

String _compactNumber(int value) {
  if (value >= 1000000) {
    return '${(value / 1000000).toStringAsFixed(value >= 10000000 ? 0 : 1)}M';
  }
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(value >= 10000 ? 0 : 1)}K';
  }
  return '$value';
}

String _shortDateTime(DateTime value) {
  final hour = value.hour.toString().padLeft(2, '0');
  final minute = value.minute.toString().padLeft(2, '0');
  return '${value.day}/${value.month} $hour:$minute';
}

DateTime? _parseDate(String? value) =>
    value == null ? null : DateTime.tryParse(value)?.toLocal();

String _moneyInput(int? cents) =>
    cents == null ? '' : (cents / 100).toStringAsFixed(2);

int? _cents(String value) {
  final amount = double.tryParse(value.trim());
  return amount == null ? null : (amount * 100).round();
}
