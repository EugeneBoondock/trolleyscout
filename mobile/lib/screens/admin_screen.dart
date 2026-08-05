import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, required this.api});

  final Api api;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  late Future<AdminOverview> _future = _loadOverview();
  bool _changingCountry = false;
  bool _refreshingDeals = false;
  String? _lastRefreshSummary;
  int? _storesPending;
  // The member list spans every country until an admin narrows it.
  String _memberCountry = 'ALL';
  String _memberPlan = 'all';
  String _memberSort = 'joined-newest';

  Future<AdminOverview> _loadOverview() => widget.api.adminOverview(
        memberCountry: _memberCountry,
        plan: _memberPlan,
        sort: _memberSort,
      );

  void _reload() => setState(() {
        _future = _loadOverview();
      });

  void _reloadMembers({String? country, String? plan, String? sort}) {
    setState(() {
      if (country != null) _memberCountry = country;
      if (plan != null) _memberPlan = plan;
      if (sort != null) _memberSort = sort;
      _future = _loadOverview();
    });
  }

  Future<void> _refreshDeals() async {
    if (_refreshingDeals) return;
    setState(() => _refreshingDeals = true);
    uxTap();

    // Two separate server routes: the older discovery/deal-site refresh, and
    // the scout lanes (structured retailer feeds plus the online-storefront
    // sweep) that used to be reachable only from the 3-hourly cron. A failure
    // in the older lane must not stop the newer one, so it is reported beside
    // the run summary rather than thrown.
    String? legacyIssue;
    try {
      await widget.api.refreshDealSources();
    } on ApiException catch (error) {
      legacyIssue = error.message;
    } catch (_) {
      legacyIssue = 'The discovery refresh could not run.';
    }

    try {
      final summary = await widget.api.runScoutLanes();
      if (!mounted) return;
      setState(() => _storesPending = summary.storesPending);
      _reportRefresh(legacyIssue == null
          ? summary.message
          : '${summary.message} Discovery refresh: $legacyIssue');
      _reload();
    } on ApiException catch (error) {
      if (mounted) _reportRefresh(error.message);
    } catch (_) {
      if (mounted) _reportRefresh('The scout run could not finish.');
    } finally {
      // Always released, so a failed call can never leave the button spinning.
      if (mounted) setState(() => _refreshingDeals = false);
    }
  }

  void _reportRefresh(String message) {
    setState(() => _lastRefreshSummary = message);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _changeTestCountry(String? countryCode) async {
    if (countryCode == null || _changingCountry) return;
    setState(() => _changingCountry = true);
    try {
      uxTap();
      final overview = await widget.api.setAdminTestCountry(countryCode);
      if (!mounted) return;
      setState(() {
        _future = Future.value(overview);
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content:
              Text('Testing ${overview.selectedCountry.name} across the app.'),
        ));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _changingCountry = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AdminOverview>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Admin data is unavailable.', onRetry: _reload);
        }
        final overview = snapshot.data!;
        return DefaultTabController(
          length: 6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: ScreenHeader(
                  eyebrow: 'Admin',
                  title: 'Admin console',
                  description: 'Accounts, traffic, support, and scout status.',
                ),
              ),
              TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                labelColor: TS.inkOf(context),
                unselectedLabelColor: TS.mutedOf(context),
                indicatorColor: TS.redOf(context),
                tabs: [
                  const Tab(text: 'Overview'),
                  Tab(text: 'Members (${overview.accounts.length})'),
                  const Tab(text: 'Analytics'),
                  const Tab(text: 'Deal reports'),
                  Tab(text: 'Support (${overview.supportOpenCount})'),
                  const Tab(text: 'Business'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    _overviewTab(overview),
                    _membersTab(overview),
                    AdminAnalyticsTab(api: widget.api),
                    DealReportsAdminTab(api: widget.api),
                    _supportTab(overview),
                    _businessTab(),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _overviewTab(AdminOverview overview) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        PaperCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'App test location',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                'Changes stores, deals, compare, and properties for your admin session.',
                style: TextStyle(
                  color: TS.mutedOf(context),
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const Key('admin-test-country'),
                initialValue: overview.selectedCountry.code,
                decoration: const InputDecoration(
                  labelText: 'Country',
                  prefixIcon: Icon(Icons.public),
                ),
                isExpanded: true,
                items: [
                  for (final country in overview.countries)
                    DropdownMenuItem(
                      value: country.code,
                      child: Text('${country.flag} ${country.name}'),
                    ),
                ],
                onChanged: _changingCountry ? null : _changeTestCountry,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            SizedBox(
                width: 170,
                child: MetricCard(
                    label: 'Accounts',
                    value: '${overview.accountCount}',
                    icon: Icons.people_outline)),
            SizedBox(
                width: 170,
                child: MetricCard(
                    label: 'Stored deals',
                    value: '${overview.dealCount}',
                    icon: Icons.local_offer_outlined)),
            SizedBox(
                width: 170,
                child: MetricCard(
                    label: 'Leaflets',
                    value: '${overview.leafletCount}',
                    icon: Icons.menu_book_outlined)),
            SizedBox(
                width: 170,
                child: MetricCard(
                    label: 'Sources',
                    value: '${overview.sourceCount}',
                    icon: Icons.storefront_outlined)),
          ],
        ),
        const SizedBox(height: 16),
        // Stacked, not a row: beside a line of text the button ran out of
        // width on a phone and was pushed off the edge of the card, which
        // read as there being no way to refresh at all.
        PaperCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.sync, color: TS.redOf(context)),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Deal source refresh',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                _lastRefreshSummary ??
                    'Runs discovery, the retailer feeds, and a slice of the '
                        'online-store sweep for '
                        '${overview.selectedCountry.name} now.',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
              ),
              // One press takes a slice, so the count left is the honest
              // answer to "will pressing this again do anything".
              if (_storesPending != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _storesPending == 0
                        ? 'Every ${overview.selectedCountry.name} shop is swept for now.'
                        : '$_storesPending ${overview.selectedCountry.name} '
                            'shop${_storesPending == 1 ? '' : 's'} still to sweep.',
                    style: TextStyle(
                      color: TS.mutedOf(context),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                // A plain FilledButton, not FilledButton.icon: the icon
                // constructor builds a private subclass that byType finders
                // never match, which puts the control out of reach of the
                // tests that guard it.
                child: FilledButton(
                  onPressed: _refreshingDeals ? null : _refreshDeals,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_refreshingDeals)
                        const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        const Icon(Icons.sync, size: 18),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          _refreshingDeals
                              ? 'Refreshing'
                              : 'Fetch ${overview.selectedCountry.name} deals now',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        FittingRoomAdminSection(api: widget.api),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          children: [
            for (final entry in overview.planCounts.entries)
              Chip(label: Text('${entry.key}: ${entry.value}')),
          ],
        ),
      ],
    );
  }

  Widget _membersTab(AdminOverview overview) {
    final countries = overview.memberCountries;
    final total =
        countries.fold<int>(0, (sum, entry) => sum + entry.memberCount);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Accounts',
            style:
                Theme.of(context).textTheme.headlineSmall?.merge(TS.display)),
        const SizedBox(height: 4),
        Text(
          'Every country by default. Tap a card for what a member actually uses '
          'and to set their ceilings.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
        ),
        const SizedBox(height: 12),
        Wrap(
          runSpacing: 8,
          spacing: 8,
          children: [
            SizedBox(
              width: 190,
              child: DropdownButtonFormField<String>(
                key: const Key('admin-member-country'),
                initialValue: _memberCountry,
                decoration: const InputDecoration(labelText: 'Country'),
                isExpanded: true,
                items: [
                  DropdownMenuItem(
                    value: 'ALL',
                    child: Text('All countries${total > 0 ? ' ($total)' : ''}'),
                  ),
                  for (final entry in countries)
                    DropdownMenuItem(
                      value: entry.code,
                      child: Text(
                        '${countryFlag(entry.code)} ${entry.name} (${entry.memberCount})',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (value) => _reloadMembers(country: value ?? 'ALL'),
              ),
            ),
            SizedBox(
              width: 175,
              child: DropdownButtonFormField<String>(
                key: const Key('admin-member-plan'),
                initialValue: _memberPlan,
                decoration: const InputDecoration(labelText: 'Membership'),
                isExpanded: true,
                items: const [
                  DropdownMenuItem(
                      value: 'all', child: Text('All memberships')),
                  DropdownMenuItem(value: 'free', child: Text('Free')),
                  DropdownMenuItem(value: 'scout', child: Text('Scout')),
                  DropdownMenuItem(
                      value: 'household', child: Text('Household')),
                  DropdownMenuItem(
                      value: 'organization', child: Text('Organisation')),
                  DropdownMenuItem(
                      value: 'developers', child: Text('Developers')),
                ],
                onChanged: (value) => _reloadMembers(plan: value ?? 'all'),
              ),
            ),
            SizedBox(
              width: 190,
              child: DropdownButtonFormField<String>(
                key: const Key('admin-member-sort'),
                initialValue: _memberSort,
                decoration: const InputDecoration(labelText: 'Sort'),
                isExpanded: true,
                items: const [
                  DropdownMenuItem(
                      value: 'joined-newest', child: Text('Recently joined')),
                  DropdownMenuItem(
                      value: 'joined-oldest', child: Text('Oldest members')),
                  DropdownMenuItem(
                      value: 'most-active', child: Text('Most active')),
                  DropdownMenuItem(value: 'name', child: Text('Name (A-Z)')),
                ],
                onChanged: (value) =>
                    _reloadMembers(sort: value ?? 'joined-newest'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (overview.accounts.isEmpty)
          Text('No members match these filters.',
              style: TextStyle(color: TS.mutedOf(context)))
        else
          for (final account in overview.accounts)
            _MemberCard(
              key: ValueKey(account.id),
              account: account,
              api: widget.api,
            ),
      ],
    );
  }

  Widget _supportTab(AdminOverview overview) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SupportInboxSection(
          api: widget.api,
          initialMessages: overview.support,
          initialOpenCount: overview.supportOpenCount,
        ),
      ],
    );
  }

  Widget _businessTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OrganizationApplicationReviewSection(api: widget.api),
        const SizedBox(height: 20),
        AdReviewSection(api: widget.api),
      ],
    );
  }
}

class DealReportsAdminTab extends StatefulWidget {
  const DealReportsAdminTab({super.key, required this.api});

  final Api api;

  @override
  State<DealReportsAdminTab> createState() => _DealReportsAdminTabState();
}

class _DealReportsAdminTabState extends State<DealReportsAdminTab> {
  late Future<List<DealReport>> _future = widget.api.adminDealReports();
  final Set<String> _busy = {};

  void _reload() => setState(() => _future = widget.api.adminDealReports());

  Future<void> _review(DealReport report, String status) async {
    setState(() => _busy.add(report.id));
    try {
      final reports = await widget.api.reviewDealReport(report.id, status);
      if (mounted) {
        setState(() {
          _future = Future.value(reports);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(status == 'confirmed'
                  ? 'Issue confirmed.'
                  : 'Report dismissed.')),
        );
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } finally {
      if (mounted) setState(() => _busy.remove(report.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<DealReport>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Deal reports are unavailable.', onRetry: _reload);
        }
        final reports = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Deal accuracy',
              title: 'Shopper reports',
              description:
                  'Check each claim against the saved retailer source before changing a deal.',
            ),
            if (reports.isEmpty)
              const EmptyCard(
                message: 'No deal reports need review.',
                icon: Icons.verified_outlined,
              )
            else
              for (final report in reports)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.flag, color: TS.redOf(context), size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _dealReportReason(report.reason),
                              style:
                                  const TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ),
                          Text(
                            report.countryCode,
                            style: TextStyle(
                                color: TS.mutedOf(context), fontSize: 12),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(report.title,
                          style: Theme.of(context).textTheme.titleMedium),
                      Text(report.retailerName,
                          style: TextStyle(color: TS.mutedOf(context))),
                      if (report.note != null) ...[
                        const SizedBox(height: 8),
                        Text(report.note!),
                      ],
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: () => openExternal(report.sourceUrl),
                            icon: const Icon(Icons.open_in_new, size: 17),
                            label: const Text('Retailer source'),
                          ),
                          OutlinedButton.icon(
                            onPressed: _busy.contains(report.id)
                                ? null
                                : () => _review(report, 'dismissed'),
                            icon: const Icon(Icons.close, size: 17),
                            label: const Text('Dismiss'),
                          ),
                          FilledButton.icon(
                            key: Key('confirm-deal-report-${report.id}'),
                            onPressed: _busy.contains(report.id)
                                ? null
                                : () => _review(report, 'confirmed'),
                            icon: const Icon(Icons.check, size: 17),
                            label: const Text('Confirm issue'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
          ],
        );
      },
    );
  }
}

String _dealReportReason(String reason) => switch (reason) {
      'price_wrong' => 'Price is wrong',
      'expired' => 'Offer has ended',
      'unavailable' => 'Item is unavailable',
      'wrong_item' => 'Wrong item or description',
      _ => 'Other issue',
    };

class OrganizationApplicationReviewSection extends StatefulWidget {
  const OrganizationApplicationReviewSection({
    super.key,
    required this.api,
  });

  final Api api;

  @override
  State<OrganizationApplicationReviewSection> createState() =>
      _OrganizationApplicationReviewSectionState();
}

class _OrganizationApplicationReviewSectionState
    extends State<OrganizationApplicationReviewSection> {
  late Future<List<OrganizationApplication>> _future =
      widget.api.adminOrganizationApplications();
  final Map<String, TextEditingController> _notes = {};
  String? _busyId;

  @override
  void dispose() {
    for (final controller in _notes.values) {
      controller.dispose();
    }
    super.dispose();
  }

  TextEditingController _noteFor(String id) =>
      _notes.putIfAbsent(id, TextEditingController.new);

  void _reload() => setState(() {
        _future = widget.api.adminOrganizationApplications();
      });

  Future<void> _decide(
    OrganizationApplication application,
    String decision,
  ) async {
    setState(() => _busyId = application.id);
    try {
      final result = await widget.api.reviewOrganizationApplication(
        application.id,
        decision,
        note: _noteFor(application.id).text,
      );
      if (!mounted) return;
      setState(() => _future = Future.value(result.applications));
      final message = decision == 'approved'
          ? result.emailSent
              ? 'Business approved. The access email was sent.'
              : result.emailIssue ??
                  'Business approved. The access email still needs to be sent.'
          : 'Application rejected. The review note was saved.';
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Business applications',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.merge(TS.display),
                ),
              ),
              IconButton(
                tooltip: 'Refresh business applications',
                onPressed: _reload,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Confirm the Organisation subscription before approving workspace access.',
            style: TextStyle(color: TS.mutedOf(context), height: 1.4),
          ),
          const SizedBox(height: 10),
          FutureBuilder<List<OrganizationApplication>>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const PaperCard(
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return PaperCard(
                  child: Column(
                    children: [
                      const Text('Business applications are unavailable.'),
                      TextButton(
                          onPressed: _reload, child: const Text('Try again')),
                    ],
                  ),
                );
              }
              final applications = snapshot.data ?? const [];
              if (applications.isEmpty) {
                return const PaperCard(
                  child: Text('No business applications yet.'),
                );
              }
              return Column(
                children: [
                  for (final application in applications)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: PaperCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              spacing: 8,
                              runSpacing: 6,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Text(
                                  application.organisationName,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleLarge
                                      ?.merge(TS.display),
                                ),
                                Chip(label: Text(application.status)),
                                Chip(
                                  avatar: Icon(
                                    application.businessSubscriptionActive
                                        ? Icons.check_circle
                                        : Icons.schedule,
                                    size: 17,
                                  ),
                                  label: Text(
                                    application.businessSubscriptionActive
                                        ? 'Subscription active'
                                        : 'Waiting for subscription',
                                  ),
                                ),
                              ],
                            ),
                            if (application.tradingName != null) ...[
                              const SizedBox(height: 4),
                              Text('Trading as ${application.tradingName}'),
                            ],
                            const SizedBox(height: 8),
                            Text(application.description),
                            const SizedBox(height: 8),
                            Text(
                              '${application.contactName} • ${application.contactEmail}',
                              style: TextStyle(
                                color: TS.mutedOf(context),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (application.reviewNote != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                'Previous note: ${application.reviewNote}',
                                style: TextStyle(color: TS.mutedOf(context)),
                              ),
                            ],
                            const SizedBox(height: 12),
                            TextField(
                              controller: _noteFor(application.id),
                              decoration: const InputDecoration(
                                labelText: 'Review note',
                              ),
                              maxLines: 3,
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                if (application.status == 'pending')
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: _busyId == application.id
                                          ? null
                                          : () =>
                                              _decide(application, 'rejected'),
                                      child: const Text('Reject'),
                                    ),
                                  ),
                                if (application.status == 'pending')
                                  const SizedBox(width: 8),
                                Expanded(
                                  child: FilledButton(
                                    onPressed: _busyId == application.id ||
                                            !application
                                                .businessSubscriptionActive
                                        ? null
                                        : () =>
                                            _decide(application, 'approved'),
                                    child: Text(
                                      _busyId == application.id
                                          ? 'Saving'
                                          : application.status == 'approved'
                                              ? 'Resend access email'
                                              : 'Approve and send access',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      );
}

/// What a member actually does here, and the ceilings an admin can set on it.
/// The access toggles stay on the existing tile, which already owns them.
class _MemberDetailSheet extends StatefulWidget {
  const _MemberDetailSheet({required this.account, required this.api});

  final MemberAccount account;
  final Api api;

  @override
  State<_MemberDetailSheet> createState() => _MemberDetailSheetState();
}

class _MemberDetailSheetState extends State<_MemberDetailSheet> {
  Map<String, dynamic>? _stats;
  String? _error;
  bool _saving = false;
  final _dealsCtl = TextEditingController();
  final _cataloguesCtl = TextEditingController();
  final _messagesCtl = TextEditingController();
  bool _scoutBlocked = false;
  bool _compareBlocked = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _dealsCtl.dispose();
    _cataloguesCtl.dispose();
    _messagesCtl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final stats = await widget.api.adminMemberStats(widget.account.id);
      if (!mounted) return;
      final limits = stats['limits'];
      setState(() {
        _stats = stats;
        if (limits is Map<String, dynamic>) {
          _dealsCtl.text = _limitText(limits['visibleDeals']);
          _cataloguesCtl.text = _limitText(limits['visibleCatalogues']);
          _messagesCtl.text = _limitText(limits['scoutMessagesPerDay']);
          _scoutBlocked = limits['scoutChatBlocked'] == true;
          _compareBlocked = limits['compareBlocked'] == true;
        }
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load this member.');
    }
  }

  String _limitText(Object? value) =>
      value is num && value > 0 ? '${value.toInt()}' : '';

  int? _limitValue(TextEditingController controller) {
    final parsed = int.tryParse(controller.text.trim());
    return parsed != null && parsed > 0 ? parsed : null;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.api.setMemberLimits(
        widget.account.id,
        compareBlocked: _compareBlocked,
        scoutChatBlocked: _scoutBlocked,
        scoutMessagesPerDay: _limitValue(_messagesCtl),
        visibleCatalogues: _limitValue(_cataloguesCtl),
        visibleDeals: _limitValue(_dealsCtl),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Limits saved.')));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not save those limits.')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  int _stat(String key) {
    final value = _stats?[key];
    return value is num ? value.toInt() : 0;
  }

  @override
  Widget build(BuildContext context) {
    final account = widget.account;

    return Padding(
      padding: EdgeInsets.fromLTRB(
          16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${countryFlag(account.countryCode)} ${account.displayName}',
                style:
                    Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
            Text(
                '${account.email} · ${account.countryName} · ${account.planName}',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 12.5)),
            const SizedBox(height: 14),
            if (_error != null)
              Text(_error!, style: TextStyle(color: TS.redOf(context)))
            else if (_stats == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: CircularProgressIndicator()),
              )
            else
              Wrap(
                runSpacing: 10,
                spacing: 10,
                children: [
                  _statTile('Deals viewed', '${_stat('dealViewCount')}'),
                  _statTile(
                      'Properties viewed', '${_stat('propertyViewCount')}'),
                  _statTile('Vouchers viewed', '${_stat('voucherViewCount')}'),
                  _statTile(
                      'Vouchers saved', '${_stat('voucherClaimedCount')}'),
                  _statTile(
                      'Mr Scout messages', '${_stat('scoutMessageCount')}'),
                  _statTile('Saved deals', '${_stat('savedDealCount')}'),
                  _statTile('Basket items', '${_stat('basketItemCount')}'),
                  _statTile(
                      'Saved properties', '${_stat('savedPropertyCount')}'),
                  _statTile(
                      'Window saves', '${_stat('windowShoppingSaveCount')}'),
                  _statTile('Window shopping',
                      _formatDuration(_stat('windowShoppingSeconds'))),
                ],
              ),
            const SizedBox(height: 18),
            Text('Access', style: TS.display.copyWith(fontSize: 16)),
            _MemberAccessTile(api: widget.api, account: account),
            const SizedBox(height: 12),
            Text('Limits', style: TS.display.copyWith(fontSize: 16)),
            Text('Leave a field empty to use whatever the plan allows.',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 12)),
            const SizedBox(height: 8),
            _limitField('Deals visible', _dealsCtl, 'admin-limit-deals'),
            _limitField(
                'Catalogues visible', _cataloguesCtl, 'admin-limit-catalogues'),
            _limitField('Mr Scout messages a day', _messagesCtl,
                'admin-limit-messages'),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Block Mr Scout'),
              value: _scoutBlocked,
              onChanged: (value) => setState(() => _scoutBlocked = value),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Block Compare'),
              value: _compareBlocked,
              onChanged: (value) => setState(() => _compareBlocked = value),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('admin-save-limits'),
                onPressed: _saving
                    ? null
                    : () {
                        _save();
                      },
                child: Text(_saving ? 'Saving...' : 'Save limits'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statTile(String label, String value) => Container(
        width: 150,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          border: Border.all(color: TS.lineSoftOf(context)),
          borderRadius: BorderRadius.circular(TS.controlRadius),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                style:
                    const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            Text(label,
                style: TextStyle(color: TS.mutedOf(context), fontSize: 11.5)),
          ],
        ),
      );

  Widget _limitField(
          String label, TextEditingController controller, String key) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: TextField(
          key: Key(key),
          controller: controller,
          decoration:
              InputDecoration(labelText: label, hintText: 'Plan default'),
          keyboardType: TextInputType.number,
        ),
      );
}

String _formatDuration(int seconds) {
  if (seconds <= 0) return 'None yet';
  final hours = seconds ~/ 3600;
  final minutes = ((seconds % 3600) / 60).round();
  if (hours > 0) return '${hours}h ${minutes}m';
  if (minutes > 0) return '${minutes}m';
  return '${seconds}s';
}

/// A member's card: who they are, where they are, and what they have opened.
/// Tapping it opens the detail sheet with their fuller usage and their limits.
class _MemberCard extends StatelessWidget {
  const _MemberCard({super.key, required this.account, required this.api});

  final MemberAccount account;
  final Api api;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TS.cardRadius),
        side: BorderSide(
          color: account.isBanned ? TS.redOf(context) : TS.lineSoftOf(context),
          width: account.isBanned ? 2 : 1,
        ),
      ),
      child: InkWell(
        key: Key('admin-member-card-${account.id}'),
        borderRadius: BorderRadius.circular(TS.cardRadius),
        onTap: () {
          uxTap();
          showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            builder: (_) => _MemberDetailSheet(account: account, api: api),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(countryFlag(account.countryCode),
                      style: const TextStyle(fontSize: 22)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(account.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style:
                                const TextStyle(fontWeight: FontWeight.w800)),
                        Text('${account.email} · ${account.countryName}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: TS.mutedOf(context), fontSize: 12)),
                      ],
                    ),
                  ),
                  Chip(
                    label: Text(account.planName,
                        style: const TextStyle(fontSize: 11)),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 12,
                runSpacing: 4,
                children: [
                  _countChip('${account.dealViewCount}', 'deals', context),
                  _countChip(
                      '${account.propertyViewCount}', 'properties', context),
                  _countChip(
                      '${account.voucherViewCount}', 'vouchers', context),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Joined ${account.createdAt.split('T').first}'
                '${account.isBanned ? ' · banned' : ''}',
                style: TextStyle(color: TS.mutedOf(context), fontSize: 11.5),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _countChip(String value, String label, BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(width: 3),
          Text(label,
              style: TextStyle(color: TS.mutedOf(context), fontSize: 12)),
        ],
      );
}

/// One member row with a Properties Scout access toggle. Household plans and
/// admins always have access via their plan/role, so the toggle only appears for
/// other members; granting one flips their access on immediately.
class _MemberAccessTile extends StatefulWidget {
  const _MemberAccessTile({required this.api, required this.account});

  final Api api;
  final MemberAccount account;

  @override
  State<_MemberAccessTile> createState() => _MemberAccessTileState();
}

class _MemberAccessTileState extends State<_MemberAccessTile> {
  late MemberAccount _account = widget.account;
  bool _busy = false;

  @override
  void didUpdateWidget(covariant _MemberAccessTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Resync when a fresh overview supplies a new account object for this id,
    // but never clobber an in-flight optimistic toggle.
    if (!_busy && !identical(widget.account, oldWidget.account)) {
      _account = widget.account;
    }
  }

  bool get _planBased => _account.planId == 'household' || _account.isAdmin;

  Future<void> _toggleBan() async {
    final account = _account;
    final banning = !account.isBanned;
    String reason = '';

    if (banning) {
      // Confirmed, and with a reason: the reason is what the member is shown
      // the next time they try to sign in, so it is never left blank by accident.
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text('Ban ${account.displayName}?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'They are signed out on every device and cannot sign back in. '
                'Their saved deals and history are kept.',
              ),
              const SizedBox(height: 12),
              TextField(
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Reason (shown to them)',
                ),
                maxLength: 280,
                maxLines: 2,
                onChanged: (value) => reason = value,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Ban'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }

    setState(() => _busy = true);
    try {
      uxTap();
      final updated =
          await widget.api.setMemberBanned(account.id, banning, reason: reason);
      if (!mounted) return;
      setState(() => _account = updated);
      showNotice(
        context,
        banning
            ? '${updated.displayName} is banned and signed out everywhere.'
            : '${updated.displayName} can sign in again.',
      );
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } catch (_) {
      if (mounted) showNotice(context, 'Could not update that account.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggle(bool value) async {
    setState(() => _busy = true);
    try {
      uxTap();
      final updated =
          await widget.api.setMemberPropertiesAccess(_account.id, value);
      if (mounted) setState(() => _account = updated);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = _account;
    return PaperCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(child: Text(account.initials)),
            title: Text(account.displayName,
                style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text(
                '${account.email}\nJoined ${account.createdAt.split('T').first}'),
            isThreeLine: true,
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(account.planName),
                Text(account.role, style: TS.eyebrowOf(context)),
              ],
            ),
          ),
          // The two numbers an admin actually asks for about a person: how much
          // they use the app, and whether they are still around.
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              Chip(
                avatar: const Icon(Icons.local_offer_outlined, size: 16),
                label: Text('${account.dealViewCount} deals opened'),
              ),
              Chip(
                avatar: const Icon(Icons.schedule, size: 16),
                label: Text(describeLastSeen(account.lastSeenAt)),
              ),
              if (account.isBanned)
                Chip(
                  avatar: Icon(Icons.block, size: 16, color: TS.redOf(context)),
                  label: Text(
                    account.banReason?.isNotEmpty == true
                        ? 'Banned: ${account.banReason}'
                        : 'Banned',
                    style: TextStyle(color: TS.redOf(context)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Divider(height: 1, color: TS.lineSoftOf(context)),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              children: [
                Icon(Icons.apartment_outlined,
                    size: 18, color: TS.mutedOf(context)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _planBased
                        ? 'Properties Scout, included with plan'
                        : 'Properties Scout access',
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
                  ),
                ),
                if (_planBased)
                  Text('On', style: TS.eyebrowOf(context))
                else if (_busy)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Switch(
                    value: account.propertiesAccess,
                    onChanged: _toggle,
                  ),
              ],
            ),
          ),
          // The owner keeps their own way back in, so no ban control is offered
          // for an admin account at all.
          if (!account.isAdmin) ...[
            const SizedBox(height: 4),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                key: ValueKey('ban-${account.id}'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: account.isBanned
                      ? TS.greenOf(context)
                      : TS.redOf(context),
                  side: BorderSide(
                    color: account.isBanned
                        ? TS.greenOf(context)
                        : TS.redOf(context),
                    width: 2,
                  ),
                ),
                onPressed: _busy ? null : _toggleBan,
                child: Text(account.isBanned ? 'Unban account' : 'Ban account'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// "3 hours ago" answers "are they still around" better than a timestamp does.
String describeLastSeen(String? lastSeenAt) {
  if (lastSeenAt == null || lastSeenAt.isEmpty) return 'Never online';
  final seenAt = DateTime.tryParse(lastSeenAt);
  if (seenAt == null) return 'Never online';
  final minutes = DateTime.now().difference(seenAt.toLocal()).inMinutes;
  if (minutes < 5) return 'Online just now';
  if (minutes < 60) return '$minutes min ago';
  final hours = (minutes / 60).round();
  if (hours < 24) return '$hours hr ago';
  final days = (hours / 24).round();
  if (days < 31) return '$days day${days == 1 ? '' : 's'} ago';
  return lastSeenAt.split('T').first;
}

/// Analytics tab: member numbers from our own database, plus Cloudflare zone
/// traffic when a read token is configured on the server.
class AdminAnalyticsTab extends StatefulWidget {
  const AdminAnalyticsTab({super.key, required this.api});

  final Api api;

  @override
  State<AdminAnalyticsTab> createState() => _AdminAnalyticsTabState();
}

class _AdminAnalyticsTabState extends State<AdminAnalyticsTab> {
  int _windowDays = 30;
  late Future<AdminAnalyticsReport> _future =
      widget.api.adminAnalytics(windowDays: _windowDays);

  void _setWindow(int days) => setState(() {
        _windowDays = days;
        _future = widget.api.adminAnalytics(windowDays: days);
      });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AdminAnalyticsReport>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
            message: 'Analytics are unavailable.',
            onRetry: () => _setWindow(_windowDays),
          );
        }
        final report = snapshot.data!;
        final traffic = report.traffic;

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 7, label: Text('7 days')),
                ButtonSegment(value: 30, label: Text('30 days')),
                ButtonSegment(value: 90, label: Text('90 days')),
              ],
              selected: {_windowDays},
              onSelectionChanged: (selection) => _setWindow(selection.first),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _metric(
                    'Members', '${report.accountCount}', Icons.people_outline),
                _metric('Online today', '${report.activeToday}',
                    Icons.wifi_tethering),
                _metric('Active this week', '${report.activeThisWeek}',
                    Icons.calendar_today_outlined),
                _metric('Deals opened', '${report.dealViewsInWindow}',
                    Icons.local_offer_outlined),
                _metric('Never signed in', '${report.neverSeenCount}',
                    Icons.person_off_outlined),
                _metric('Banned', '${report.bannedCount}', Icons.block),
              ],
            ),
            const SizedBox(height: 16),
            _TrendCard(
                label: 'New members',
                days: report.days,
                values: report.signups),
            const SizedBox(height: 10),
            _TrendCard(
                label: 'Members online',
                days: report.days,
                values: report.activeMembers),
            const SizedBox(height: 10),
            _TrendCard(
                label: 'Deals opened',
                days: report.days,
                values: report.dealViews),
            const SizedBox(height: 20),
            Text('Site traffic',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.merge(TS.display)),
            const SizedBox(height: 8),
            if (!traffic.hasData)
              PaperCard(
                child: Text(
                  traffic.issue ?? 'Cloudflare traffic is not connected yet.',
                  style: TextStyle(color: TS.mutedOf(context), height: 1.4),
                ),
              )
            else ...[
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _metric('Requests', _compact(traffic.requests),
                      Icons.swap_vert_circle_outlined),
                  _metric('Page views', _compact(traffic.pageViews),
                      Icons.description_outlined),
                  _metric('Unique visitors', _compact(traffic.uniques),
                      Icons.person_outline),
                  _metric(
                      'Data served',
                      '${_compact((traffic.bytes / 1048576).round())} MB',
                      Icons.cloud_outlined),
                ],
              ),
              const SizedBox(height: 10),
              _TrendCard(
                label: 'Page views a day',
                days: [for (final day in traffic.days) day.date],
                values: [for (final day in traffic.days) day.pageViews],
              ),
              const SizedBox(height: 10),
              _TrendCard(
                label: 'Unique visitors a day',
                days: [for (final day in traffic.days) day.date],
                values: [for (final day in traffic.days) day.uniques],
              ),
            ],
            const SizedBox(height: 20),
            Text('What they searched for',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.merge(TS.display)),
            const SizedBox(height: 8),
            if (report.topSearches.isEmpty)
              Text('No searches recorded in this window.',
                  style: TextStyle(color: TS.mutedOf(context)))
            else
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final search in report.topSearches)
                    Chip(label: Text('${search.term}: ${search.count}')),
                ],
              ),
          ],
        );
      },
    );
  }

  Widget _metric(String label, String value, IconData icon) => SizedBox(
        width: 170,
        child: MetricCard(label: label, value: value, icon: icon),
      );

  static String _compact(int value) {
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(1)}M';
    }
    if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
    return '$value';
  }
}

/// A bar per day. Hand-drawn rather than pulled from a chart package: the
/// console needs a shape, not a plotting library.
class _TrendCard extends StatelessWidget {
  const _TrendCard({
    required this.label,
    required this.days,
    required this.values,
  });

  final String label;
  final List<String> days;
  final List<int> values;

  @override
  Widget build(BuildContext context) {
    final peak = values.isEmpty
        ? 1
        : values.reduce((a, b) => a > b ? a : b).clamp(1, 1 << 30);
    final total = values.fold<int>(0, (sum, value) => sum + value);

    return PaperCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 14)),
              ),
              Text('$total total · peak $peak',
                  style: TextStyle(color: TS.mutedOf(context), fontSize: 12)),
            ],
          ),
          const SizedBox(height: 10),
          Semantics(
            label: '$label: $total over ${values.length} days',
            child: SizedBox(
              height: 74,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final value in values)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 0.6),
                        child: FractionallySizedBox(
                          heightFactor: (value / peak).clamp(0.02, 1.0),
                          alignment: Alignment.bottomCenter,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: TS.redOf(context),
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(2),
                              ),
                            ),
                          ),
                        ),
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
}

/// The ad approval queue. Pending ads surface first with Approve / Reject
/// actions; approving lets the advertiser pay, rejecting closes the ad.
class AdReviewSection extends StatefulWidget {
  const AdReviewSection({super.key, required this.api});

  final Api api;

  @override
  State<AdReviewSection> createState() => _AdReviewSectionState();
}

class _AdReviewSectionState extends State<AdReviewSection> {
  List<AdSubmission> _ads = const [];
  bool _loading = true;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result = await widget.api.adminAds();
      if (mounted) {
        setState(() {
          _ads = result.ads;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _review(AdSubmission ad, String decision) async {
    if (_busyId != null) return;
    setState(() => _busyId = ad.id);
    try {
      uxTap();
      final result = await widget.api.reviewAd(ad.id, decision);
      if (mounted) setState(() => _ads = result.ads);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = _ads.where((ad) => ad.status == 'pending').toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Ad review (${pending.length} pending)',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.merge(TS.display)),
            ),
            IconButton(
              tooltip: 'Refresh',
              onPressed: _load,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_loading)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text('Loading ads…',
                style: TextStyle(color: TS.mutedOf(context))),
          )
        else if (_ads.isEmpty)
          Text('No ads submitted yet.',
              style: TextStyle(color: TS.mutedOf(context)))
        else
          for (final ad in _ads)
            PaperCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(ad.title,
                            style: const TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 15)),
                      ),
                      Text(ad.status.toUpperCase(),
                          style: TS.eyebrowOf(context)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(ad.bodyText,
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 13)),
                  const SizedBox(height: 4),
                  Text(
                    '${_rand(ad.amountCents)} · ${ad.placement == 'near_me' ? 'Near me' : 'Deals feed'} · '
                    '${ad.reach} people${ad.province != null ? ' · ${ad.province}' : ''}',
                    style: TextStyle(color: TS.faintOf(context), fontSize: 12),
                  ),
                  Text(ad.targetUrl,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: TS.redOf(context), fontSize: 12)),
                  if (ad.status == 'pending') ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: TS.green,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius:
                                    BorderRadius.circular(TS.controlRadius),
                              ),
                            ),
                            onPressed: _busyId == ad.id
                                ? null
                                : () => _review(ad, 'approved'),
                            child: const Text('Approve'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: TS.redOf(context),
                              side: BorderSide(
                                  color: TS.redOf(context), width: 2),
                              shape: RoundedRectangleBorder(
                                borderRadius:
                                    BorderRadius.circular(TS.controlRadius),
                              ),
                            ),
                            onPressed: _busyId == ad.id
                                ? null
                                : () => _review(ad, 'rejected'),
                            child: const Text('Reject'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
      ],
    );
  }

  String _rand(int cents) {
    final amount = cents / 100;
    return 'R${amount == amount.roundToDouble() ? amount.toStringAsFixed(0) : amount.toStringAsFixed(2)}';
  }
}

/// The support inbox: bug reports, errors, and feature requests submitted from
/// About & help. Open messages sort first; resolving keeps them in the list so
/// context isn't lost mid-review.
class SupportInboxSection extends StatefulWidget {
  const SupportInboxSection({
    super.key,
    required this.api,
    required this.initialMessages,
    required this.initialOpenCount,
  });

  final Api api;
  final List<SupportMessage> initialMessages;
  final int initialOpenCount;

  @override
  State<SupportInboxSection> createState() => _SupportInboxSectionState();
}

class _SupportInboxSectionState extends State<SupportInboxSection> {
  late List<SupportMessage> _messages = widget.initialMessages;
  late int _openCount = widget.initialOpenCount;
  String? _busyId;

  Future<void> _setStatus(SupportMessage message, String status) async {
    if (_busyId != null) return;
    setState(() => _busyId = message.id);
    try {
      uxTap();
      final overview =
          await widget.api.setSupportMessageStatus(message.id, status);
      if (mounted) {
        setState(() {
          _messages = overview.support;
          _openCount = overview.supportOpenCount;
        });
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } catch (_) {
      if (mounted) {
        showNotice(context, 'Could not update that support message.');
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Support inbox ($_openCount open)',
            style:
                Theme.of(context).textTheme.headlineSmall?.merge(TS.display)),
        const SizedBox(height: 8),
        if (_messages.isEmpty)
          Text('No support messages yet.',
              style: TextStyle(color: TS.mutedOf(context)))
        else
          for (final message in _messages)
            PaperCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          message.topic.isEmpty ? 'Message' : message.topic,
                          style: const TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 15),
                        ),
                      ),
                      Text(
                        message.isOpen ? 'OPEN' : 'RESOLVED',
                        style: TextStyle(
                          color: message.isOpen
                              ? TS.redOf(context)
                              : TS.greenOf(context),
                          fontWeight: FontWeight.w900,
                          fontSize: 11,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${message.name} · ${message.email} · '
                    '${message.createdAt.split('T').first}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
                  ),
                  // The AI brief for a chat-filed report sits above the
                  // member's own words, never in place of them.
                  if (message.aiBrief != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: TS.surfaceSoftOf(context),
                        border: Border.all(
                            color: TS.lineSoftOf(context), width: 1.5),
                        borderRadius: BorderRadius.circular(TS.controlRadius),
                      ),
                      child: Text(
                        message.aiBrief!,
                        style: const TextStyle(fontSize: 12.5, height: 1.4),
                      ),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(message.message),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: message.isOpen
                        ? FilledButton(
                            onPressed: _busyId == message.id
                                ? null
                                : () => _setStatus(message, 'resolved'),
                            child: const Text('Mark resolved'),
                          )
                        : OutlinedButton(
                            onPressed: _busyId == message.id
                                ? null
                                : () => _setStatus(message, 'open'),
                            child: const Text('Reopen'),
                          ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

/// The fitting-room kill switches: one global toggle, plus per-member
/// overrides that outrank it either way.
class FittingRoomAdminSection extends StatefulWidget {
  const FittingRoomAdminSection({super.key, required this.api});

  final Api api;

  @override
  State<FittingRoomAdminSection> createState() =>
      _FittingRoomAdminSectionState();
}

class _FittingRoomAdminSectionState extends State<FittingRoomAdminSection> {
  // Loaded on first expand rather than with the overview, so the console does
  // not pay for a flags read the admin may never look at.
  Future<VtonFlags>? _future;
  bool _expanded = false;
  final _accountController = TextEditingController();
  bool _saving = false;

  void _setExpanded(bool expanded) {
    setState(() {
      _expanded = expanded;
      _future ??= expanded ? widget.api.adminVtonFlags() : null;
    });
  }

  @override
  void dispose() {
    _accountController.dispose();
    super.dispose();
  }

  Future<void> _apply(Future<VtonFlags> Function() change) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final flags = await change();
      if (mounted) setState(() => _future = Future.value(flags));
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    } catch (_) {
      if (mounted) {
        showNotice(context, 'The fitting room setting could not be saved.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setOverride(bool enabled) async {
    final accountId = _accountController.text.trim();
    if (accountId.isEmpty) {
      showNotice(context, 'Enter the member account id first.');
      return;
    }
    await _apply(
        () => widget.api.setVtonFlag(enabled: enabled, accountId: accountId));
    if (mounted) _accountController.clear();
  }

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            key: const Key('vton-section-toggle'),
            onTap: () => _setExpanded(!_expanded),
            child: Row(
              children: [
                Icon(Icons.checkroom_outlined, color: TS.redOf(context)),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Fitting room',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  color: TS.mutedOf(context),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'The virtual try-on kill switch. A per-member override outranks '
            'the global switch either way.',
            style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
          ),
          if (_expanded) ...[
            const SizedBox(height: 8),
            FutureBuilder<VtonFlags>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: LinearProgressIndicator(minHeight: 3),
                );
              }
              if (snapshot.hasError || snapshot.data == null) {
                return Row(
                  children: [
                    const Expanded(
                        child:
                            Text('The fitting room flags are unavailable.')),
                    TextButton(
                      onPressed: () => setState(
                          () => _future = widget.api.adminVtonFlags()),
                      child: const Text('Retry'),
                    ),
                  ],
                );
              }
              final flags = snapshot.data!;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SwitchListTile(
                    key: const Key('vton-global-switch'),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Open to members',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                      flags.globalEnabled
                          ? 'Scout members can use the fitting room.'
                          : 'The fitting room is switched off for everyone '
                              'without an override.',
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 12),
                    ),
                    value: flags.globalEnabled,
                    onChanged: _saving
                        ? null
                        : (enabled) => _apply(
                            () => widget.api.setVtonFlag(enabled: enabled)),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    key: const Key('vton-override-account'),
                    controller: _accountController,
                    decoration: const InputDecoration(
                      labelText: 'Member account id',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _saving ? null : () => _setOverride(true),
                          child: const Text('Allow member'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton(
                          onPressed:
                              _saving ? null : () => _setOverride(false),
                          child: const Text('Block member'),
                        ),
                      ),
                    ],
                  ),
                  for (final override in flags.overrides)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      leading: Icon(
                        override.enabled
                            ? Icons.check_circle_outline
                            : Icons.block_outlined,
                        color: override.enabled
                            ? TS.greenOf(context)
                            : TS.redOf(context),
                        size: 20,
                      ),
                      title: Text(override.accountId,
                          overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                          override.enabled ? 'Allowed' : 'Blocked',
                          style: TextStyle(
                              color: TS.mutedOf(context), fontSize: 12)),
                    ),
                ],
              );
            },
            ),
          ],
        ],
      ),
    );
  }
}
