import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/scout_mark.dart';
import 'business_controller.dart';
import 'business_models.dart';

enum _AdminDestination {
  overview,
  businesses,
  moderation,
  campaigns,
  payments,
}

class BusinessAdminShell extends StatefulWidget {
  const BusinessAdminShell({
    super.key,
    required this.bootstrap,
    required this.controller,
  });

  final BusinessBootstrap bootstrap;
  final BusinessController controller;

  @override
  State<BusinessAdminShell> createState() => _BusinessAdminShellState();
}

class _BusinessAdminShellState extends State<BusinessAdminShell> {
  late _AdminDestination _destination;

  @override
  void initState() {
    super.initState();
    _destination = switch (Uri.base.queryParameters['admin']) {
      'businesses' => _AdminDestination.businesses,
      'moderation' => _AdminDestination.moderation,
      'campaigns' => _AdminDestination.campaigns,
      'payments' => _AdminDestination.payments,
      _ => _AdminDestination.overview,
    };
  }

  void _select(_AdminDestination destination) {
    setState(() => _destination = destination);
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 920;
    final overview = widget.controller.adminOverview;
    final content = Column(
      children: [
        if (widget.controller.busy) const LinearProgressIndicator(),
        if (widget.controller.error != null)
          _AdminMessage(
            error: true,
            message: widget.controller.error!,
            onClose: widget.controller.clearMessage,
          ),
        if (widget.controller.notice != null)
          _AdminMessage(
            message: widget.controller.notice!,
            onClose: widget.controller.clearMessage,
          ),
        Expanded(
          child: overview == null
              ? _AdminUnavailable(controller: widget.controller)
              : _screen(overview),
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: const _AdminBrand(),
        actions: [
          IconButton(
            tooltip: 'Refresh business reporting',
            onPressed: widget.controller.busy
                ? null
                : widget.controller.refreshAdminOverview,
            icon: const Icon(Icons.refresh_outlined),
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
          PopupMenuButton<String>(
            tooltip: 'Admin account',
            icon: CircleAvatar(
              radius: 16,
              backgroundColor: TS.yellow,
              foregroundColor: TS.ink,
              child: Text(
                widget.bootstrap.session.account?.initials ?? 'A',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            onSelected: (value) {
              if (value == 'sign_out') {
                _confirmSignOut();
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: 'sign_out',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.logout),
                  title: Text('Sign out'),
                ),
              ),
            ],
          ),
          const SizedBox(width: 6),
        ],
        shape: Border(
          bottom: BorderSide(color: TS.lineSoftOf(context), width: 1),
        ),
      ),
      body: wide
          ? Row(
              children: [
                _AdminRail(
                  destination: _destination,
                  onSelect: _select,
                  accountEmail:
                      widget.bootstrap.session.account?.email ?? 'Admin',
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
                    _select(_AdminDestination.values[index]),
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.space_dashboard_outlined),
                    selectedIcon: Icon(Icons.space_dashboard),
                    label: 'Overview',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.storefront_outlined),
                    selectedIcon: Icon(Icons.storefront),
                    label: 'Businesses',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.verified_user_outlined),
                    selectedIcon: Icon(Icons.verified_user),
                    label: 'Review',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.campaign_outlined),
                    selectedIcon: Icon(Icons.campaign),
                    label: 'Campaigns',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.payments_outlined),
                    selectedIcon: Icon(Icons.payments),
                    label: 'Payments',
                  ),
                ],
              ),
            ),
    );
  }

  Widget _screen(BusinessAdminOverview overview) => switch (_destination) {
        _AdminDestination.overview => _AdminOverviewScreen(
            controller: widget.controller,
            overview: overview,
            onSelect: _select,
          ),
        _AdminDestination.businesses => _AdminBusinessesScreen(
            controller: widget.controller,
            overview: overview,
          ),
        _AdminDestination.moderation => _AdminModerationScreen(
            controller: widget.controller,
            overview: overview,
          ),
        _AdminDestination.campaigns =>
          _AdminCampaignsScreen(overview: overview),
        _AdminDestination.payments => _AdminPaymentsScreen(overview: overview),
      };

  Future<void> _confirmSignOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'This removes the business admin session from this device.',
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
    if (confirmed == true) await widget.controller.signOut();
  }
}

class _AdminBrand extends StatelessWidget {
  const _AdminBrand();

  @override
  Widget build(BuildContext context) => const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedScoutMark.business(
            motion: ScoutMarkMotion.scout,
            size: 38,
          ),
          SizedBox(width: 9),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'TROLLEY SCOUT',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .3,
                ),
              ),
              Text(
                'BUSINESS ADMIN',
                style: TextStyle(
                  color: TS.red,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
            ],
          ),
        ],
      );
}

class _AdminRail extends StatelessWidget {
  const _AdminRail({
    required this.destination,
    required this.onSelect,
    required this.accountEmail,
  });

  final _AdminDestination destination;
  final ValueChanged<_AdminDestination> onSelect;
  final String accountEmail;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 260,
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
                  border: Border.all(color: TS.lineSoftOf(context)),
                ),
                child: Row(
                  children: [
                    const CircleAvatar(
                      backgroundColor: TS.yellow,
                      foregroundColor: TS.ink,
                      child: Icon(Icons.admin_panel_settings),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Platform control',
                            style: TextStyle(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            'Admin workspace',
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
                  _AdminDestination.overview,
                  Icons.space_dashboard_outlined,
                  'Admin overview'
                ),
                (
                  _AdminDestination.businesses,
                  Icons.storefront_outlined,
                  'Businesses'
                ),
                (
                  _AdminDestination.moderation,
                  Icons.verified_user_outlined,
                  'Moderation'
                ),
                (
                  _AdminDestination.campaigns,
                  Icons.campaign_outlined,
                  'Campaigns'
                ),
                (
                  _AdminDestination.payments,
                  Icons.payments_outlined,
                  'Payments'
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
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: TS.surfaceSoftOf(context),
                  borderRadius: BorderRadius.circular(TS.controlRadius),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.verified_user,
                      color: TS.greenOf(context),
                      size: 19,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        accountEmail,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

class _AdminOverviewScreen extends StatelessWidget {
  const _AdminOverviewScreen({
    required this.controller,
    required this.overview,
    required this.onSelect,
  });

  final BusinessController controller;
  final BusinessAdminOverview overview;
  final ValueChanged<_AdminDestination> onSelect;

  @override
  Widget build(BuildContext context) {
    final totals = overview.totals;
    final views = overview.businesses.fold<int>(
      0,
      (sum, business) => sum + business.impressions,
    );
    final opens = overview.businesses.fold<int>(
      0,
      (sum, business) => sum + business.opens,
    );
    final saves = overview.businesses.fold<int>(
      0,
      (sum, business) => sum + business.saves,
    );
    final visits = overview.businesses.fold<int>(
      0,
      (sum, business) => sum + business.visits,
    );

    return RefreshIndicator(
      onRefresh: () async {
        await controller.refreshAdminOverview();
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _AdminHero(
            action: FilledButton.icon(
              onPressed: () => onSelect(_AdminDestination.moderation),
              icon: const Icon(Icons.verified_user_outlined),
              label: const Text('Open moderation'),
            ),
            description:
                'Monitor access, content, campaign results, and money received.',
            eyebrow: 'PLATFORM ADMINISTRATION',
            title: 'Business control',
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final columns = constraints.maxWidth >= 760 ? 4 : 2;
              final width =
                  (constraints.maxWidth - ((columns - 1) * 10)) / columns;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _AdminMetric(
                    color: TS.greenOf(context),
                    detail: '${totals.suspendedBusinesses} suspended',
                    icon: Icons.storefront_outlined,
                    label: 'Active businesses',
                    value: _count(totals.activeBusinesses),
                    width: width,
                  ),
                  _AdminMetric(
                    color: TS.red,
                    detail: '${totals.pendingApplications} applications',
                    icon: Icons.verified_user_outlined,
                    label: 'Waiting for review',
                    value: _count(
                      totals.pendingApplications + totals.pendingModeration,
                    ),
                    width: width,
                  ),
                  _AdminMetric(
                    color: const Color(0xff2754b4),
                    detail: '${totals.liveCampaigns} live or scheduled',
                    icon: Icons.campaign_outlined,
                    label: 'Campaigns created',
                    value: _count(totals.campaigns),
                    width: width,
                  ),
                  _AdminMetric(
                    color: const Color(0xff7b4e00),
                    detail: '${totals.paidTransactions} payments',
                    icon: Icons.payments_outlined,
                    label: 'Money received',
                    value: _money(totals.paidCents),
                    width: width,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 720;
              final performance = _AdminPerformanceCard(
                opens: opens,
                saves: saves,
                views: views,
                visits: visits,
                onOpen: () => onSelect(_AdminDestination.campaigns),
              );
              final moderation = _AdminQueueCard(
                applications: totals.pendingApplications,
                publications: totals.pendingModeration,
                onOpen: () => onSelect(_AdminDestination.moderation),
              );
              return wide
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(flex: 3, child: performance),
                        const SizedBox(width: 12),
                        Expanded(flex: 2, child: moderation),
                      ],
                    )
                  : Column(
                      children: [
                        performance,
                        const SizedBox(height: 12),
                        moderation,
                      ],
                    );
            },
          ),
          const SizedBox(height: 18),
          _AdminSectionHeading(
            eyebrow: 'LATEST ACTIVITY',
            title: 'Businesses',
            actionLabel: 'View all',
            onAction: () => onSelect(_AdminDestination.businesses),
          ),
          const SizedBox(height: 8),
          for (final business in overview.businesses.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _BusinessAdminListTile(business: business),
            ),
          if (overview.businesses.isEmpty)
            const _AdminEmpty(
              icon: Icons.storefront_outlined,
              message: 'Approved businesses will appear here.',
            ),
          const SizedBox(height: 14),
          _AdminSectionHeading(
            eyebrow: 'RECENT PUBLISHING',
            title: 'Campaigns and posts',
            actionLabel: 'Monitor all',
            onAction: () => onSelect(_AdminDestination.campaigns),
          ),
          const SizedBox(height: 8),
          for (final campaign in overview.campaigns.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AdminCampaignCard(campaign: campaign),
            ),
          if (overview.campaigns.isEmpty)
            const _AdminEmpty(
              icon: Icons.campaign_outlined,
              message: 'Business content will appear here.',
            ),
        ],
      ),
    );
  }
}

class _AdminBusinessesScreen extends StatefulWidget {
  const _AdminBusinessesScreen({
    required this.controller,
    required this.overview,
  });

  final BusinessController controller;
  final BusinessAdminOverview overview;

  @override
  State<_AdminBusinessesScreen> createState() => _AdminBusinessesScreenState();
}

class _AdminBusinessesScreenState extends State<_AdminBusinessesScreen> {
  String _query = '';
  String _status = 'all';

  @override
  Widget build(BuildContext context) {
    final businesses = widget.overview.businesses.where((business) {
      final query = _query.trim().toLowerCase();
      final matchesQuery = query.isEmpty ||
          '${business.name} ${business.ownerName} ${business.category ?? ''}'
              .toLowerCase()
              .contains(query);
      return matchesQuery && (_status == 'all' || business.status == _status);
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _AdminHero(
          description:
              'See each business, its plan, campaigns, payments, and access state.',
          eyebrow: 'ACCESS AND ACCOUNT HEALTH',
          title: 'Businesses',
        ),
        const SizedBox(height: 14),
        TextField(
          onChanged: (value) => setState(() => _query = value),
          decoration: const InputDecoration(
            labelText: 'Search businesses',
            hintText: 'Business or owner',
            prefixIcon: Icon(Icons.search),
          ),
        ),
        const SizedBox(height: 10),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'all', label: Text('All')),
            ButtonSegment(value: 'active', label: Text('Active')),
            ButtonSegment(value: 'suspended', label: Text('Suspended')),
          ],
          selected: {_status},
          onSelectionChanged: (selection) =>
              setState(() => _status = selection.first),
        ),
        const SizedBox(height: 14),
        for (final business in businesses)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _AdminBusinessCard(
              business: business,
              busy: widget.controller.busy,
              onStatus: () => _changeStatus(business),
            ),
          ),
        if (businesses.isEmpty)
          const _AdminEmpty(
            icon: Icons.storefront_outlined,
            message: 'No businesses match this view.',
          ),
      ],
    );
  }

  Future<void> _changeStatus(BusinessAdminOrganization business) async {
    final next = business.isActive ? 'suspended' : 'active';
    final action = business.isActive ? 'Suspend' : 'Reopen';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('$action ${business.name}?'),
        content: Text(
          business.isActive
              ? 'The owners will lose business workspace access until you reopen it.'
              : 'Approved owners with an active subscription will regain workspace access.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(action),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await widget.controller.setBusinessStatus(business, next);
    }
  }
}

class _AdminModerationScreen extends StatefulWidget {
  const _AdminModerationScreen({
    required this.controller,
    required this.overview,
  });

  final BusinessController controller;
  final BusinessAdminOverview overview;

  @override
  State<_AdminModerationScreen> createState() => _AdminModerationScreenState();
}

class _AdminModerationScreenState extends State<_AdminModerationScreen> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    if (widget.controller.adminApplications == null ||
        widget.controller.adminPublicationQueue == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.controller.loadAdminModeration();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final applications = widget.controller.adminApplications;
    final publications = widget.controller.adminPublicationQueue;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _AdminHero(
          action: _AdminQueueBadge(
            value: widget.overview.totals.pendingApplications +
                widget.overview.totals.pendingModeration,
          ),
          description:
              'Approve trusted businesses and inspect every publication before it reaches shoppers.',
          eyebrow: 'APPLICATIONS AND CONTENT',
          title: 'Moderation',
        ),
        const SizedBox(height: 14),
        SegmentedButton<int>(
          segments: [
            ButtonSegment(
              value: 0,
              icon: const Icon(Icons.storefront_outlined),
              label: Text(
                'Applications ${widget.overview.totals.pendingApplications}',
              ),
            ),
            ButtonSegment(
              value: 1,
              icon: const Icon(Icons.campaign_outlined),
              label: Text(
                'Publications ${widget.overview.totals.pendingModeration}',
              ),
            ),
          ],
          selected: {_tab},
          onSelectionChanged: (selection) =>
              setState(() => _tab = selection.first),
        ),
        const SizedBox(height: 14),
        if (applications == null || publications == null)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(36),
              child: CircularProgressIndicator(),
            ),
          )
        else if (_tab == 0) ...[
          for (final application in applications)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _ApplicationReviewCard(
                application: application,
                busy: widget.controller.busy,
                onDecision: (decision) =>
                    _reviewApplication(application, decision),
              ),
            ),
          if (applications.isEmpty)
            const _AdminEmpty(
              icon: Icons.verified_outlined,
              message: 'No business applications are waiting.',
            ),
        ] else ...[
          for (final publication in publications)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _PublicationReviewCard(
                publication: publication,
                busy: widget.controller.busy,
                onDecision: (decision) =>
                    _reviewPublication(publication, decision),
              ),
            ),
          if (publications.isEmpty)
            const _AdminEmpty(
              icon: Icons.verified_outlined,
              message: 'No publications are waiting.',
            ),
        ],
      ],
    );
  }

  Future<void> _reviewApplication(
    BusinessAdminApplication application,
    String decision,
  ) async {
    final note = await _reviewNote(
      title: decision == 'approved'
          ? 'Approve ${application.organisationName}'
          : 'Reject ${application.organisationName}',
      requireNote: decision != 'approved',
    );
    if (!mounted || note == null) return;
    await widget.controller.reviewAdminApplication(
      application,
      decision,
      note: note,
    );
  }

  Future<void> _reviewPublication(
    BusinessPublication publication,
    String decision,
  ) async {
    final note = await _reviewNote(
      title: switch (decision) {
        'approved' => 'Approve ${publication.title}',
        'changes_requested' => 'Request changes',
        _ => 'Reject ${publication.title}',
      },
      requireNote: decision != 'approved',
    );
    if (!mounted || note == null) return;
    await widget.controller.reviewAdminPublication(
      publication,
      decision,
      note: note,
    );
  }

  Future<String?> _reviewNote({
    required String title,
    required bool requireNote,
  }) async {
    final controller = TextEditingController();
    final result = await showDialog<String?>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 1000,
          maxLines: 4,
          decoration: InputDecoration(
            labelText: requireNote ? 'Review note required' : 'Review note',
            hintText: 'Checks completed or instructions for the owner',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final note = controller.text.trim();
              if (requireNote && note.isEmpty) return;
              Navigator.pop(context, note);
            },
            child: const Text('Save decision'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }
}

class _AdminCampaignsScreen extends StatefulWidget {
  const _AdminCampaignsScreen({required this.overview});

  final BusinessAdminOverview overview;

  @override
  State<_AdminCampaignsScreen> createState() => _AdminCampaignsScreenState();
}

class _AdminCampaignsScreenState extends State<_AdminCampaignsScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final campaigns = widget.overview.campaigns.where((campaign) {
      final query = _query.trim().toLowerCase();
      return query.isEmpty ||
          '${campaign.title} ${campaign.organizationName} ${campaign.kind}'
              .toLowerCase()
              .contains(query);
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _AdminHero(
          action: _AdminQueueBadge(value: widget.overview.totals.campaigns),
          description:
              'Track every deal, special, promotion, and post from creation through completion.',
          eyebrow: 'PLATFORM PUBLISHING',
          title: 'Campaigns',
        ),
        const SizedBox(height: 14),
        TextField(
          onChanged: (value) => setState(() => _query = value),
          decoration: const InputDecoration(
            labelText: 'Search campaigns',
            hintText: 'Campaign or business',
            prefixIcon: Icon(Icons.search),
          ),
        ),
        const SizedBox(height: 14),
        for (final campaign in campaigns)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _AdminCampaignCard(campaign: campaign, detailed: true),
          ),
        if (campaigns.isEmpty)
          const _AdminEmpty(
            icon: Icons.campaign_outlined,
            message: 'No campaigns match this search.',
          ),
      ],
    );
  }
}

class _AdminPaymentsScreen extends StatelessWidget {
  const _AdminPaymentsScreen({required this.overview});

  final BusinessAdminOverview overview;

  @override
  Widget build(BuildContext context) {
    final totals = overview.totals;
    final average = totals.paidTransactions > 0
        ? totals.paidCents ~/ totals.paidTransactions
        : 0;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _AdminHero(
          description:
              'Monitor completed Organisation plan payments connected to approved businesses.',
          eyebrow: 'PAYFAST SETTLEMENT REPORTING',
          title: 'Payments',
        ),
        const SizedBox(height: 14),
        LayoutBuilder(
          builder: (context, constraints) {
            final columns = constraints.maxWidth >= 700 ? 3 : 1;
            final width =
                (constraints.maxWidth - ((columns - 1) * 10)) / columns;
            return Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _PaymentTotalCard(
                  detail: 'Completed PayFast payments',
                  label: 'Total received',
                  value: _money(totals.paidCents),
                  width: width,
                ),
                _PaymentTotalCard(
                  detail: 'Recorded provider events',
                  label: 'Transactions',
                  value: _count(totals.paidTransactions),
                  width: width,
                ),
                _PaymentTotalCard(
                  detail: 'Across business subscriptions',
                  label: 'Average payment',
                  value: _money(average),
                  width: width,
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 14),
        for (final payment in overview.payments)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              margin: EdgeInsets.zero,
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: TS.yellow,
                  foregroundColor: TS.ink,
                  child: Icon(Icons.payments_outlined),
                ),
                title: Text(
                  payment.businessName,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                subtitle: Text(
                  '${_capitalise(payment.planId)} · ${payment.paymentId}\n'
                  '${_date(payment.createdAt)}',
                ),
                isThreeLine: true,
                trailing: Text(
                  _money(payment.amountCents),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ),
        if (overview.payments.isEmpty)
          const _AdminEmpty(
            icon: Icons.payments_outlined,
            message: 'No completed business payments yet.',
          ),
      ],
    );
  }
}

class _AdminHero extends StatelessWidget {
  const _AdminHero({
    required this.description,
    required this.eyebrow,
    required this.title,
    this.action,
  });

  final Widget? action;
  final String description;
  final String eyebrow;
  final String title;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          borderRadius: BorderRadius.circular(TS.cardRadius),
          border: Border.all(color: TS.lineOf(context), width: 2),
          boxShadow: TS.cardFill(context).boxShadow,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(eyebrow, style: TS.eyebrowOf(context)),
                  const SizedBox(height: 4),
                  Text(
                    title,
                    style: Theme.of(context).textTheme.headlineMedium?.merge(
                          TS.display,
                        ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    description,
                    style: TextStyle(color: TS.faintOf(context)),
                  ),
                ],
              ),
            ),
            if (action != null) ...[
              const SizedBox(width: 12),
              action!,
            ],
          ],
        ),
      );
}

class _AdminMetric extends StatelessWidget {
  const _AdminMetric({
    required this.color,
    required this.detail,
    required this.icon,
    required this.label,
    required this.value,
    required this.width,
  });

  final Color color;
  final String detail;
  final IconData icon;
  final String label;
  final String value;
  final double width;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(13),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: color),
                const SizedBox(height: 12),
                Text(
                  label,
                  style: TextStyle(
                    color: TS.faintOf(context),
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                ),
                Text(
                  detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: TS.faintOf(context),
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _AdminPerformanceCard extends StatelessWidget {
  const _AdminPerformanceCard({
    required this.opens,
    required this.saves,
    required this.views,
    required this.visits,
    required this.onOpen,
  });

  final int opens;
  final int saves;
  final int views;
  final int visits;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final openRate = views > 0 ? ((opens / views) * 100).round() : 0;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('SHOPPER RESPONSE', style: TS.eyebrowOf(context)),
                      const Text(
                        'Campaign performance',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.insights_outlined, size: 28),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              '$openRate%',
              style:
                  Theme.of(context).textTheme.displaySmall?.merge(TS.display),
            ),
            Text(
              'open rate',
              style: TextStyle(color: TS.faintOf(context)),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(child: _MiniResult(label: 'Views', value: views)),
                Expanded(child: _MiniResult(label: 'Saves', value: saves)),
                Expanded(child: _MiniResult(label: 'Visits', value: visits)),
              ],
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: onOpen,
              icon: const Icon(Icons.arrow_forward),
              label: const Text('Inspect campaigns'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminQueueCard extends StatelessWidget {
  const _AdminQueueCard({
    required this.applications,
    required this.publications,
    required this.onOpen,
  });

  final int applications;
  final int publications;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('SAFETY QUEUE', style: TS.eyebrowOf(context)),
              const Text(
                'Moderation',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 14),
              _QueueRow(
                label: 'Business applications',
                value: applications,
              ),
              const SizedBox(height: 8),
              _QueueRow(
                label: 'Publications',
                value: publications,
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: onOpen,
                icon: const Icon(Icons.arrow_forward),
                label: const Text('Review queue'),
              ),
            ],
          ),
        ),
      );
}

class _QueueRow extends StatelessWidget {
  const _QueueRow({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: TS.surfaceSoftOf(context),
          borderRadius: BorderRadius.circular(TS.controlRadius),
        ),
        child: Row(
          children: [
            Text(
              '$value',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(label)),
          ],
        ),
      );
}

class _MiniResult extends StatelessWidget {
  const _MiniResult({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(color: TS.faintOf(context), fontSize: 10),
          ),
          Text(
            _count(value),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
          ),
        ],
      );
}

class _AdminSectionHeading extends StatelessWidget {
  const _AdminSectionHeading({
    required this.eyebrow,
    required this.title,
    required this.actionLabel,
    required this.onAction,
  });

  final String actionLabel;
  final String eyebrow;
  final VoidCallback onAction;
  final String title;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(eyebrow, style: TS.eyebrowOf(context)),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onAction,
            child: Text(actionLabel),
          ),
        ],
      );
}

class _BusinessAdminListTile extends StatelessWidget {
  const _BusinessAdminListTile({required this.business});

  final BusinessAdminOrganization business;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: TS.yellow,
            foregroundColor: TS.ink,
            child: Text(
              business.name.isEmpty ? 'B' : business.name[0].toUpperCase(),
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
          title: Text(
            business.name,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          subtitle: Text(
            '${business.ownerName} · ${business.campaigns} campaigns\n'
            '${_count(business.impressions)} views · ${_money(business.paidCents)} paid',
          ),
          isThreeLine: true,
          trailing: _StateChip(active: business.isActive),
        ),
      );
}

class _AdminBusinessCard extends StatelessWidget {
  const _AdminBusinessCard({
    required this.business,
    required this.busy,
    required this.onStatus,
  });

  final BusinessAdminOrganization business;
  final bool busy;
  final VoidCallback onStatus;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    child: Text(
                      business.name.isEmpty
                          ? 'B'
                          : business.name[0].toUpperCase(),
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          business.category ?? 'Business',
                          style: TS.eyebrowOf(context),
                        ),
                        Text(
                          business.name,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          'Owner: ${business.ownerName}',
                          style: TextStyle(color: TS.faintOf(context)),
                        ),
                      ],
                    ),
                  ),
                  _StateChip(active: business.isActive),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _FactChip(
                    label: 'Campaigns',
                    value: '${business.campaigns}',
                  ),
                  _FactChip(
                    label: 'Active',
                    value: '${business.activeCampaigns}',
                  ),
                  _FactChip(
                    label: 'Locations',
                    value: '${business.locations}',
                  ),
                  _FactChip(
                    label: 'Views',
                    value: _count(business.impressions),
                  ),
                  _FactChip(
                    label: 'Saves',
                    value: _count(business.saves),
                  ),
                  _FactChip(
                    label: 'Paid',
                    value: _money(business.paidCents),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_capitalise(business.planId)} plan · '
                      '${business.paidTransactions} payments',
                      style: TextStyle(
                        color: TS.faintOf(context),
                        fontSize: 11,
                      ),
                    ),
                  ),
                  if (business.isActive)
                    OutlinedButton(
                      onPressed: busy ? null : onStatus,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: TS.red,
                      ),
                      child: const Text('Suspend access'),
                    )
                  else
                    FilledButton(
                      onPressed: busy ? null : onStatus,
                      child: const Text('Reopen access'),
                    ),
                ],
              ),
            ],
          ),
        ),
      );
}

class _FactChip extends StatelessWidget {
  const _FactChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: TS.surfaceSoftOf(context),
          borderRadius: BorderRadius.circular(TS.controlRadius),
        ),
        child: Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: '$label ',
                style: TextStyle(
                  color: TS.faintOf(context),
                  fontSize: 10,
                ),
              ),
              TextSpan(
                text: value,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      );
}

class _ApplicationReviewCard extends StatelessWidget {
  const _ApplicationReviewCard({
    required this.application,
    required this.busy,
    required this.onDecision,
  });

  final BusinessAdminApplication application;
  final bool busy;
  final ValueChanged<String> onDecision;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: TS.yellow,
                    foregroundColor: TS.ink,
                    child: Icon(Icons.storefront_outlined),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          application.category ?? 'Business application',
                          style: TS.eyebrowOf(context),
                        ),
                        Text(
                          application.organisationName,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        if (application.tradingName != null)
                          Text('Trading as ${application.tradingName}'),
                      ],
                    ),
                  ),
                  Chip(
                    avatar: Icon(
                      application.businessSubscriptionActive
                          ? Icons.check_circle
                          : Icons.schedule,
                      size: 17,
                    ),
                    label: Text(
                      application.businessSubscriptionActive
                          ? 'Paid'
                          : 'Payment waiting',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(application.description),
              const SizedBox(height: 8),
              Text(
                '${application.contactName} · ${application.contactEmail}\n'
                '${[
                  application.city,
                  application.province
                ].whereType<String>().join(', ')}',
                style: TextStyle(color: TS.faintOf(context)),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: busy ? null : () => onDecision('rejected'),
                    style: OutlinedButton.styleFrom(foregroundColor: TS.red),
                    child: const Text('Reject'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: busy || !application.businessSubscriptionActive
                        ? null
                        : () => onDecision('approved'),
                    icon: const Icon(Icons.check),
                    label: const Text('Approve'),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}

class _PublicationReviewCard extends StatelessWidget {
  const _PublicationReviewCard({
    required this.publication,
    required this.busy,
    required this.onDecision,
  });

  final BusinessPublication publication;
  final bool busy;
  final ValueChanged<String> onDecision;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (publication.imageUrl != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(TS.controlRadius),
                  child: AspectRatio(
                    aspectRatio: 16 / 9,
                    child: Image.network(
                      publication.imageUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const ColoredBox(
                        color: TS.yellow,
                        child: Center(
                          child: Icon(Icons.image_not_supported_outlined),
                        ),
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 10),
              Text(publication.organizationName, style: TS.eyebrowOf(context)),
              Text(
                publication.title,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(publication.bodyText),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  Chip(label: Text(publication.kind.label)),
                  Chip(label: Text(publication.placement.label)),
                  if (publication.priceCents != null)
                    Chip(label: Text(_money(publication.priceCents!))),
                ],
              ),
              if (publication.targetUrl != null)
                TextButton.icon(
                  onPressed: () => launchUrl(
                    Uri.parse(publication.targetUrl!),
                    mode: LaunchMode.externalApplication,
                  ),
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Check destination'),
                ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: busy ? null : () => onDecision('rejected'),
                    style: OutlinedButton.styleFrom(foregroundColor: TS.red),
                    child: const Text('Reject'),
                  ),
                  OutlinedButton(
                    onPressed:
                        busy ? null : () => onDecision('changes_requested'),
                    child: const Text('Request changes'),
                  ),
                  FilledButton.icon(
                    onPressed: busy ? null : () => onDecision('approved'),
                    icon: const Icon(Icons.check),
                    label: const Text('Approve'),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}

class _AdminCampaignCard extends StatelessWidget {
  const _AdminCampaignCard({
    required this.campaign,
    this.detailed = false,
  });

  final BusinessAdminCampaign campaign;
  final bool detailed;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (campaign.imageUrl != null)
              AspectRatio(
                aspectRatio: 16 / 9,
                child: Image.network(
                  campaign.imageUrl!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => ColoredBox(
                    color: TS.surfaceSoftOf(context),
                    child: const Center(
                      child: Icon(Icons.image_not_supported_outlined),
                    ),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          campaign.organizationName.toUpperCase(),
                          style: TS.eyebrowOf(context),
                        ),
                      ),
                      _CampaignStatus(status: campaign.status),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    campaign.title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Wrap(
                    spacing: 10,
                    runSpacing: 4,
                    children: [
                      _IconResult(
                        icon: Icons.visibility_outlined,
                        value: _count(campaign.impressions),
                      ),
                      _IconResult(
                        icon: Icons.open_in_new,
                        value: '${_count(campaign.opens)} opens',
                      ),
                      _IconResult(
                        icon: Icons.bookmark_outline,
                        value: '${_count(campaign.saves)} saves',
                      ),
                      _IconResult(
                        icon: Icons.storefront_outlined,
                        value: '${_count(campaign.visits)} visits',
                      ),
                    ],
                  ),
                  if (detailed && campaign.targetUrl != null) ...[
                    const SizedBox(height: 6),
                    TextButton.icon(
                      onPressed: () => launchUrl(
                        Uri.parse(campaign.targetUrl!),
                        mode: LaunchMode.externalApplication,
                      ),
                      icon: const Icon(Icons.open_in_new),
                      label: const Text('Check destination'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      );
}

class _CampaignStatus extends StatelessWidget {
  const _CampaignStatus({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final active = status == 'live' || status == 'scheduled';
    final warning = status == 'submitted';
    final color = active
        ? TS.greenOf(context)
        : warning
            ? const Color(0xff8a6100)
            : TS.faintOf(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        _capitalise(status.replaceAll('_', ' ')),
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _IconResult extends StatelessWidget {
  const _IconResult({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: TS.faintOf(context)),
          const SizedBox(width: 3),
          Text(
            value,
            style: TextStyle(color: TS.faintOf(context), fontSize: 11),
          ),
        ],
      );
}

class _PaymentTotalCard extends StatelessWidget {
  const _PaymentTotalCard({
    required this.detail,
    required this.label,
    required this.value,
    required this.width,
  });

  final String detail;
  final String label;
  final String value;
  final double width;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TS.eyebrowOf(context)),
                const SizedBox(height: 8),
                Text(
                  value,
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 4),
                Text(
                  detail,
                  style: TextStyle(color: TS.faintOf(context), fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      );
}

class _AdminQueueBadge extends StatelessWidget {
  const _AdminQueueBadge({required this.value});

  final int value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
        decoration: BoxDecoration(
          color: TS.yellow,
          borderRadius: BorderRadius.circular(TS.controlRadius),
          border: Border.all(color: TS.ink, width: 2),
        ),
        child: Column(
          children: [
            Text(
              '$value',
              style: const TextStyle(
                color: TS.ink,
                fontSize: 21,
                fontWeight: FontWeight.w900,
              ),
            ),
            const Text(
              'TOTAL',
              style: TextStyle(
                color: TS.ink,
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: .8,
              ),
            ),
          ],
        ),
      );
}

class _StateChip extends StatelessWidget {
  const _StateChip({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = active ? TS.greenOf(context) : TS.red;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            active ? Icons.check_circle : Icons.warning_rounded,
            color: color,
            size: 14,
          ),
          const SizedBox(width: 4),
          Text(
            active ? 'Active' : 'Suspended',
            style: TextStyle(
              color: color,
              fontSize: 9,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminEmpty extends StatelessWidget {
  const _AdminEmpty({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            children: [
              Icon(icon, size: 38, color: TS.faintOf(context)),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.faintOf(context)),
              ),
            ],
          ),
        ),
      );
}

class _AdminMessage extends StatelessWidget {
  const _AdminMessage({
    required this.message,
    required this.onClose,
    this.error = false,
  });

  final bool error;
  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
        child: Material(
          color: error
              ? TS.red.withValues(alpha: .1)
              : TS.greenOf(context).withValues(alpha: .1),
          borderRadius: BorderRadius.circular(TS.controlRadius),
          child: ListTile(
            leading: Icon(
              error ? Icons.warning_rounded : Icons.check_circle,
              color: error ? TS.red : TS.greenOf(context),
            ),
            title: Text(message),
            trailing: IconButton(
              tooltip: 'Dismiss message',
              onPressed: onClose,
              icon: const Icon(Icons.close),
            ),
          ),
        ),
      );
}

class _AdminUnavailable extends StatelessWidget {
  const _AdminUnavailable({required this.controller});

  final BusinessController controller;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: EmptyCard(
              icon: Icons.warning_amber_rounded,
              message: 'Business reporting is unavailable.',
              action: FilledButton(
                onPressed: controller.refreshAdminOverview,
                child: const Text('Try again'),
              ),
            ),
          ),
        ),
      );
}

String _money(int cents) => 'R${(cents / 100).toStringAsFixed(0)}';

String _count(int value) {
  if (value >= 1000000) {
    return '${(value / 1000000).toStringAsFixed(value >= 10000000 ? 0 : 1)}M';
  }
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(value >= 10000 ? 0 : 1)}K';
  }
  return '$value';
}

String _capitalise(String value) =>
    value.isEmpty ? value : '${value[0].toUpperCase()}${value.substring(1)}';

String _date(String value) {
  final parsed = DateTime.tryParse(value)?.toLocal();
  if (parsed == null) return value;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
}
