import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/business/business_api.dart';
import 'package:trolley_scout/business/business_app.dart';
import 'package:trolley_scout/business/business_controller.dart';
import 'package:trolley_scout/business/business_models.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows the business sign-in experience for a signed-out owner',
      (tester) async {
    final api = _FakeBusinessApi(authenticated: false);
    await _pumpBusiness(tester, api);

    expect(find.text('Run your storefront'), findsOneWidget);
    expect(find.text('Open your workspace'), findsOneWidget);
    expect(find.byKey(const ValueKey('business-auth-submit')), findsOneWidget);
    expect(find.textContaining('Subscribe and apply in Trolley Scout'),
        findsOneWidget);
    expect(find.text('Create account'), findsNothing);
    expect(find.text('Marketplace'), findsNothing);
  });

  testWidgets('opens an approved organization on the business overview',
      (tester) async {
    final api = _FakeBusinessApi();
    await _pumpBusiness(tester, api);

    expect(find.textContaining('Good '), findsOneWidget);
    expect(find.text('Live now'), findsOneWidget);
    expect(find.text('1.2K'), findsOneWidget);

    await tester.tap(find.text('Content').last);
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('Publishing workspace'.toUpperCase()), findsOneWidget);
    expect(find.text('Family braai box'), findsOneWidget);
  });

  testWidgets('creates a draft from the mobile composer', (tester) async {
    final api = _FakeBusinessApi();
    await _pumpBusiness(tester, api);

    await tester.tap(find.text('Create').last);
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('Create publication'), findsOneWidget);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Weekend potato deal');
    await tester.enterText(
      fields.at(1),
      'Five kilograms of potatoes available this weekend.',
    );
    final save = find.byKey(const ValueKey('business-save-draft'));
    await tester.scrollUntilVisible(
      save,
      700,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('business-composer-scroll')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pump();
    await tester.tap(save);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(api.lastSaved?.title, 'Weekend potato deal');
    expect(find.text('Content'), findsWidgets);
  });

  testWidgets('switches the business shell between light and dark themes',
      (tester) async {
    final api = _FakeBusinessApi();
    final controller = await _pumpBusiness(tester, api);
    expect(
      Theme.of(tester.element(find.byType(Scaffold).first)).brightness,
      Brightness.light,
    );

    await tester.tap(find.byTooltip('Use dark theme'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(controller.themeMode, ThemeMode.dark);
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.dark,
    );
  });

  testWidgets(
      'sends an unapproved owner back to the consumer subscription flow',
      (tester) async {
    final api = _FakeBusinessApi(hasOrganization: false);
    await _pumpBusiness(tester, api);

    expect(find.text('Business access is invitation-only'), findsOneWidget);
    expect(find.text('Submit application'), findsNothing);
    expect(find.text('Overview'), findsNothing);
  });

  testWidgets('opens the shared-account business admin console',
      (tester) async {
    final api = _FakeBusinessApi(isAdmin: true);
    await _pumpBusiness(tester, api);

    expect(find.text('BUSINESS ADMIN'), findsOneWidget);
    expect(find.text('Business control'), findsOneWidget);
    expect(find.text('Active businesses'), findsOneWidget);
    expect(find.text('Money received'), findsOneWidget);
    expect(find.text('Business access is invitation-only'), findsNothing);
  });
}

Future<BusinessController> _pumpBusiness(
  WidgetTester tester,
  _FakeBusinessApi api,
) async {
  final controller = BusinessController(api: api);
  await tester.pumpWidget(
    TrolleyScoutBusinessApp(
      controller: controller,
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 80));
  return controller;
}

class _FakeBusinessApi implements BusinessApiClient {
  _FakeBusinessApi({
    this.authenticated = true,
    this.hasOrganization = true,
    this.isAdmin = false,
  });

  bool authenticated;
  final bool hasOrganization;
  final bool isAdmin;
  BusinessPublicationDraft? lastSaved;

  @override
  Future<BusinessBootstrap> bootstrap() async => BusinessBootstrap(
        session: authenticated
            ? MemberSession(
                isAuthenticated: true,
                account: isAdmin ? _adminAccount : _account,
              )
            : const MemberSession.signedOut(),
        gate: authenticated && hasOrganization && !isAdmin
            ? const BusinessGate(
                applicationStatus: 'approved',
                hasOrganization: true,
                organization: _organization,
              )
            : const BusinessGate(
                applicationStatus: null,
                hasOrganization: false,
              ),
        publications: authenticated && hasOrganization && !isAdmin
            ? [_publication]
            : const [],
        locations: authenticated && hasOrganization && !isAdmin
            ? [_location]
            : const [],
        metrics: authenticated && hasOrganization && !isAdmin
            ? const BusinessMetrics(
                days: [],
                rangeDays: 30,
                totals: BusinessMetricTotals(
                  impressions: 1200,
                  opens: 300,
                  saves: 80,
                  outboundVisits: 40,
                ),
              )
            : BusinessMetrics.empty,
      );

  @override
  Future<MemberSession> authenticate(AuthDraft draft) async {
    authenticated = true;
    return MemberSession(
      isAuthenticated: true,
      account: isAdmin ? _adminAccount : _account,
    );
  }

  @override
  Future<BusinessAdminOverview> adminOverview() async => _adminOverview;

  @override
  Future<List<BusinessAdminApplication>> adminApplications() async =>
      const [_adminApplication];

  @override
  Future<List<BusinessPublication>> adminPublicationQueue() async =>
      const [_submittedPublication];

  @override
  Future<List<BusinessAdminApplication>> reviewAdminApplication(
    String applicationId,
    String decision, {
    String? note,
  }) async =>
      const [];

  @override
  Future<List<BusinessPublication>> reviewAdminPublication(
    String publicationId,
    String decision, {
    String? note,
  }) async =>
      const [];

  @override
  Future<BusinessAdminOverview> setBusinessStatus(
    String businessId,
    String status,
  ) async =>
      _adminOverview;

  @override
  Future<BusinessPublicationChange> changePublication(
    String publicationId,
    String operation,
  ) async =>
      const BusinessPublicationChange(
        publication: _publication,
        publications: [_publication],
      );

  @override
  Future<BusinessMetrics> metrics(int days) async => BusinessMetrics(
        days: const [],
        rangeDays: days,
        totals: const BusinessMetricTotals(
          impressions: 1200,
          opens: 300,
          saves: 80,
          outboundVisits: 40,
        ),
      );

  @override
  Future<BusinessPublicationChange> savePublication(
    BusinessPublicationDraft draft, {
    String? publicationId,
  }) async {
    lastSaved = draft;
    final saved = BusinessPublication(
      id: publicationId ?? 'org-pub-new',
      organizationId: 'org-1',
      organizationName: 'Kasi Pantry',
      organizationSlug: 'kasi-pantry',
      createdBy: 'member-1',
      status: BusinessPublicationStatus.draft,
      createdAt: '2026-07-26T08:00:00.000Z',
      updatedAt: '2026-07-26T09:00:00.000Z',
      kind: draft.kind,
      placement: draft.placement,
      title: draft.title,
      bodyText: draft.bodyText,
      targetUrl: draft.targetUrl,
      imageUrl: draft.imageUrl,
      imageAlt: draft.imageAlt,
      priceCents: draft.priceCents,
      previousPriceCents: draft.previousPriceCents,
      currencyCode: draft.currencyCode,
      offerText: draft.offerText,
      couponCode: draft.couponCode,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      locationIds: draft.locationIds,
    );
    return BusinessPublicationChange(
      publication: saved,
      publications: [saved, _publication],
    );
  }

  @override
  Future<List<BusinessLocation>> saveLocation(
    BusinessLocationDraft draft, {
    String? locationId,
  }) async =>
      const [_location];

  @override
  Future<MemberSession> signOut() async {
    authenticated = false;
    return const MemberSession.signedOut();
  }

  @override
  Future<BusinessImageUpload> uploadImage(
    String path, {
    required String altText,
  }) async =>
      BusinessImageUpload(
        id: 'media-1',
        key: 'org/media-1.jpg',
        url: 'https://example.com/media-1.jpg',
        altText: altText,
      );
}

const _account = MemberAccount(
  id: 'member-1',
  email: 'owner@example.com',
  displayName: 'Naledi Mokoena',
  initials: 'NM',
  planId: 'free',
  planName: 'Free',
  planStatus: 'active',
  role: 'member',
  propertiesAccess: false,
  createdAt: '2026-07-26T08:00:00.000Z',
  updatedAt: '2026-07-26T08:00:00.000Z',
);

const _adminAccount = MemberAccount(
  id: 'admin-1',
  email: 'admin@trolleyscout.co.za',
  displayName: 'Trolley Scout Admin',
  initials: 'TA',
  planId: 'free',
  planName: 'Free',
  planStatus: 'active',
  role: 'admin',
  propertiesAccess: true,
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-07-26T08:00:00.000Z',
);

const _adminOverview = BusinessAdminOverview(
  businesses: [
    BusinessAdminOrganization(
      activeCampaigns: 2,
      campaigns: 8,
      completedCampaigns: 5,
      createdAt: '2026-06-01T08:00:00.000Z',
      id: 'org-1',
      impressions: 16200,
      locations: 3,
      name: 'Kasi Pantry',
      opens: 4800,
      ownerName: 'Naledi Mokoena',
      paidCents: 349900,
      paidTransactions: 3,
      planId: 'business-growth',
      planStatus: 'active',
      saves: 910,
      slug: 'kasi-pantry',
      status: 'active',
      updatedAt: '2026-07-26T09:00:00.000Z',
      visits: 1200,
      lastCampaignAt: '2026-07-25T09:00:00.000Z',
    ),
  ],
  campaigns: [
    BusinessAdminCampaign(
      createdAt: '2026-07-20T08:00:00.000Z',
      id: 'campaign-1',
      impressions: 6200,
      kind: 'deal',
      opens: 1800,
      organizationId: 'org-1',
      organizationName: 'Kasi Pantry',
      placement: 'both',
      saves: 420,
      soldOut: false,
      status: 'live',
      title: 'Family braai box',
      updatedAt: '2026-07-26T09:00:00.000Z',
      visits: 530,
    ),
  ],
  generatedAt: '2026-07-26T09:00:00.000Z',
  payments: [
    BusinessAdminPayment(
      amountCents: 149900,
      businessId: 'org-1',
      businessName: 'Kasi Pantry',
      createdAt: '2026-07-01T08:00:00.000Z',
      id: 'payment-event-1',
      paymentId: 'payfast-1',
      planId: 'business-growth',
      status: 'COMPLETE',
    ),
  ],
  totals: BusinessAdminTotals(
    activeBusinesses: 12,
    businesses: 14,
    campaigns: 73,
    completedCampaigns: 51,
    liveCampaigns: 17,
    paidCents: 1849900,
    paidTransactions: 21,
    pendingApplications: 3,
    pendingModeration: 6,
    suspendedBusinesses: 2,
  ),
);

const _adminApplication = BusinessAdminApplication(
  businessSubscriptionActive: true,
  contactEmail: 'thabo@example.com',
  contactName: 'Thabo Maseko',
  createdAt: '2026-07-25T08:00:00.000Z',
  description: 'A neighbourhood grocery store.',
  id: 'application-1',
  organisationName: 'Maseko Market',
  status: 'pending',
);

const _submittedPublication = BusinessPublication(
  id: 'org-pub-review',
  organizationId: 'org-1',
  organizationName: 'Kasi Pantry',
  organizationSlug: 'kasi-pantry',
  createdBy: 'member-1',
  status: BusinessPublicationStatus.submitted,
  createdAt: '2026-07-25T08:00:00.000Z',
  updatedAt: '2026-07-26T09:00:00.000Z',
  kind: BusinessPublicationKind.promotion,
  placement: BusinessPublicationPlacement.both,
  title: 'Weekend pantry sale',
  bodyText: 'Save on household staples this weekend.',
);

const _organization = BusinessOrganization(
  id: 'org-1',
  name: 'Kasi Pantry',
  slug: 'kasi-pantry',
  status: 'active',
);

const _publication = BusinessPublication(
  id: 'org-pub-1',
  organizationId: 'org-1',
  organizationName: 'Kasi Pantry',
  organizationSlug: 'kasi-pantry',
  createdBy: 'member-1',
  status: BusinessPublicationStatus.live,
  createdAt: '2026-07-26T08:00:00.000Z',
  updatedAt: '2026-07-26T09:00:00.000Z',
  kind: BusinessPublicationKind.deal,
  placement: BusinessPublicationPlacement.both,
  title: 'Family braai box',
  bodyText: 'A weekend box for four people.',
  currencyCode: 'ZAR',
  locationIds: ['loc-1'],
);

const _location = BusinessLocation(
  id: 'loc-1',
  organizationId: 'org-1',
  name: 'Rosebank store',
  addressLine: '15 Cradock Avenue',
  city: 'Johannesburg',
  province: 'Gauteng',
  countryCode: 'ZA',
  status: 'active',
  createdAt: '2026-07-26T08:00:00.000Z',
  updatedAt: '2026-07-26T09:00:00.000Z',
);
