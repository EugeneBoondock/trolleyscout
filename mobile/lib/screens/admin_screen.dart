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
  late Future<AdminOverview> _future = widget.api.adminOverview();
  bool _changingCountry = false;
  bool _refreshingDeals = false;
  String? _lastRefreshSummary;
  int? _storesPending;

  void _reload() => setState(() {
        _future = widget.api.adminOverview();
      });

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
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Admin',
              title: 'Admin console',
              description: 'Accounts, plans, and scout status.',
            ),
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
            Wrap(
              spacing: 8,
              children: [
                for (final entry in overview.planCounts.entries)
                  Chip(label: Text('${entry.key}: ${entry.value}')),
              ],
            ),
            const SizedBox(height: 20),
            OrganizationApplicationReviewSection(api: widget.api),
            const SizedBox(height: 20),
            SupportInboxSection(
              api: widget.api,
              initialMessages: overview.support,
              initialOpenCount: overview.supportOpenCount,
            ),
            const SizedBox(height: 20),
            AdReviewSection(api: widget.api),
            const SizedBox(height: 20),
            Text('Recent accounts',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.merge(TS.display)),
            const SizedBox(height: 8),
            if (overview.accounts.isEmpty)
              Text('No accounts yet.',
                  style: TextStyle(color: TS.mutedOf(context)))
            else
              for (final account in overview.accounts)
                _MemberAccessTile(
                    key: ValueKey(account.id),
                    api: widget.api,
                    account: account),
          ],
        );
      },
    );
  }
}

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

/// One member row with a Properties Scout access toggle. Household plans and
/// admins always have access via their plan/role, so the toggle only appears for
/// other members; granting one flips their access on immediately.
class _MemberAccessTile extends StatefulWidget {
  const _MemberAccessTile(
      {super.key, required this.api, required this.account});

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
                              shape: const RoundedRectangleBorder(),
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
                              shape: const RoundedRectangleBorder(),
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
